/**
 * Contract tests for the host half against DeepSeek Harness 0.2.x.
 *
 * The plugin used to register its settings section with
 * `settings.installSection(...)`, an API the host removed in 0.1.5 — on 0.2.x
 * that call threw and the plugin's settings were unreachable. Since 0.1.7 the
 * host reflects an activated entry's Config into the settings plane by itself,
 * and it reflects *only* the fields marked `.volatile()`. These tests pin both
 * halves of that contract, so the removed API cannot come back and a field
 * cannot silently lose its `.volatile()` marker (which would drop it from the
 * page without any error).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import z from '@deepseek-ai/schemastery';
import { Config, name, inject, apply } from '../lib/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'lib', 'index.js'), 'utf8');

/** Every field the settings page is expected to expose. */
const EDITABLE_FIELDS = [
  'apiKeyEnv',
  'refreshIntervalMs',
  'notifyPort',
  'notifyOnFirstLoad',
  'maxRetries',
  'requestTimeoutMs'
];

/**
 * The host's `volatileForm` projection (dsh-settings 0.2.x), reproduced here
 * because the installed copy is a plugin-local 0.1.5 build whose exports differ.
 *
 * `describe()` calls this for every active entry and **skips the namespace
 * entirely** when it returns undefined — which is exactly how a schema with no
 * volatile field makes a settings page invisible.
 *
 * @param schema - the plugin's Config schema.
 * @returns the editable-field form, or undefined when no field is volatile.
 */
function volatileForm(schema) {
  if (schema.meta.volatile) return schema;
  if (schema.type === 'object') {
    const dict = Object.fromEntries(
      Object.entries(schema.dict ?? {}).flatMap(([key, child]) => {
        const field = volatileForm(child);
        return field === undefined ? [] : [[key, field]];
      })
    );
    return Object.keys(dict).length === 0 ? undefined : z.object(dict);
  }
  return undefined;
}

test('the settings namespace is served: Config projects a non-empty volatile form', () => {
  const form = volatileForm(Config);
  assert.notEqual(
    form,
    undefined,
    'no volatile field means the host drops the whole namespace and the settings page never appears'
  );
  assert.deepEqual(Object.keys(form.dict ?? {}).sort(), [...EDITABLE_FIELDS].sort());
});

test('every settings-page field is marked volatile', () => {
  for (const field of EDITABLE_FIELDS) {
    assert.equal(
      Config.dict[field].meta.volatile,
      true,
      `${field} must be .volatile() or the settings page silently omits it`
    );
  }
});

test('non-editable fields stay out of the settings page', () => {
  const form = volatileForm(Config);
  for (const field of ['baseURL', 'catalogUrl']) {
    assert.equal(
      form.dict[field],
      undefined,
      `${field} is shell/release-managed and must not be offered for editing`
    );
  }
});

test('volatile fields arrive as reference cells, so every read unwraps them', () => {
  const live = Config({});
  for (const field of EDITABLE_FIELDS) {
    assert.equal(
      typeof live[field].get,
      'function',
      `${field} must reach apply() as a reference cell on 0.2.x`
    );
    assert.equal(Object.isFrozen(live[field]), true);
  }
  // Ordinary fields stay plain: unwrapping is a no-op for them.
  assert.equal(typeof live.baseURL, 'string');
});

test('the removed installSection API is not used', () => {
  assert.doesNotMatch(
    indexSource,
    /installSection/,
    'settings.installSection was removed upstream in 0.1.5; calling it throws and kills the settings entry point'
  );
});

test('the settings namespace is not declared as an injected service', () => {
  // Since 0.1.7 the host reflects Config on its own; waiting for a `settings`
  // service would only add an activation dependency that does not exist.
  assert.deepEqual(inject, ['llm']);
});

test('apply() registers the adapter without touching the settings service', () => {
  const registered = [];
  const disposers = [];
  const events = [];
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    llm: {
      registerAdapter(providers, adapter) { registered.push({ providers, adapter }); },
      registerConfigurableProviders(entries) { registered.push({ entries }); },
      emitAdaptersUpdated() {}
    },
    // The refresh timer is a live interval, so its disposer has to be run or the
    // test process never exits.
    effect(callback) { disposers.push(callback()); return () => {}; },
    on(event) { events.push(event); return () => {}; },
    get() { return undefined; },
    inject() { throw new Error('apply() must not inject services on 0.2.x'); }
  };

  try {
    assert.doesNotThrow(() => apply(ctx, Config({ notifyPort: 0 })));

    assert.deepEqual(registered[0].providers, ['kilo']);
    assert.equal(registered[1].entries[0].settingsNs, 'kilo-gateway');
    assert.equal(registered[1].entries[0].provider, 'kilo');
    // The notification server and the refresh timer both re-read their volatile
    // settings, which the host announces through this event.
    assert.ok(events.includes('loader/volatile-update'));
  } finally {
    for (const dispose of disposers) dispose?.();
  }
});

test('the plugin name is unchanged, since the browser half keys its card by it', () => {
  assert.equal(name, 'kilo-gateway');
});
