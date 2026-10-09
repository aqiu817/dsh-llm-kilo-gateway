/**
 * Retry-policy and accounting tests.
 *
 * Retrying is the harness's job: `dsh-llm-retry` is mounted in the base bundle
 * and decides from the failure code an adapter reports, together with the
 * budget that adapter's `providerRetryPolicy()` names. That makes the status →
 * code mapping *the* retry policy, and getting it wrong is silent in both
 * directions — a retryable failure classified as fatal ends a turn the user
 * could have completed, and a fatal one classified as retryable spends the
 * budget on a request that can never succeed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { RetryPolicySchema, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { isJsonValue } from '@deepseek-ai/dsh-util-values';

import { apply, failureCodeForStatus, retryAfterMs, resolveVolatile } from '../lib/index.js';
import { accumulateTokenStats, appendChangeLog, tokenStatsOf, CHANGE_LOG_LIMIT } from '../lib/state-util.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The retry plugin's own delay computation, reproduced from
 * `dsh-llm-retry/lib/index.js`.
 *
 * A policy returned by `providerRetryPolicy()` is used **verbatim** — the
 * runtime does `adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(...)`,
 * so it is never merged with the defaults. An omitted `backoff` field therefore
 * survives into this arithmetic as `undefined`, and the result is `NaN`, which
 * the session's lossless-JSON gate then rejects when the retry event is
 * appended. Reproducing the arithmetic here is what makes that visible offline.
 *
 * @param {object} policy - the adapter's policy.
 * @param {number} retry - which attempt this is.
 * @returns {number} the computed delay in milliseconds.
 */
function localDelay(policy, retry = 1, random = () => 0.5) {
  const exponent = Math.min(retry - 1, 1024);
  const exponential = Math.min(policy.initialDelayMs * 2 ** exponent, policy.maxDelayMs);
  const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * random();
  return Math.min(exponential * jitter, policy.maxDelayMs);
}

test('each status maps onto the harness retry vocabulary', () => {
  assert.equal(failureCodeForStatus(400), 'INVALID_REQUEST');
  assert.equal(failureCodeForStatus(401), 'AUTH');
  assert.equal(failureCodeForStatus(402), 'QUOTA');
  assert.equal(failureCodeForStatus(403), 'AUTH');
  assert.equal(failureCodeForStatus(404), 'INVALID_MODEL');
  assert.equal(failureCodeForStatus(408), 'TIMEOUT');
  assert.equal(failureCodeForStatus(422), 'INVALID_REQUEST');
  assert.equal(failureCodeForStatus(429), 'RATE_LIMIT');
  assert.equal(failureCodeForStatus(500), 'SERVER');
  assert.equal(failureCodeForStatus(502), 'SERVER');
  assert.equal(failureCodeForStatus(503), 'SERVER');
  assert.equal(failureCodeForStatus(418), 'PROVIDER_ERROR');
});

test('a retryable failure is never classified as fatal, and the reverse', () => {
  // These two sets are the whole point of the mapping: `dsh-llm-retry` retries
  // the recoverable ones and ends the turn on the rest.
  const retryable = ['RATE_LIMIT', 'SERVER', 'TIMEOUT'];
  const fatal = ['AUTH', 'QUOTA', 'INVALID_MODEL', 'INVALID_REQUEST'];
  for (const status of [429, 500, 502, 503, 504]) {
    assert.ok(retryable.includes(failureCodeForStatus(status)), `HTTP ${status} must be retryable`);
  }
  for (const status of [400, 401, 402, 403, 404, 422]) {
    assert.ok(fatal.includes(failureCodeForStatus(status)), `HTTP ${status} must not be retried`);
  }
});

test('Retry-After is honored in both of the forms an endpoint may use', () => {
  // Seconds is the common spelling; an HTTP date is also legal, and ignoring it
  // would retry into the window the endpoint just asked us to wait out.
  assert.equal(retryAfterMs('30'), 30000);
  assert.equal(retryAfterMs('0.5'), 500);
  assert.equal(retryAfterMs(''), undefined);
  assert.equal(retryAfterMs(null), undefined);
  assert.equal(retryAfterMs('not-a-value'), undefined);
  // A date already in the past means "retry now", which is no delay at all.
  assert.equal(retryAfterMs(new Date(Date.now() - 60000).toUTCString()), undefined);
  const future = retryAfterMs(new Date(Date.now() + 120000).toUTCString());
  assert.ok(future > 110000 && future <= 120000, `expected about 120s, got ${future}`);
});

test('a volatile field reaches apply() as a cell and is read through it', () => {
  // The settings page writes a volatile field in place, so a read that took the
  // value once at activation would never observe a user's edit.
  const cell = { get: () => 'KILO_API_KEY' };
  Object.freeze(cell);
  assert.equal(resolveVolatile(cell), 'KILO_API_KEY');
  assert.equal(resolveVolatile('plain'), 'plain', 'an ordinary field is unwrapped as a no-op');
  assert.equal(resolveVolatile(9876), 9876);
  assert.equal(resolveVolatile(undefined), undefined);
  // An unfrozen object with a `get` is not a reference cell; passing it through
  // keeps an ordinary config object readable.
  const ordinary = { get: () => 'not-a-cell' };
  assert.deepEqual(resolveVolatile(ordinary), ordinary);
});

/** A context stub sufficient for activation. */
function activationContext() {
  const registered = [];
  const disposers = [];
  return {
    registered,
    disposers,
    ctx: {
      logger: { info() {}, warn() {}, error() {} },
      llm: {
        registerAdapter(providers, adapter) { registered.push({ providers, adapter }); },
        registerConfigurableProviders(entries) { registered.push({ entries }); },
        emitAdaptersUpdated() {}
      },
      effect(callback) { disposers.push(callback()); return () => {}; },
      on() { return () => {}; },
      get() { return undefined; },
      inject() { throw new Error('apply() must not inject services'); }
    }
  };
}

test('the adapter retry policy reads its budget live from the setting', () => {
  // The budget is a user setting rather than a constant, so the policy has to
  // report the current value on every ask: the host reads it when a request
  // fails, which is long after activation. The field therefore arrives as a
  // reference cell, and an edit has to be visible without a reload.
  const { ctx, registered, disposers } = activationContext();
  let budgetValue = 5;
  const budget = { get: () => budgetValue };
  Object.freeze(budget);
  try {
    apply(ctx, {
      apiKeyEnv: 'KILO_API_KEY',
      refreshIntervalMs: 86400000,
      notifyPort: 0,
      notifyOnFirstLoad: false,
      maxRetries: budget,
      requestTimeoutMs: 300000
    });
    const adapter = registered[0].adapter;
    assert.equal(typeof adapter.providerRetryPolicy, 'function');

    const policy = adapter.providerRetryPolicy('kilo');
    assert.equal(policy.mode, 'normal');
    assert.equal(policy.maxRetries, 5);
    assert.ok(policy.retryableCodes.includes('RATE_LIMIT'));
    assert.ok(policy.retryableCodes.includes('SERVER'));
    assert.ok(policy.retryableCodes.includes('TIMEOUT'));
    assert.equal(policy.retryableCodes.includes('AUTH'), false, 'a bad key must not be retried');

    // A settings write mutates the host's value in place, so the next ask has
    // to observe it. A policy that read the field once at activation would keep
    // reporting the activation-time budget forever.
    budgetValue = 9;
    assert.equal(adapter.providerRetryPolicy('kilo').maxRetries, 9, 'the budget must be read per ask, not captured');
  } finally {
    for (const dispose of disposers) dispose?.();
  }
});

test('a zero retry budget reaches the policy and disables retrying', () => {
  const { ctx, registered, disposers } = activationContext();
  try {
    apply(ctx, {
      apiKeyEnv: 'KILO_API_KEY',
      refreshIntervalMs: 86400000,
      notifyPort: 0,
      notifyOnFirstLoad: false,
      maxRetries: 0,
      requestTimeoutMs: 300000
    });
    const policy = registered[0].adapter.providerRetryPolicy('kilo');
    assert.equal(policy.maxRetries, 0);
    // Even with the budget spent, the policy still names the codes that would
    // have been retryable, so the host can classify rather than guess.
    assert.ok(policy.retryableCodes.includes('SERVER'));
  } finally {
    for (const dispose of disposers) dispose?.();
  }
});

test('the returned policy is complete enough for the harness to schedule a retry', () => {
  // This is the regression that broke every retry with «session event
  // "llm/retry" carries non-JSON-serializable data». The policy is used
  // verbatim, so a missing backoff field makes `localDelay` compute NaN, and
  // the session's JSON gate rejects the event that carries that delay.
  const { ctx, registered, disposers } = activationContext();
  try {
    apply(ctx, {
      apiKeyEnv: 'KILO_API_KEY',
      refreshIntervalMs: 86400000,
      notifyPort: 0,
      notifyOnFirstLoad: false,
      maxRetries: 3,
      requestTimeoutMs: 300000
    });
    const policy = registered[0].adapter.providerRetryPolicy('kilo');

    // The harness's own schema is the authority on what a policy must carry.
    // It is a schemastery callable (no `.parse`); the flat fields are accepted
    // as input and normalized into its nested `backoff` form.
    assert.doesNotThrow(() => RetryPolicySchema(policy), 'the policy must satisfy the harness schema');

    // `resolveRetryPolicy()` — the shape the runtime actually hands to
    // `localDelay` — is flat, which is the shape this policy has to match.
    const resolved = resolveRetryPolicy(undefined, 'test');
    assert.deepEqual(
      Object.keys(policy).sort(),
      Object.keys(resolved).sort(),
      'the policy must carry exactly the fields a resolved harness policy carries'
    );

    for (const field of ['initialDelayMs', 'maxDelayMs', 'jitterRatio']) {
      assert.equal(typeof policy[field], 'number', `${field} must be present or the retry delay is NaN`);
      assert.ok(Number.isFinite(policy[field]), `${field} must be finite`);
    }
    const delay = localDelay(policy, 1);
    assert.ok(Number.isFinite(delay) && delay > 0, `the scheduled delay must be a real number, got ${delay}`);

    // And the retry event payload as a whole has to clear the same gate that
    // rejected it: a finite delay inside a JSON-serializable object.
    const eventData = {
      retryId: 'r1',
      turn: 1,
      step: 1,
      provider: 'kilo',
      mode: policy.mode,
      policyKey: 'k',
      retry: 1,
      maxRetries: policy.maxRetries,
      delayMs: delay,
      failure: { message: 'upstream failed', code: 'SERVER', status: 500 }
    };
    assert.equal(isJsonValue(eventData), true, 'the llm/retry event payload must be losslessly JSON-serializable');
  } finally {
    for (const dispose of disposers) dispose?.();
  }
});

test('the policy never schedules a delay that would overflow or be non-finite', () => {
  const { ctx, registered, disposers } = activationContext();
  try {
    apply(ctx, {
      apiKeyEnv: 'KILO_API_KEY',
      refreshIntervalMs: 86400000,
      notifyPort: 0,
      notifyOnFirstLoad: false,
      maxRetries: 10,
      requestTimeoutMs: 300000
    });
    const policy = registered[0].adapter.providerRetryPolicy('kilo');
    // A high budget must still produce finite delays: the exponential term is
    // clamped to `maxDelayMs` before it can grow past it.
    for (const retry of [1, 5, 10, 1000]) {
      const delay = localDelay(policy, retry);
      assert.ok(Number.isFinite(delay), `retry ${retry} must not produce a non-finite delay`);
      assert.ok(delay <= policy.maxDelayMs, `retry ${retry} must stay within maxDelayMs`);
    }
  } finally {
    for (const dispose of disposers) dispose?.();
  }
});

test('the default output budget is a budget, not the model capability ceiling', () => {
  // The second live bug: `defaultMaxTokens` was the catalog's
  // `max_completion_tokens`, so a model advertising 460800 had 460800 sent as
  // `max_tokens` on every call, and its upstream rejected that with an opaque
  // 400. `LlmRuntime` turns `defaultMaxTokens` into `maxTokens` when the caller
  // names none, so this value goes on the wire for ordinary calls.
  const source = readFileSync(join(here, '..', 'lib', 'index.js'), 'utf8');
  assert.match(
    source,
    /defaultMaxTokens:\s*Math\.min\(m\.maxCompletionTokens,\s*DEFAULT_MAX_TOKENS\)/,
    'the default budget must be clamped below the advertised capability'
  );
  // The advertised ceiling stays available as model metadata; it is only the
  // per-request default that must not be it.
  assert.match(source, /const DEFAULT_MAX_TOKENS = \d+;/);
});

test('token totals accumulate per model, keeping cache counts separate', () => {
  // The harness bills uncached input plus cache reads plus cache writes, so the
  // adapter subtracts cache hits out of `prompt_tokens` before this runs; adding
  // them again here would double-count every cached call.
  let stats = accumulateTokenStats(undefined, 'model-a', {
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 800,
    reasoningTokens: 5,
    at: 1000
  });
  stats = accumulateTokenStats(stats, 'model-a', { inputTokens: 50, outputTokens: 10, at: 2000 });
  stats = accumulateTokenStats(stats, 'model-b', { inputTokens: 7, outputTokens: 3, at: 3000 });

  assert.deepEqual(stats['model-a'], {
    calls: 2,
    inputTokens: 150,
    outputTokens: 30,
    cacheReadTokens: 800,
    cacheWriteTokens: 0,
    reasoningTokens: 5,
    lastUsedAt: 2000
  });
  assert.equal(stats['model-b'].calls, 1);
  assert.equal(stats['model-b'].cacheReadTokens, 0);
});

test('a malformed persisted total is normalized rather than trusted', () => {
  // A state file can be hand-edited or written by an older build, and the page
  // renders these numbers directly.
  const stats = tokenStatsOf({
    good: { calls: 2, inputTokens: 10, outputTokens: 5, lastUsedAt: 1000 },
    negative: { calls: -3, inputTokens: Number.NaN, outputTokens: 'lots' },
    notAnObject: 'nonsense'
  });
  assert.deepEqual(Object.keys(stats).sort(), ['good', 'negative']);
  assert.equal(stats.good.calls, 2);
  assert.equal(stats.negative.calls, 0);
  assert.equal(stats.negative.inputTokens, 0);
  assert.equal(stats.negative.outputTokens, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(stats.negative, 'lastUsedAt'), false);
  assert.deepEqual(tokenStatsOf(undefined), {});
  assert.deepEqual(tokenStatsOf(null), {});
});

test('the change log keeps the newest entries first and is bounded', () => {
  // Every refresh appends, so an unbounded log would grow the state file
  // forever and slow the page's render of it.
  let log = appendChangeLog(undefined, { at: 1, added: [], removed: [], total: 0 });
  assert.deepEqual(log.map((entry) => entry.at), [1]);

  log = appendChangeLog(log, { at: 2, added: [{ id: 'x', name: 'X' }], removed: [], total: 1 });
  assert.deepEqual(log.map((entry) => entry.at), [2, 1], 'newest first');

  for (let i = 3; i <= CHANGE_LOG_LIMIT + 5; i += 1) {
    log = appendChangeLog(log, { at: i, added: [], removed: [], total: 0 });
  }
  assert.equal(log.length, CHANGE_LOG_LIMIT);
  assert.equal(log[0].at, CHANGE_LOG_LIMIT + 5, 'the newest entry survives trimming');
});
