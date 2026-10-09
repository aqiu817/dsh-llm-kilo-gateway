/**
 * Browser-bundle contract tests.
 *
 * `lib/client.js` is written by hand in the loader's lazy-CJS factory format,
 * because the `clientBundle` tsdown preset that would generate it is not
 * published. Everything a build would normally guarantee is therefore checked
 * here: the registration protocol, the export shape the module system requires,
 * and the slots the settings page claims.
 *
 * The failure this guards against is specific and total: a browser module whose
 * exports lack `apply` is rejected by the client loader with «invalid plugin,
 * expect function or object with an "apply" method», and the whole web UI then
 * renders «Failed to load plugins».
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

/**
 * Evaluate the bundle against a stub module loader.
 *
 * The bundle is a script, not a module: it calls `window.__ModuleLoader__.load`
 * at evaluation time, exactly as the host serves it.
 *
 * @returns {{registration: object, exports: object}} what the bundle registered.
 */
function evaluateBundle() {
  let registration;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: {
      load(value) { registration = value; }
    }
  };
  try {
    // eslint-disable-next-line no-eval -- the bundle is a classic script by design.
    eval(clientSource);
  } finally {
    globalThis.window = previousWindow;
  }
  assert.notEqual(registration, undefined, 'the bundle must register itself with the module loader');
  const exports = registration.factory((specifier) => {
    if (specifier === 'react') return { createElement: () => null, useSyncExternalStore: () => null, useCallback: (f) => f, useState: () => [null, () => {}], useEffect: () => {} };
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { SettingsForm: () => null, Switch: () => null };
    throw new Error(`unexpected external: ${specifier}`);
  });
  return { registration, exports };
}

/**
 * A plugin-context stub covering every service the bundle touches.
 *
 * `get` answers the lazily-resolved remotes services; answering undefined is
 * the deployment-without-remotes case, which the page has to survive rather
 * than park behind a service that need not exist.
 *
 * @param {object} overrides - services `ctx.get(name)` should answer with.
 * @returns the stub context plus the recordings the assertions read.
 */
function stubContext(overrides = {}) {
  const mounted = [];
  const registered = [];
  const watched = [];
  const effects = [];
  return {
    mounted,
    registered,
    watched,
    effects,
    ctx: {
      get: (name) => overrides[name],
      effect(callback, label) { effects.push({ label, callback }); callback(); return () => {}; },
      locale: { register: () => () => {}, bind: () => (key) => key },
      configForms: {
        get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'loading', value: undefined }) }),
        whileServed(namespaces, register) { watched.push(namespaces); return register(new Set()); }
      },
      slots: {
        inject(slot, callback) { mounted.push(slot); callback(); return () => {}; },
        register(options) { registered.push(options); return () => {}; }
      }
    }
  };
}

test('the bundle registers under the package client id the loader resolves', () => {
  const { registration } = evaluateBundle();
  // The host keys its module graph by `<package name>/client`.
  assert.equal(registration.id, `${manifest.name}/client`);
});

test('the bundle exports the plugin face the client loader requires', () => {
  const { exports } = evaluateBundle();
  assert.equal(typeof exports.apply, 'function', 'a module without apply() fails the whole page load');
  assert.ok(Array.isArray(exports.inject));
  assert.deepEqual(exports.inject, ['slots', 'locale', 'configForms']);
});

test('the bundle declares the host services its inject list needs', () => {
  // Each injected service is provided by a package that must be loaded first;
  // `dsh.client.inject` is what orders those package rows.
  const declared = new Set(manifest.dsh.client.inject);
  for (const provider of [
    '@deepseek-ai/dsh-client-ui-renderer', // provides `slots`
    '@deepseek-ai/dsh-client-locale', // provides `locale`
    '@deepseek-ai/dsh-client-ui-settings' // provides `configForms`
  ]) {
    assert.ok(declared.has(provider), `${provider} must be declared in dsh.client.inject`);
  }
});

test('the settings page is mounted into every slot the Plugins page renders', () => {
  const { exports } = evaluateBundle();
  const { ctx, mounted, registered } = stubContext();

  assert.doesNotThrow(() => exports.apply(ctx));

  assert.deepEqual(mounted, ['plugins.bundle.config', 'plugins.row.config', 'plugins.item']);
  // Keyed slots are addressed by bundle name and `<bundle>#<rowId>`; the row id
  // has to match the one cordis.patch.yml declares, or the row's page is empty.
  const byKey = Object.fromEntries(registered.map((entry) => [entry.name + ':' + (entry.key ?? entry.id), entry]));
  assert.ok(byKey[`plugins.bundle.config:${manifest.name}`], 'the bundle detail page must be keyed by package name');
  assert.ok(byKey[`plugins.row.config:${manifest.name}#kilo-gateway`], 'the row page must be keyed by <bundle>#<rowId>');
});

test('every mounted page receives the injected form controller and state feed', () => {
  // `plugins.bundle.config` is rendered without the page's own `form` argument,
  // so the controller has to arrive through the slot's inject face instead. The
  // page's panels read the loopback state through the same face.
  const { exports } = evaluateBundle();
  const { ctx, registered } = stubContext();

  exports.apply(ctx);

  assert.equal(registered.length, 3);
  for (const entry of registered) {
    assert.equal(typeof entry.inject, 'function');
    const face = entry.inject();
    assert.ok(face.kiloForm, 'each mount must receive the same form controller under one prop name');
    assert.ok(face.kiloFeed, 'each mount must receive the shared state feed');
    assert.ok(face.kiloCredentials, 'each mount must receive the credentials handle');
  }
});

test('the settings page is gated on the host serving its namespace', () => {
  const { exports } = evaluateBundle();
  const { ctx, watched } = stubContext();

  exports.apply(ctx);

  assert.equal(watched.length, 3);
  for (const namespaces of watched) {
    assert.deepEqual(namespaces, ['kilo-gateway'], 'a deployment without the host half must show no trace of the page');
  }
});

test('a deployment without the remotes assembly still loads the page', () => {
  // `remote.credentials` is resolved lazily, so its absence must leave the rest
  // of the page intact. Injecting the namespace instead would park all three
  // mounts behind a service a non-web deployment never provides.
  const { exports } = evaluateBundle();
  const { ctx } = stubContext();
  assert.doesNotThrow(() => exports.apply(ctx));
});

test('the credentials handle reports an unreachable namespace instead of throwing', async () => {
  const { exports } = evaluateBundle();
  const credentials = exports.createCredentials(stubContext().ctx);

  assert.equal(credentials.get().available, false, 'no service means the key control reports it cannot write');
  const written = await credentials.write('KILO_API_KEY', 'secret');
  assert.equal(written.ok, false);
  assert.equal(written.unavailable, true);
  assert.equal((await credentials.clear('KILO_API_KEY')).unavailable, true);
});

test('the credentials handle writes and clears through the remotes namespace', async () => {
  const { exports } = evaluateBundle();
  const calls = [];
  let configured = false;
  const handle = exports.createCredentials(
    stubContext({
      'remote.credentials': {
        async describe(refs) {
          calls.push(['describe', refs]);
          return { ok: true, value: Object.fromEntries(refs.map((ref) => [ref, { configured, writable: true }])) };
        },
        async set(ref, value) {
          calls.push(['set', ref, value]);
          configured = true;
          return { ok: true, value: undefined };
        },
        async unset(ref) {
          calls.push(['unset', ref]);
          configured = false;
          return { ok: true, value: undefined };
        }
      }
    }).ctx,
  );

  await handle.read('KILO_API_KEY');
  assert.equal(handle.get().available, true, 'a reachable namespace enables the control');
  assert.equal(handle.get().configured, false);

  assert.equal((await handle.write('KILO_API_KEY', 'the-key')).ok, true);
  assert.equal(handle.get().configured, true, 'a successful write re-reads the reported state');
  assert.deepEqual(calls[1], ['set', 'KILO_API_KEY', 'the-key']);

  assert.equal((await handle.clear('KILO_API_KEY')).ok, true);
  assert.equal(handle.get().configured, false);
});

test('a refused credential write reports the refusal and keeps the state', async () => {
  const { exports } = evaluateBundle();
  const handle = exports.createCredentials(
    stubContext({
      'remote.credentials': {
        async describe() { return { ok: true, value: {} }; },
        async set() { return { ok: false, error: { code: 'credential/rejected', message: 'read-only deployment' } }; },
        async unset() { return { ok: true, value: undefined }; }
      }
    }).ctx,
  );

  const outcome = await handle.write('KILO_API_KEY', 'the-key');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'read-only deployment');
});

test('the page writes its key under the reference the section names', () => {
  const { exports } = evaluateBundle();
  assert.equal(exports.credentialRefOf({ apiKeyEnv: 'MY_KILO_KEY' }), 'MY_KILO_KEY');
  // A blank reference means anonymous access, so the page falls back to the same
  // name its own placeholder offers rather than having nowhere to put the key.
  assert.equal(exports.credentialRefOf({ apiKeyEnv: '' }), exports.DEFAULT_API_KEY_REF);
  assert.equal(exports.credentialRefOf(undefined), exports.DEFAULT_API_KEY_REF);
});

test('the catalog state endpoint is polled alongside the notification one', () => {
  // The page's model list, change log, and token totals all describe one fetch,
  // so the same port serves them; a port edit has to move both.
  assert.match(clientSource, /\/state/, 'the page reads the Host state snapshot');
  assert.match(clientSource, /\/notify/, 'the toast keeps its own payload');
});

test('every rendered string exists in both dictionaries', () => {
  // A key present in one dictionary only renders its own name in the other
  // language, which no test of the Chinese copy alone would catch.
  const { exports: bundleExports } = evaluateBundle();
  const { zh, en } = bundleExports.dictionaries;
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test('the presentation helpers format what the panels show', () => {
  const { exports: bundleExports } = evaluateBundle();
  const { dateText, fill, modalityText, parseWhole, sizeText, timeText, tokenText } = bundleExports.utils;

  assert.equal(fill('at {time} · {missing}', { time: '10:00' }), 'at 10:00 · {missing}');
  assert.equal(fill('no placeholders', {}), 'no placeholders');

  // The schema decides what a draft may be; the control must not silently
  // rewrite what the user typed.
  assert.equal(parseWhole(' 60000 ', 60000), 60000);
  assert.equal(parseWhole('59999', 60000), undefined);
  assert.equal(parseWhole('', 0), undefined);
  assert.equal(parseWhole('1.5', 0), undefined);
  assert.equal(parseWhole('-1', 0), undefined);

  assert.equal(sizeText(200000), '200K');
  assert.equal(sizeText(1000000), '1M');
  assert.equal(sizeText(1310720), '1.3M');
  assert.equal(sizeText(0), '—');
  assert.equal(sizeText(undefined), '—');

  assert.equal(tokenText(1234567), (1234567).toLocaleString());
  assert.equal(tokenText(undefined), '0');
  assert.equal(timeText(0), '');
  assert.equal(modalityText((key) => key, 'image'), 'image', 'an unknown modality falls back to its own name');

  // The catalog states expiries as `YYYY-MM-DD`, which `Number.isFinite` would
  // read as "unusable" and render as a permanent em dash.
  assert.equal(dateText('2026-12-31'), new Date('2026-12-31').toLocaleDateString());
  assert.equal(dateText(undefined), '—');
  assert.equal(dateText(''), '—');
  assert.equal(dateText('not-a-date'), '—');
  // The plugin's own timestamps are epoch milliseconds, so both shapes work.
  assert.equal(dateText(Date.UTC(2026, 11, 31)), new Date(Date.UTC(2026, 11, 31)).toLocaleDateString());
});
