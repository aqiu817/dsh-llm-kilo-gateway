/**
 * Pure state utility functions (no I/O, no external deps).
 * @module dsh-llm-kilo-gateway/state-util
 */

/** Context window assumed when a catalog entry does not state one. */
export const DEFAULT_CONTEXT_LENGTH = 262144;

/** Output-token ceiling assumed when a catalog entry does not state one. */
export const DEFAULT_MAX_COMPLETION_TOKENS = 32768;

/** How many catalog changes the persisted history keeps, newest first. */
export const CHANGE_LOG_LIMIT = 50;

/**
 * Compare two sets of model IDs and return the difference.
 * @param {string[]} prevIds - previous model IDs
 * @param {string[]} currIds - current model IDs
 * @returns {{added: string[], removed: string[], unchanged: string[]}}
 */
export function diffModelIds(prevIds, currIds) {
  const prevSet = new Set(prevIds);
  const currSet = new Set(currIds);
  const added = currIds.filter(id => !prevSet.has(id));
  const removed = prevIds.filter(id => !currSet.has(id));
  const unchanged = currIds.filter(id => prevSet.has(id));
  return { added, removed, unchanged };
}

/**
 * Normalize one persisted capability list, tolerating older state files.
 * @param value - the persisted value.
 * @param fallback - value to use when nothing usable is stored.
 * @returns a detached string array.
 */
function stringArray(value, fallback) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : fallback;
}

/**
 * Normalize one persisted reasoning-level list.
 * @param value - the persisted value.
 * @returns a detached level list; empty when the model declared none.
 */
function reasoningLevels(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((level) => {
    if (level === null || typeof level !== 'object') return [];
    const { id, name, effort } = level;
    if (typeof id !== 'string' || id.length === 0) return [];
    return [{
      id,
      name: typeof name === 'string' && name.length > 0 ? name : id,
      ...(typeof effort === 'string' && effort.length > 0 ? { effort } : {})
    }];
  });
}

/**
 * The persistable half of one normalized model's capabilities.
 *
 * Shared by {@link buildState} and {@link modelsFromState} so a model keeps one
 * shape whether it arrived from the network or from the state file.
 *
 * @param m - normalized model, or a persisted detail record.
 * @returns the capability fields to store.
 */
function capabilityFields(m) {
  return {
    contextLength: Number.isInteger(m.contextLength) && m.contextLength > 0
      ? m.contextLength
      : DEFAULT_CONTEXT_LENGTH,
    maxCompletionTokens: Number.isInteger(m.maxCompletionTokens) && m.maxCompletionTokens > 0
      ? m.maxCompletionTokens
      : DEFAULT_MAX_COMPLETION_TOKENS,
    inputModalities: stringArray(m.inputModalities, ['text']),
    outputModalities: stringArray(m.outputModalities, ['text']),
    // Absent means "the catalog did not say", which is read as no: advertising
    // a capability the model lacks makes the harness persist a request that can
    // never succeed, while under-advertising costs one named refusal.
    supportsTools: m.supportsTools === true,
    reasoningLevels: reasoningLevels(m.reasoningLevels),
    expires: typeof m.expires === 'string' ? m.expires : undefined,
    mayTrainOnPrompts: m.mayTrainOnPrompts === true
  };
}

/**
 * Build the current model state from a list of normalized models.
 * @param {import('./discovery.js').KiloModel[]} models - normalized models
 * @returns {object} model state
 */
export function buildState(models) {
  const modelIds = models.map(m => m.id).sort();
  const modelDetails = {};
  for (const m of models) {
    modelDetails[m.id] = {
      name: m.name,
      ...capabilityFields(m)
    };
  }
  return {
    fetchedAt: Date.now(),
    modelIds,
    modelDetails,
    lastFetchSucceeded: true
  };
}

/**
 * Rebuild normalized models from a persisted state.
 *
 * The provider has to be usable the moment the plugin loads, but the catalog
 * fetch is asynchronous and may fail — and a provider whose `listModels`
 * returns nothing is dropped from the model picker entirely (the catalog
 * builder keeps only groups with at least one model). Seeding from the last
 * persisted state keeps every previously discovered model selectable across a
 * restart and across a failed refresh, which is exactly when the user needs it.
 *
 * @param {object|null} state - persisted state, or null.
 * @returns {import('./discovery.js').KiloModel[]} normalized models, possibly empty.
 */
export function modelsFromState(state) {
  if (state === null || !Array.isArray(state.modelIds) || state.modelIds.length === 0) return [];
  const details = state.modelDetails ?? {};
  return state.modelIds.map((id) => {
    const d = details[id] ?? {};
    // Every field is defaulted the same way `normalizeModel` defaults a live
    // catalog entry, because the host rejects a model whose `contextWindow` is
    // not a positive integer — a state file written before these fields existed
    // must still produce selectable models.
    return {
      id,
      name: d.name ?? id,
      ...capabilityFields(d)
    };
  });
}

/**
 * Build an error state (last known good state preserved).
 * @param {object|null} previous - previous state
 * @param {string} error - error message
 * @returns {object}
 */
export function buildErrorState(previous, error) {
  return {
    fetchedAt: Date.now(),
    modelIds: previous?.modelIds || [],
    modelDetails: previous?.modelDetails || {},
    lastFetchSucceeded: false,
    lastError: error,
    // Token totals are observations, not catalog data: a failed refresh must
    // not discard them.
    tokenStats: previous?.tokenStats,
    changeLog: previous?.changeLog
  };
}

/**
 * Append one catalog change to the history, newest first.
 *
 * Only a fetch that actually changed the list is recorded, so the log reads as
 * a list of events rather than of refreshes. The log is bounded because it is
 * persisted on every refresh and shown in a settings panel; an unbounded one
 * would grow without ever being read.
 *
 * @param {object[]|undefined} previous - existing history, newest first.
 * @param {object} entry - the change to record.
 * @returns {object[]} the new history.
 */
export function appendChangeLog(previous, entry) {
  const history = Array.isArray(previous) ? previous : [];
  return [entry, ...history].slice(0, CHANGE_LOG_LIMIT);
}

/**
 * Add one call's token usage to the running per-model totals.
 *
 * `inputTokens` counts uncached input only, with cache reads and writes kept
 * separate, matching the harness's own disjoint accounting. Providers that
 * fold cache hits into a single prompt count report the cached part in
 * `prompt_tokens_details.cached_tokens`, which the adapter subtracts out before
 * calling here.
 *
 * @param {object|undefined} previous - existing totals keyed by model id.
 * @param {string} model - model id the call was made against.
 * @param {object} usage - this call's counts.
 * @returns {object} the new totals map.
 */
export function accumulateTokenStats(previous, model, usage) {
  const stats = previous !== null && typeof previous === 'object' ? { ...previous } : {};
  const current = stats[model] ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
  stats[model] = {
    calls: current.calls + 1,
    inputTokens: current.inputTokens + (usage.inputTokens ?? 0),
    outputTokens: current.outputTokens + (usage.outputTokens ?? 0),
    cacheReadTokens: current.cacheReadTokens + (usage.cacheReadTokens ?? 0),
    cacheWriteTokens: current.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
    reasoningTokens: current.reasoningTokens + (usage.reasoningTokens ?? 0),
    lastUsedAt: usage.at ?? Date.now()
  };
  return stats;
}

/**
 * Normalize a persisted token-totals map for display.
 * @param {object|undefined} value - persisted totals.
 * @returns {object} totals keyed by model id.
 */
export function tokenStatsOf(value) {
  if (value === null || typeof value !== 'object') return {};
  const stats = {};
  for (const [model, entry] of Object.entries(value)) {
    if (entry === null || typeof entry !== 'object') continue;
    const number = (field) => (Number.isFinite(entry[field]) && entry[field] >= 0 ? entry[field] : 0);
    stats[model] = {
      calls: number('calls'),
      inputTokens: number('inputTokens'),
      outputTokens: number('outputTokens'),
      cacheReadTokens: number('cacheReadTokens'),
      cacheWriteTokens: number('cacheWriteTokens'),
      reasoningTokens: number('reasoningTokens'),
      ...(Number.isFinite(entry.lastUsedAt) ? { lastUsedAt: entry.lastUsedAt } : {})
    };
  }
  return stats;
}
