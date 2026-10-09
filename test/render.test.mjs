/**
 * Render smoke test.
 *
 * The bundle's other tests check what it registers and exports; this one walks
 * the tree it actually produces. The gap it closes is specific and otherwise
 * invisible: the page has early returns for the loading, unavailable, and
 * summary states, and a hook ordered below one of them throws «rendered fewer
 * hooks than expected» only when that state is reached — which no registration
 * test can observe. Every state is rendered here, and the panels are fed real
 * payloads so the features the user asked for are proven present in the tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

/**
 * A minimal React stub faithful enough to walk *and* to enforce the rule of hooks.
 *
 * `createElement` merges its trailing children into `props.children`, exactly as
 * React does, because the page passes its panels to `SettingsForm` that way.
 * Every hook call is recorded in order, so the same component can be rendered in
 * several states and the sequences compared — which is how a hook placed below an
 * early return is caught, since that render calls one hook fewer than the others.
 * `useState` honors a functional initializer, and the external-store hook returns
 * its snapshot directly, so one call renders the real tree without a DOM.
 *
 * @param {object} log - receives one entry per hook, named by kind.
 * @returns {object} the React surface the bundle requires.
 */
function reactStub(log) {
  const record = (kind) => log.push(kind);
  return {
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), ...(children.length > 0 ? { children } : {}) } }),
    useSyncExternalStore: (_subscribe, getSnapshot) => { record('useSyncExternalStore'); return getSnapshot(); },
    useCallback: (fn) => { record('useCallback'); return fn; },
    useState: (initial) => { record('useState'); return [typeof initial === 'function' ? initial() : initial, () => {}]; },
    useEffect: () => { record('useEffect'); }
  };
}

/**
 * Render an element tree by invoking every function component.
 *
 * Function components are called with their props and their result walked, so
 * a panel that only appears one level down is still seen. The `t` prop and the
 * injected handles are threaded through unchanged.
 *
 * @param {unknown} node - an element, an array of them, or a leaf.
 * @param {object[]} out - accumulator of `{ type, props }` for host elements.
 * @param {Set<string>} components - accumulator of rendered component names.
 * @returns {void}
 */
function renderTree(node, out = [], components = new Set()) {
  if (Array.isArray(node)) {
    for (const child of node) renderTree(child, out, components);
    return { nodes: out, components };
  }
  if (node === null || typeof node !== 'object' || node.type === undefined) return { nodes: out, components };
  if (typeof node.type === 'function') {
    components.add(node.type.name || 'anonymous');
    renderTree(node.type(node.props), out, components);
    return { nodes: out, components };
  }
  out.push({ type: node.type, props: node.props });
  if (node.props?.children !== undefined) renderTree(node.props.children, out, components);
  return { nodes: out, components };
}

/** The injected handles, in the shape `apply()` supplies them. */
function handles({ formState, feedState, credential, t = (key) => key } = {}) {
  return {
    t,
    kiloForm: {
      subscribe: () => () => {},
      getSnapshot: () => formState ?? { status: 'ready', value: {}, revision: 1, writable: true },
      mutate: async () => true
    },
    kiloFeed: {
      subscribe: () => () => {},
      getSnapshot: () => feedState ?? { status: 'ready', state: null, error: null }
    },
    kiloCredentials: {
      get: () => credential ?? { configured: false, writable: true, available: true },
      subscribe: () => () => {},
      read: async () => {},
      write: async () => ({ ok: true }),
      clear: async () => ({ ok: true })
    }
  };
}

/**
 * Evaluate the bundle and capture the page component from its slot registration.
 *
 * The page is not exported — the bundle hands it to the slot registry — so it is
 * taken from there rather than reached directly, which also proves the registry
 * received the component the loader will render.
 *
 * @param {object} [log] - receives one entry per hook call, in order.
 * @returns {Function} the settings-page component.
 */
function loadPage(log = []) {
  let registration;
  const previousWindow = globalThis.window;
  globalThis.window = { __ModuleLoader__: { load(value) { registration = value; } } };
  try {
    // eslint-disable-next-line no-eval -- the bundle is a classic script by design.
    eval(clientSource);
  } finally {
    globalThis.window = previousWindow;
  }
  const bundle = registration.factory((specifier) => {
    if (specifier === 'react') return reactStub(log);
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { SettingsForm: (props) => props.children ?? null, Switch: () => null };
    }
    throw new Error(`unexpected external: ${specifier}`);
  });
  let Page;
  bundle.apply({
    get: () => undefined,
    effect: (cb) => { cb(); return () => {}; },
    locale: { register: () => () => {}, bind: () => (key) => key },
    configForms: {
      get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'loading' }) }),
      whileServed: (_namespaces, register) => register(new Set())
    },
    slots: {
      inject: (_slot, cb) => { cb(); return () => {}; },
      register: (options, Component) => { Page = Component; return () => {}; }
    }
  });
  assert.equal(typeof Page, 'function', 'apply() must register a component, or every slot renders nothing');
  return Page;
}

/**
 * Render the page in one state, collecting the hook calls that render made.
 *
 * @param {object} props - the injected handles for this state.
 * @returns {{tree: unknown, hooks: string[]}} the tree and its hook sequence.
 */
function renderWithHooks(props) {
  const log = [];
  return { tree: loadPage(log)(props), hooks: log };
}

test('the summary view is a one-liner rather than the form', () => {
  // The Plugins page draws the bundle card's one-liner through this view; it has
  // no form and must not construct one.
  const Page = loadPage();
  assert.equal(Page({ ...handles(), view: 'summary' }), 'description');
});

test('every state reaches the same hooks before it branches', () => {
  // The page's own claim is that every hook sits above the early returns. That
  // is checked by comparing hook sequences rather than by reading the source: an
  // early return that skips a hook makes React throw
  // «rendered fewer hooks than expected» when the state changes.
  const loading = renderWithHooks(handles({ formState: { status: 'loading' } }));
  const unavailable = renderWithHooks(handles({ formState: { status: 'unavailable' } }));
  const ready = renderWithHooks(handles());
  const summary = renderWithHooks({ ...handles(), view: 'summary' });

  assert.equal(loading.tree, 'loading');
  assert.equal(unavailable.tree, 'unavailable');
  assert.equal(summary.tree, 'description');

  const count = (result) => result.hooks.length;
  assert.equal(count(loading), count(ready), 'the loading state must run every hook the ready state runs');
  assert.equal(count(unavailable), count(ready), 'the unavailable state must run every hook the ready state runs');
  assert.equal(count(summary), count(ready), 'the summary view must run every hook the ready state runs');
  assert.ok(count(ready) >= 6, `the form declares several hooks; saw ${count(ready)}`);
});

test('every surface the settings page promises is in the rendered tree', () => {
  const Page = loadPage();
  const tree = Page({
    ...handles({
      formState: {
        status: 'ready',
        revision: 3,
        writable: true,
        value: {
          apiKeyEnv: 'KILO_API_KEY',
          refreshIntervalMs: 86400000,
          notifyPort: 9876,
          notifyOnFirstLoad: true,
          maxRetries: 2,
          requestTimeoutMs: 300000
        }
      },
      feedState: {
        status: 'ready',
        error: null,
        state: {
          fetchedAt: Date.now(),
          lastFetchSucceeded: false,
          lastError: 'upstream 500',
          models: [
            {
              id: 'stepfun/step-5-preview-free',
              name: 'Step 5',
              contextLength: 1000000,
              maxCompletionTokens: 64000,
              inputModalities: ['text', 'image'],
              supportsTools: true,
              reasoningLevels: ['low', 'high'],
              mayTrainOnPrompts: true,
              expires: '2026-12-31'
            }
          ],
          changeLog: [{ at: Date.now(), added: [{ id: 'a', name: 'A' }], removed: [], total: 16 }],
          tokenStats: {
            'stepfun/step-5-preview-free': {
              calls: 2,
              inputTokens: 10,
              outputTokens: 5,
              cacheReadTokens: 3,
              cacheWriteTokens: 0,
              reasoningTokens: 1,
              lastUsedAt: Date.now()
            }
          }
        }
      },
      credential: { configured: true, writable: true, available: true }
    })
  });

  const { nodes, components } = renderTree(tree);
  for (const panel of ['ModelsPanel', 'ChangeLogPanel', 'TokenStatsPanel']) {
    assert.ok(components.has(panel), `${panel} must be rendered — it is how the feature reaches the user`);
  }

  const hostTypes = nodes.map((node) => node.type);
  assert.ok(hostTypes.includes('input'), 'the settings form renders its inputs');
  assert.ok(hostTypes.includes('table'), 'the model and token panels render tables');
  assert.ok(hostTypes.includes('button'), 'the key control renders its commit and clear buttons');

  // The key control is write-only: it must be a password input, and the literal
  // must never be pre-filled from anything the host returned.
  const keyInputs = nodes.filter((node) => node.type === 'input' && node.props.type === 'password');
  assert.equal(keyInputs.length, 1, 'exactly one password input stands for the key');
  assert.equal(keyInputs[0].props.value, '', 'the key field must start blank, never echoing a stored secret');
  assert.equal(keyInputs[0].props.autoComplete, 'off');

  // The five editable numeric/bool fields plus the credential reference render
  // as inputs, so a field silently dropped from the form is caught here too.
  assert.ok(hostTypes.filter((type) => type === 'input').length >= 6, 'every editable field renders a control');
});

test('a deployment with no remotes and a dead status endpoint still renders', () => {
  // The bare case: no credentials service to write a key through, and no
  // reachable loopback endpoint. The settings form is unaffected by both.
  const Page = loadPage();
  const tree = Page({
    ...handles({
      formState: { status: 'ready', value: {}, revision: 1, writable: false },
      feedState: { status: 'error', state: null, error: 'ECONNREFUSED', httpStatus: null },
      credential: { configured: false, writable: true, available: false }
    })
  });
  const { nodes, components } = renderTree(tree);
  assert.ok(components.has('ModelsPanel'), 'the model panel renders its unreachable notice');
  assert.ok(nodes.some((node) => node.type === 'input'), 'the settings inputs still render');
  // No credentials service means no key control at all, rather than a dead one.
  assert.equal(nodes.filter((node) => node.type === 'input' && node.props.type === 'password').length, 0);
});

test('the three status faults are told apart, because each needs a different fix', () => {
  // These look alike from the page and are not alike at all:
  //   - port set to 0: not a failure, the endpoint is deliberately off;
  //   - something answering on the port but with no /state: another host holding
  //     the port, or an older build — the port is demonstrably serving requests;
  //   - nothing answering: the port really is closed or the host is not running.
  // Conflating them sends the user to the wrong fix, which is exactly what the
  // original single message did.
  const noticeFor = (feedState) => {
    const Page = loadPage();
    const { nodes } = renderTree(Page({ ...handles({ feedState }) }));
    // The stub collects children into an array, as JSX does. Match the notice
    // keys exactly: the panel's own intro paragraph also begins with "models".
    const NOTICES = ['modelsNotifyOff', 'modelsRouteMissing', 'modelsFetchFailed'];
    const textOf = (node) => {
      const children = node?.props?.children;
      return Array.isArray(children) ? children.join('') : children ?? '';
    };
    const node = nodes.find((n) => NOTICES.includes(String(textOf(n))));
    return textOf(node) || null;
  };

  // Port 0: off by the setting.
  assert.equal(noticeFor({ status: 'error', state: null, error: null, httpStatus: null, serverAlive: false, disabled: true }), 'modelsNotifyOff');

  // /notify answers but /state does not: the second-host / stale-build case.
  assert.equal(noticeFor({ status: 'error', state: null, error: null, httpStatus: 404, serverAlive: true }), 'modelsRouteMissing');
  // The same conclusion when only the status code is known (a 404 the page can
  // now actually read, thanks to the CORS fix).
  assert.equal(noticeFor({ status: 'error', state: null, error: null, httpStatus: 404, serverAlive: false }), 'modelsRouteMissing');

  // Nothing answers at all.
  assert.equal(noticeFor({ status: 'error', state: null, error: 'Failed to fetch', httpStatus: null, serverAlive: false }), 'modelsFetchFailed');
});

test('a transport failure shows its cause, a status code does not need one', () => {
  // The transport message is evidence only when the request never got an answer;
  // alongside a status code it would be meaningless noise.
  const metaTextsFor = (feedState) => {
    const Page = loadPage();
    const { nodes } = renderTree(Page({ ...handles({ feedState }) }));
    return nodes
      .filter((node) => typeof node.props?.className === 'string' && node.props.className.includes('dshKg_meta'))
      .map((node) => (Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? '')));
  };

  const transport = metaTextsFor({ status: 'error', state: null, error: 'Failed to fetch', httpStatus: null, serverAlive: false });
  assert.ok(transport.some((text) => text.includes('Failed to fetch')), 'the transport failure must be visible');

  const withStatus = metaTextsFor({ status: 'error', state: null, error: 'irrelevant', httpStatus: 404, serverAlive: true });
  assert.equal(withStatus.some((text) => text.includes('irrelevant')), false, 'a status-coded failure must not echo a transport message');
});

test('the token summary row is labelled in words, not with a symbol', () => {
  // It shipped as a bare "Σ" in the model column, which reads as a model name —
  // and it was in fact read that way. The label has to be translatable copy.
  const Page = loadPage();
  const { nodes } = renderTree(Page({
    ...handles({
      feedState: {
        status: 'ready',
        error: null,
        state: {
          fetchedAt: Date.now(),
          lastFetchSucceeded: true,
          models: [],
          changeLog: [],
          tokenStats: { 'a/free': { calls: 2, inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, lastUsedAt: Date.now() } }
        }
      }
    })
  }));

  const totalRow = nodes.find((node) => node.type === 'tr' && typeof node.props?.className === 'string' && node.props.className.includes('dshKg_total'));
  assert.ok(totalRow, 'the token table renders a total row');
  const label = nodes.find((node) => node.type === 'td' && String(node.props?.children) === 'tokenStatsTotal');
  assert.ok(label, 'the total row must use the translatable label, not a literal symbol');
  assert.equal(nodes.some((node) => String(node.props?.children) === 'Σ'), false, 'no bare sigma may stand in the model column');
});

test('a model that declares no capability renders without inventing one', () => {
  // The panels must show what the catalog said and nothing more: a model with no
  // tools, no image input, and no reasoning levels is exactly that.
  const Page = loadPage();
  const tree = Page({
    ...handles({
      feedState: {
        status: 'ready',
        error: null,
        state: {
          fetchedAt: Date.now(),
          lastFetchSucceeded: true,
          models: [{ id: 'plain:free', name: 'Plain', contextLength: 8192, maxCompletionTokens: 1024, inputModalities: ['text'], supportsTools: false, reasoningLevels: [], mayTrainOnPrompts: false }],
          changeLog: [],
          tokenStats: {}
        }
      }
    })
  });
  const { nodes } = renderTree(tree);
  // The chips are spans; the capability list for this model is modalities plus a
  // reasoning label, and no tools or training chip.
  const chipText = nodes
    .filter((node) => node.type === 'span' && typeof node.props.className === 'string' && node.props.className.includes('dshKg_chip'))
    .map((node) => JSON.stringify(node.props.children));
  assert.ok(chipText.some((text) => text.includes('reasoningLevels')), 'the reasoning label is always shown');
  assert.equal(chipText.some((text) => text.includes('capTools')), false, 'a model without tools must not show a tools chip');
  assert.equal(chipText.some((text) => text.includes('capTraining')), false, 'a model that does not train must not show the warning chip');
});
