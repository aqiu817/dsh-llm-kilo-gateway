/**
 * Kilo Gateway free-model provider plugin for DeepSeek Harness.
 *
 * Registers a Kilo Gateway LLM adapter that auto-discovers free models from
 * the Kilo API, refreshes the list daily, and notifies the user of changes
 * via a loopback HTTP endpoint the browser half polls.
 *
 * @module dsh-llm-kilo-gateway
 */

import { LlmError, LlmAdapter, assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import z from '@deepseek-ai/schemastery';

import { fetchAllModels, extractFreeModels } from './discovery.js';
import { createStateStore, loadStateSync, buildState, buildErrorState, modelsFromState, tokenStatsOf, diffModelIds } from './state.js';
import { startNotifyServer } from './server.js';
import {
  toWireMessages,
  toWireTools,
  toHarnessUsage,
  toFinishReason
} from './wire.js';

const NS = 'kilo-gateway';
const PROVIDER = 'kilo';
const DEFAULT_BASE_URL = 'https://api.kilo.ai/api/gateway';
const DEFAULT_CATALOG_URL = 'https://api.kilo.ai/api/gateway/models';
const DEFAULT_REFRESH_MS = 86400000;
/**
 * Floor for the refresh interval. A free-model catalog does not change by the
 * minute, and an interval this short would poll Kilo's endpoint continuously
 * from every running harness — the schema rejects a smaller value instead of
 * silently clamping it, so a bad edit is reported rather than obeyed.
 */
const MIN_REFRESH_MS = 60000;
const DEFAULT_NOTIFY_PORT = 9876;

/**
 * Output budget requested when the caller names none.
 *
 * Deliberately not the model's advertised `max_completion_tokens`: that is a
 * capability, and asking for all of it is what upstreams reject. This matches
 * the convention the shipped `dsh-llm-pi-ai` adapter uses.
 */
const DEFAULT_MAX_TOKENS = 32768;

/**
 * Backoff constants for the provider retry policy.
 *
 * These restate the harness's own defaults (`dsh-llm`'s `DEFAULT_INITIAL_DELAY_MS`
 * et al.) because a policy returned by `providerRetryPolicy()` is used verbatim
 * rather than merged with those defaults. They are constants here rather than
 * settings because the delay curve is not what a user tunes: the attempt budget
 * already is one.
 */
const DEFAULT_RETRY_INITIAL_DELAY_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 10000;
const DEFAULT_RETRY_JITTER_RATIO = 0.1;

/**
 * How long one upstream attempt may run before it is abandoned.
 *
 * Without a bound, a stalled connection holds the agent turn open indefinitely;
 * the abort surfaces as a `TIMEOUT` failure, which the host's retry policy
 * treats as safe to repeat.
 */
const REQUEST_TIMEOUT_MS = 300000;

/**
 * Attempts the adapter itself makes before handing the failure to the harness.
 *
 * Deliberately small and deliberately below the harness's own budget: the
 * harness retries through `dsh-llm-retry` on the codes this adapter classifies,
 * and a nested loop would multiply the two. This one exists only to ride out a
 * connect-time blip, where no partial output can have been produced yet.
 */
const CONNECT_ATTEMPTS = 2;

/**
 * Unwrap a volatile field reference, if the value is one.
 *
 * A `.volatile()` field reaches `apply()` as a frozen reference cell (`{ get }`,
 * setter kept private) rather than as a plain value: a settings write mutates
 * the cell in place instead of reloading the fiber, so every read has to go
 * through `get()` to observe the current choice. Ordinary fields pass through
 * untouched, which is why every read site can go through here unconditionally.
 *
 * @param {unknown} value - a resolved config field value.
 * @returns {unknown} the plain value behind a volatile cell, else the value.
 */
function resolveVolatile(value) {
  return typeof value === 'object' && value !== null && Object.isFrozen(value) && typeof value.get === 'function'
    ? value.get()
    : value;
}

/** @type {import('@deepseek-ai/schemastery').z<Config>} */
export const Config = z.object({
  baseURL: z.string().default(DEFAULT_BASE_URL),
  catalogUrl: z.string().default(DEFAULT_CATALOG_URL),
  /**
   * Credential reference resolved per request; empty selects anonymous access.
   *
   * This is a *reference*, not a secret: the value lives in
   * `$DSH_HOME/.credentials.yaml` or the launching environment, and the adapter
   * resolves it by name. The settings page writes the key itself through the
   * credentials service, which is the one path that never puts a secret into
   * this section — the host returns this section verbatim to the browser.
   */
  apiKeyEnv: z
    .string()
    .default('')
    .description('name of the credential holding the Kilo API key; empty uses anonymous access')
    .volatile(),
  /** How often the free-model catalog is re-fetched, in milliseconds. */
  refreshIntervalMs: z
    .number()
    .step(1)
    .min(MIN_REFRESH_MS)
    .default(DEFAULT_REFRESH_MS)
    .description('how often the free-model catalog is re-fetched, in milliseconds')
    .volatile(),
  /**
   * Loopback port for the model-change endpoint the browser half polls. Zero
   * disables the endpoint (and with it the change toast).
   */
  notifyPort: z
    .number()
    .step(1)
    .min(0)
    .max(65535)
    .default(DEFAULT_NOTIFY_PORT)
    .description('loopback port of the model-change endpoint; 0 disables it')
    .volatile(),
  /**
   * Whether the browser half raises a toast for the first catalog it reads, or
   * only when the free-model list actually changed since the last check.
   */
  notifyOnFirstLoad: z
    .boolean()
    .default(true)
    .description('show a notification for the first catalog read instead of only on change')
    .volatile(),
  /**
   * Attempts the harness may make against one failed request. Zero disables
   * retrying for this provider.
   *
   * The harness owns retrying (`dsh-llm-retry`), and this is the budget it
   * spends on this provider's retryable failures. It is a plugin setting rather
   * than a constant because how many attempts a free gateway deserves depends
   * on how flaky it is being, which the user can see and this plugin cannot.
   *
   * Which failures are retryable is not a setting: it is the adapter's
   * classification (see {@link failureCodeForStatus}), because a code the user
   * could retry by hand is still one the request can never survive.
   */
  maxRetries: z
    .number()
    .step(1)
    .min(0)
    .max(10)
    .default(2)
    .description('how many times the harness may retry a failed Kilo request; 0 disables retrying')
    .volatile(),
  /**
   * How long one upstream attempt may run before it is abandoned, in
   * milliseconds. Surfaced because a slow free pool is a real condition, and
   * waiting is sometimes the right answer.
   */
  requestTimeoutMs: z
    .number()
    .step(1000)
    .min(10000)
    .max(1800000)
    .default(REQUEST_TIMEOUT_MS)
    .description('how long one Kilo request may run before it is abandoned, in milliseconds')
    .volatile()
});

export const name = "kilo-gateway";
// `llm` is the one Cordis service this plugin waits for. `launch-environment`
// is NOT a service — `@deepseek-ai/dsh-launch-environment` exports plain
// functions and is already imported directly at the top of this file, so
// declaring it here made the plugin wait forever for a service that no plugin
// provides: it stayed `pending (waiting for service: launch-environment)` and
// never activated.
//
// `settings` is deliberately absent too: since 0.1.7 the host reflects an
// activated entry's Config into the settings plane on its own, so there is no
// section to install and nothing to wait for. The editable fields are declared
// with `.volatile()` above, which is the entire host-side contract.
//
// `attachments` is NOT declared either: image blocks are only translated when
// a request carries one, and a harness without an attachment service cannot
// have produced such a block. Reading it lazily keeps this plugin usable in a
// text-only deployment.
export const inject = ["llm"];

/**
 * Fetch free models from the Kilo Gateway API.
 */
async function fetchFreeModels(catalogUrl, signal) {
  const data = await fetchAllModels(catalogUrl, signal);
  return extractFreeModels(data);
}

/**
 * Compare model ID lists and build a human-readable summary.
 */
function compareModels(prevIds, currIds, currDetails) {
  const diff = diffModelIds(prevIds, currIds);
  const parts = [];
  if (diff.added.length > 0) {
    parts.push(
      `+${diff.added.length} new model(s): ${diff.added.map(id => currDetails[id]?.name || id).join(', ')}`
    );
  }
  if (diff.removed.length > 0) {
    parts.push(`-${diff.removed.length} removed: ${diff.removed.join(', ')}`);
  }
  return {
    added: diff.added,
    removed: diff.removed,
    summary: parts.length > 0 ? parts.join('; ') : 'No changes detected'
  };
}

/**
 * Map an HTTP status onto a harness failure code.
 *
 * The codes are the harness's own retry vocabulary, so this mapping *is* the
 * retry policy: a status classified as `SERVER` is retried by
 * `dsh-llm-retry`, and one classified as `INVALID_REQUEST` ends the turn.
 * Classifying everything as one code (as this adapter used to) silently
 * disabled retrying entirely, because the default retryable set does not
 * contain that code.
 *
 * @param {number} status - the HTTP status.
 * @returns {string} the harness failure code.
 */
function failureCodeForStatus(status) {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 402) return 'QUOTA';
  if (status === 404) return 'INVALID_MODEL';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  if (status === 400 || status === 422) return 'INVALID_REQUEST';
  return 'PROVIDER_ERROR';
}

/**
 * Kilo Gateway LLM adapter extending the base LlmAdapter.
 *
 * Models are read from a closure so the adapter always sees the latest
 * discovered free models without re-registration, and the configuration is read
 * through a getter for the same reason: a volatile settings write must reach
 * the next request without a fiber reload.
 */
class KiloAdapter extends LlmAdapter {
  constructor(options) {
    super();
    this._getModels = options.getModels;
    this._getConfig = options.getConfig;
    this._resolveApiKey = options.resolveApiKey;
    this._loadImage = options.loadImage;
    this._recordUsage = options.recordUsage;
  }

  providerInfo(provider) {
    return { id: provider, name: 'Kilo Gateway' };
  }

  /**
   * The retry policy the harness applies to this provider's failures.
   *
   * Read live rather than captured: the attempt budget is a setting, and a
   * change to it should apply to the next request. The retryable set is fixed,
   * because it is this adapter's classification of what can survive a retry.
   *
   * The whole object is returned rather than only the fields this adapter cares
   * about. `LlmRuntime` uses a returned policy **verbatim** (`?? resolveRetryPolicy`),
   * so it is not merged with the defaults — an omitted `backoff` leaves
   * `initialDelayMs`/`maxDelayMs`/`jitterRatio` undefined, `localDelay` computes
   * `NaN`, and `dsh-llm-retry` then fails to append its `llm/retry` event with
   * «carries non-JSON-serializable data» (the snapshot gate rejects non-finite
   * numbers). Returning undefined would take the defaults, but then the budget
   * could not come from the setting.
   */
  providerRetryPolicy(provider) {
    const maxRetries = resolveVolatile(this._getConfig().maxRetries);
    return {
      mode: 'normal',
      maxRetries: Number.isSafeInteger(maxRetries) && maxRetries >= 0 ? maxRetries : 2,
      // `INVALID_REQUEST` is deliberately absent: a rejected body is rejected
      // identically every time, and retrying it only multiplies the delay
      // before the user sees the error. `EMPTY_RESPONSE` is included because a
      // degenerate completion from a free pool is exactly what a second draw
      // fixes.
      retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
      // These three are the harness's own defaults, restated because a returned
      // policy is taken as complete. See the note above: omitting them makes
      // every scheduled retry throw.
      initialDelayMs: DEFAULT_RETRY_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_RETRY_MAX_DELAY_MS,
      jitterRatio: DEFAULT_RETRY_JITTER_RATIO
    };
  }

  listModels(provider) {
    return Promise.resolve(
      this._getModels().map(m => ({
        provider,
        id: m.id,
        name: m.name,
        inputModalities: m.inputModalities
      }))
    );
  }

  async resolveModel(provider, model, signal) {
    const m = this._getModels().find(m => m.id === model);
    if (!m) {
      throw new LlmError(`Unknown model: ${model}`, 'INVALID_MODEL');
    }
    const levels = Array.isArray(m.reasoningLevels) ? m.reasoningLevels : [];
    return {
      provider,
      id: model,
      name: m.name,
      context: { contextWindow: m.contextLength },
      // The catalog's `max_completion_tokens` is a *capability* — the most the
      // model can ever emit — not the budget to request on every call. Sending
      // it as `max_tokens` was a real 400: `dots-studio/…` advertises 460800,
      // and its upstream (AtlasCloud) rejects anything above roughly 393216
      // with an opaque «bad request». A default budget is therefore taken from
      // the same convention the shipped adapters use (32768), clamped down when
      // the model's own ceiling is lower, so an advertised capability is never
      // requested by default.
      defaultMaxTokens: Math.min(m.maxCompletionTokens, DEFAULT_MAX_TOKENS),
      inputModalities: m.inputModalities,
      // The catalog's own level names become the offered efforts, so the picker
      // shows exactly what the model claimed. `defaultEffort` is left unset: an
      // absent default preserves the gateway's own choice, which is the honest
      // answer when the catalog states levels without stating a default.
      ...(levels.length === 0 ? {} : {
        reasoning: {
          efforts: levels.map((level) => ({
            id: level.id,
            name: level.name,
            ...(level.effort === undefined ? {} : { description: `reasoning_effort: ${level.effort}` })
          }))
        }
      })
    };
  }

  async prepareCall(provider, model, signal) {
    const apiKey = await this._resolveApiKey(provider);
    const resolvedModel = await this.resolveModel(provider, model, signal);
    return {
      model: resolvedModel,
      stream: (options) => this.stream(options, apiKey)
    };
  }

  /**
   * Resolve one reasoning level id to the wire value to send.
   *
   * An "off"-style level carries no wire value, which means "send no reasoning
   * field at all" — the one spelling every endpoint accepts.
   *
   * @param {string} model - the model id.
   * @param {string|undefined} effort - the requested level id.
   * @returns {string|undefined} the wire value, or undefined to send none.
   */
  _reasoningWireValue(model, effort) {
    if (effort === undefined) return undefined;
    const m = this._getModels().find(m => m.id === model);
    const level = (m?.reasoningLevels ?? []).find((candidate) => candidate.id === effort);
    return level?.effort;
  }

  /**
   * Stream chat completions from the Kilo Gateway (OpenAI-compatible SSE).
   *
   * @param {import('@deepseek-ai/dsh-llm').GenerateOptions} options
   * @param {string|undefined} apiKey
   */
  async *stream(options, apiKey) {
    const config = this._getConfig();
    const endpoint = `${config.baseURL}/chat/completions`;
    const timeoutMs = resolveVolatile(config.requestTimeoutMs);

    const messages = await toWireMessages(options.messages, {
      loadImage: this._loadImage,
      signal: options.signal,
      reasoningOf: (message) => reasoningTextOf(message)
    });

    // A one-shot caller passes the system prompt separately; the loop-built
    // path already carries it as a leading system message.
    if (options.system) {
      messages.unshift({ role: 'system', content: options.system });
    }

    const body = {
      model: options.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {})
    };

    const tools = toWireTools(options.tools);
    if (tools !== undefined) body.tools = tools;
    if (options.stop && options.stop.length > 0) body.stop = options.stop;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const reasoningEffort = this._reasoningWireValue(options.model, options.reasoningEffort);
    if (reasoningEffort !== undefined) body.reasoning_effort = reasoningEffort;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      // The harness requires every provider request to carry its attribution,
      // and the gateway forwards it upstream.
      ...attributionHeaders(),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    };

    const response = await this._dispatch(endpoint, headers, body, options.signal, timeoutMs);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new LlmError('No response body', 'PROVIDER_ERROR');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let textIndex = null;
    let reasoningIndex = null;
    let text = '';
    let reasoning = '';
    const toolCalls = new Map();
    let nextIndex = 0;
    let finishReason;
    let usage;

    /** Allocate the next stream index for a block that has not started yet. */
    const claimIndex = () => nextIndex++;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            // A malformed line is one lost fragment, not a failed turn.
            continue;
          }

          if (chunk.usage !== undefined && chunk.usage !== null) {
            usage = toHarnessUsage(chunk.usage);
          }

          const choice = chunk.choices?.[0];
          if (choice === undefined) continue;
          const delta = choice.delta ?? {};

          // --- reasoning ---
          const reasoningDelta = typeof delta.reasoning === 'string' && delta.reasoning.length > 0
            ? delta.reasoning
            : reasoningFromDetails(delta.reasoning_details);
          if (reasoningDelta !== undefined) {
            if (reasoningIndex === null) {
              reasoningIndex = claimIndex();
              yield { type: 'block-start', index: reasoningIndex, blockType: 'reasoning' };
            }
            reasoning += reasoningDelta;
            yield { type: 'reasoning-delta', index: reasoningIndex, text: reasoningDelta };
          }

          // --- visible text ---
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            if (textIndex === null) {
              textIndex = claimIndex();
              yield { type: 'block-start', index: textIndex, blockType: 'text' };
            }
            text += delta.content;
            yield { type: 'text-delta', index: textIndex, text: delta.content };
          }

          // --- tool calls ---
          for (const call of delta.tool_calls ?? []) {
            const key = call.index ?? 0;
            let state = toolCalls.get(key);
            if (state === undefined) {
              state = { index: claimIndex(), id: undefined, name: undefined, arguments: '' };
              toolCalls.set(key, state);
            }
            if (typeof call.id === 'string' && call.id.length > 0) state.id = call.id;
            if (typeof call.function?.name === 'string' && call.function.name.length > 0) {
              state.name = call.function.name;
            }
            const argumentsDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
            if (state.name === undefined) continue;
            // The name arrives with (or before) the first fragment; the delta is
            // only emitted once it is known, because a tool-call-delta without a
            // name is not something the assembler can route.
            yield {
              type: 'tool-call-delta',
              index: state.index,
              id: state.id ?? `call-${key}`,
              name: state.name,
              argumentsDelta
            };
            state.arguments += argumentsDelta;
          }

          if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
            finishReason = choice.finish_reason;
          }
        }
      }
    } catch (error) {
      if (textIndex !== null) {
        yield { type: 'block-end', index: textIndex, block: { type: 'text', text } };
      }
      if (reasoningIndex !== null) {
        yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoning } };
      }
      if (error?.name === 'AbortError') {
        throw new LlmError('Kilo Gateway request aborted', 'ABORTED', { cause: error });
      }
      throw new LlmError(
        `Kilo Gateway stream failed: ${error?.message ?? String(error)}`,
        options.signal?.aborted ? 'ABORTED' : 'TRANSPORT',
        { cause: error }
      );
    } finally {
      reader.releaseLock();
    }

    // --- close the blocks, in stream order ---
    if (reasoningIndex !== null) {
      yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoning } };
    }
    if (textIndex !== null) {
      yield { type: 'block-end', index: textIndex, block: { type: 'text', text } };
    }
    for (const state of toolCalls.values()) {
      if (state.name === undefined) continue;
      yield {
        type: 'block-end',
        index: state.index,
        block: {
          type: 'tool-call',
          id: state.id ?? `call-${state.index}`,
          name: state.name,
          arguments: state.arguments
        }
      };
    }

    if (usage !== undefined) {
      yield { type: 'usage', usage };
      this._recordUsage?.(options.model, usage);
    }

    yield { type: 'finish', reason: toFinishReason(finishReason) };
  }

  /**
   * Send one request, retrying only a failure that happened before any bytes
   * arrived.
   *
   * A connect-time failure can be retried without the caller observing
   * anything, because no output was produced. A failure *after* the stream
   * started is left to the harness: by then deltas have been yielded, and
   * silently starting over would duplicate them.
   */
  async _dispatch(endpoint, headers, body, signal, timeoutMs) {
    const payload = JSON.stringify(body);
    let lastError;
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
      const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS;
      // The caller's signal and the timeout are fused so either one aborts.
      const fused = signal === undefined
        ? AbortSignal.timeout(timeout)
        : AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
      let response;
      try {
        response = await fetch(endpoint, { method: 'POST', headers, body: payload, signal: fused });
      } catch (error) {
        if (signal?.aborted) throw new LlmError('Kilo Gateway request aborted', 'ABORTED', { cause: error });
        lastError = error;
        // A timeout is reported as one; a connect failure as a transport error.
        if (error?.name === 'TimeoutError') {
          throw new LlmError(
            `Kilo Gateway request timed out after ${timeout} ms`,
            'TIMEOUT',
            { cause: error }
          );
        }
        if (attempt + 1 < CONNECT_ATTEMPTS) continue;
        throw new LlmError(
          `Kilo Gateway request failed: ${error?.message ?? String(error)}`,
          'TRANSPORT',
          { cause: error }
        );
      }

      if (response.ok) return response;

      const detail = await response.text().catch(() => '');
      const code = failureCodeForStatus(response.status);
      const retryAfter = retryAfterMs(response.headers.get('retry-after'));
      lastError = new LlmError(
        `Kilo Gateway returned HTTP ${response.status}: ${detail.slice(0, 300)}`,
        code,
        {
          status: response.status,
          ...(retryAfter === undefined ? {} : { providerRetryAfterMs: retryAfter })
        }
      );
      // Only a transient status is worth a second connect attempt here; the
      // rest is handed to the harness, whose budget the user controls.
      const transient = code === 'SERVER' || code === 'RATE_LIMIT' || code === 'TIMEOUT';
      if (transient && attempt + 1 < CONNECT_ATTEMPTS) continue;
      throw lastError;
    }
    throw lastError;
  }
}

/**
 * Read the reasoning text stored on an assistant message, for replay.
 *
 * A reasoning model's own thinking has to be handed back on the next request
 * when the history contains tool calls, or the upstream rejects the whole
 * request. The harness stores reasoning blocks, so this reads them back.
 *
 * @param {object} message - a harness message.
 * @returns {string|undefined} the stored reasoning, or undefined when none.
 */
function reasoningTextOf(message) {
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks.filter((block) => block.type === 'reasoning').map((block) => block.text).join('');
  return text.length === 0 ? undefined : text;
}

/**
 * Read a reasoning fragment out of `reasoning_details`.
 *
 * Some providers emit the thinking only as structured detail entries rather
 * than as the plain `reasoning` string; both spellings carry the same text.
 *
 * @param {unknown} details - the `reasoning_details` array.
 * @returns {string|undefined} the fragment, or undefined when there is none.
 */
function reasoningFromDetails(details) {
  if (!Array.isArray(details)) return undefined;
  const text = details
    .map((detail) => (detail?.type === 'reasoning.text' ? detail.text : undefined))
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('');
  return text.length === 0 ? undefined : text;
}

/**
 * Parse a `Retry-After` header into milliseconds.
 * @param {string|null} value - the raw header value.
 * @returns {number|undefined} the delay in milliseconds, when it is a sane one.
 */
function retryAfterMs(value) {
  if (value === null || value.length === 0) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}

/**
 * Plugin entry point — synchronous Cordis apply().
 * Registers the adapter and configurable providers immediately, then starts
 * async model discovery in the background.
 */
export function apply(ctx, config) {
  // Seed from the last persisted catalog before the first `listModels` call.
  // The host builds the model catalog immediately after activation and drops
  // every provider whose model list is empty, so an asynchronous-only fill
  // makes `kilo` invisible until the first fetch lands — and permanently
  // invisible whenever that fetch fails. Reading the state file synchronously
  // here is what makes "loaded" and "selectable" the same moment.
  const store = createStateStore(loadStateSync());
  const seeded = store.get();
  let freeModels = modelsFromState(seeded);
  let notifyPayload = {
    hasChanges: false,
    added: [],
    removed: [],
    totalFree: freeModels.length,
    summary: '',
    fetchedAt: seeded?.fetchedAt ?? 0
  };

  // --- Fetch, compare, and persist model list ---
  const fetchAndCompare = async () => {
    try {
      // `catalogUrl` is ordinary configuration: changing it rewrites the entry
      // config and reloads this fiber, so it is read once per fetch from the
      // captured config rather than through a volatile cell.
      const newModels = await fetchFreeModels(config.catalogUrl);
      const previous = store.get();
      freeModels = newModels;

      const newIds = newModels.map(m => m.id).sort();
      const currDetails = {};
      for (const m of newModels) {
        currDetails[m.id] = { name: m.name };
      }

      const comparison = compareModels(previous?.modelIds || [], newIds, currDetails);
      const changed = comparison.added.length > 0 || comparison.removed.length > 0;

      await store.setCatalog(buildState(newModels));
      if (changed) {
        // The history is what the settings page renders, so it records the
        // models' display names alongside their ids: an id alone is unreadable
        // once the model has left the catalog.
        store.recordChange({
          at: Date.now(),
          added: comparison.added.map((id) => ({ id, name: currDetails[id]?.name ?? id })),
          removed: previous?.modelIds
            ?.filter((id) => comparison.removed.includes(id))
            .map((id) => ({ id, name: previous.modelDetails?.[id]?.name ?? id })) ?? [],
          total: newModels.length
        });
      }

      notifyPayload = {
        hasChanges: changed,
        added: comparison.added,
        removed: comparison.removed,
        totalFree: newModels.length,
        summary: comparison.summary,
        fetchedAt: Date.now()
      };

      ctx.logger.info(
        `kilo-gateway: fetched ${newModels.length} free models ` +
        `(${comparison.added.length} added, ${comparison.removed.length} removed)`
      );

      ctx.llm.emitAdaptersUpdated();
      return true;
    } catch (err) {
      // Persisting the failure state is best-effort: it is the last thing this
      // function does that touches the disk, and if the disk is what failed,
      // throwing from here would reject `fetchAndCompare` itself. Every caller
      // runs it unawaited (initial load, refresh timer), so a rejection would
      // surface as a host-level fatal load failure instead of a logged warning.
      try {
        await store.setCatalog(buildErrorState(store.get(), err.message));
      } catch (persistErr) {
        ctx.logger.warn(`kilo-gateway: could not persist error state: ${persistErr.message}`);
      }

      notifyPayload = {
        hasChanges: false,
        error: err.message,
        totalFree: store.get()?.modelIds.length || 0,
        summary: `Fetch failed: ${err.message}`,
        fetchedAt: Date.now()
      };

      ctx.logger.error(`kilo-gateway: model fetch failed: ${err.message}`);
      return false;
    }
  };

  // --- Resolve the API key from credentials or environment ---
  const resolveApiKey = async (provider) => {
    const ref = resolveVolatile(config.apiKeyEnv);
    if (typeof ref !== 'string' || ref.length === 0) return undefined;

    const credentials = ctx.get('credentials');
    if (credentials !== void 0) {
      const hit = await credentials.resolve(ref);
      if (hit !== void 0) {
        return assertUsableApiKey(hit.value, 'kilo-gateway', ref);
      }
    }

    const env = launchEnvironmentOf(ctx);
    const ambient = env.get(ref);
    if (ambient !== void 0 && ambient.value.length > 0) {
      return assertUsableApiKey(ambient.value, 'kilo-gateway', ref);
    }

    throw new LlmError(
      `kilo-gateway: no API key for "${PROVIDER}"; store ${ref} through the credentials service or export it`,
      'MISSING_CREDENTIAL'
    );
  };

  // --- Resolve one image block to bytes for the wire ---
  // Read lazily and only when a request actually carries an image, so a
  // text-only deployment needs no attachment service at all. A missing service
  // yields no image rather than a throw: the harness's own projection already
  // substitutes placeholder text for models that declare text-only input, and
  // failing the whole turn over an unreadable attachment would be worse than
  // sending the text.
  const loadImage = async (ref, signal) => {
    const attachments = ctx.get('attachments');
    if (attachments === void 0) return undefined;
    try {
      const stored = await attachments.readImage(ref, signal);
      return { data: stored.data, mediaType: stored.ref.mediaType };
    } catch (error) {
      ctx.logger.warn(`kilo-gateway: could not read an image attachment: ${error.message}`);
      return undefined;
    }
  };

  // --- Build the adapter ---
  const adapter = new KiloAdapter({
    getModels: () => freeModels,
    getConfig: () => config,
    resolveApiKey,
    loadImage,
    recordUsage: (model, usage) => {
      store.addUsage(model, usage);
    }
  });

  // --- Register adapter and configurable provider directory ---
  ctx.llm.registerAdapter([PROVIDER], adapter);

  ctx.llm.registerConfigurableProviders([{
    provider: PROVIDER,
    displayName: 'Kilo Gateway',
    settingsNs: NS,
    settingsPath: ['providers', PROVIDER],
    declared: false
  }]);

  // --- Assemble the settings page's host-side snapshot ---
  // The page owns no Remote namespace of its own, so the facts it renders are
  // read from the plugin's loopback endpoint: the current free models with the
  // capabilities the catalog declared, the recent catalog changes, and the
  // token totals this process accumulated.
  const buildStateSnapshot = () => {
    const state = store.get();
    return {
      fetchedAt: state?.fetchedAt ?? 0,
      lastFetchSucceeded: state?.lastFetchSucceeded !== false,
      ...(typeof state?.lastError === 'string' ? { lastError: state.lastError } : {}),
      models: freeModels.map((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.contextLength,
        maxCompletionTokens: m.maxCompletionTokens,
        inputModalities: m.inputModalities,
        supportsTools: m.supportsTools === true,
        reasoningLevels: (m.reasoningLevels ?? []).map((level) => level.id),
        mayTrainOnPrompts: m.mayTrainOnPrompts === true,
        ...(m.expires === undefined ? {} : { expires: m.expires })
      })),
      changeLog: Array.isArray(state?.changeLog) ? state.changeLog : [],
      tokenStats: tokenStatsOf(state?.tokenStats)
    };
  };

  // --- Notification server ---
  // `notifyPort` is volatile, so a settings write changes the value without
  // reloading this fiber; the effect therefore re-binds the listener on
  // `loader/volatile-update` and restarts the server itself. A port that
  // cannot be bound is reported and leaves the endpoint off rather than
  // silently moving to a port the browser half is not polling.
  ctx.effect(() => {
    let disposed = false;
    let handle = null;
    let boundPort = null;

    const stop = () => {
      if (handle === null) return;
      const closing = handle;
      handle = null;
      void closing.close();
    };

    const start = async () => {
      const port = resolveVolatile(config.notifyPort);
      if (!Number.isInteger(port) || port <= 0) return;
      const h = await startNotifyServer(port, () => notifyPayload, () => buildStateSnapshot());
      if (disposed) {
        await h.close();
        return;
      }
      handle = h;
      boundPort = h.port;
      ctx.logger.info(`kilo-gateway: notification server on port ${h.port}`);
    };

    const sync = () => {
      const port = resolveVolatile(config.notifyPort);
      const wanted = Number.isInteger(port) && port > 0 ? port : null;
      if (wanted === boundPort) return;
      boundPort = wanted;
      stop();
      if (wanted === null) return;
      start().catch(err => {
        ctx.logger.warn(`kilo-gateway: could not start notification server on port ${wanted}: ${err.message}`);
      });
    };

    sync();
    const off = ctx.on('loader/volatile-update', sync);

    return () => {
      disposed = true;
      off?.();
      stop();
    };
  });

  // --- Persist the coalesced token totals when the fiber unloads ---
  ctx.effect(() => () => {
    void store.dispose();
  });

  // --- Initial async load: refresh the catalog seeded above ---
  // `store` is already seeded synchronously; re-reading it here would only
  // risk replacing a good seeded state with a failed read's null, which would
  // then be persisted as an empty catalog.
  //
  // Nothing awaits this, so a rejection here would escape as an unhandled
  // rejection and the host would report it as a fatal load failure.
  // `fetchAndCompare` cannot reject: its own failure branch persists
  // best-effort and swallows a failing write.
  void fetchAndCompare().catch(err => {
    ctx.logger.error(`kilo-gateway: initial model load failed: ${err.message}`);
  });

  // --- Refresh timer ---
  // Re-scheduled on a volatile interval change, and only when the interval
  // actually moved: every volatile field shares one update event, so an
  // `apiKeyEnv` edit must not reset the countdown.
  ctx.effect(() => {
    let intervalId = null;
    let currentMs = null;

    const schedule = () => {
      const ms = resolveVolatile(config.refreshIntervalMs);
      const delay = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_REFRESH_MS;
      if (delay === currentMs) return;
      currentMs = delay;
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = setInterval(() => {
        void fetchAndCompare();
      }, delay);
    };

    schedule();
    const off = ctx.on('loader/volatile-update', schedule);

    return () => {
      off?.();
      if (intervalId !== null) clearInterval(intervalId);
    };
  });
}

export { compareModels, failureCodeForStatus, reasoningFromDetails, retryAfterMs, resolveVolatile };
