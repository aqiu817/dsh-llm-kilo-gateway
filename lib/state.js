/**
 * Model state persistence: the last-seen free model list, the catalog change
 * history, and the per-model token totals.
 *
 * One file holds all three because they are read and written together: the
 * plugin seeds from it at activation and the settings page reads it as one
 * snapshot. Writes are atomic, and the token totals — which change on every
 * model call — are throttled, since an atomic file write per call would be a
 * disk write per call.
 *
 * @module dsh-llm-kilo-gateway/state
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';

import { accumulateTokenStats, appendChangeLog } from './state-util.js';

// Re-export pure functions for convenience
export {
  CHANGE_LOG_LIMIT,
  accumulateTokenStats,
  appendChangeLog,
  buildState,
  buildErrorState,
  diffModelIds,
  modelsFromState,
  tokenStatsOf
} from './state-util.js';

const STATE_DIR = 'plugins/kilo-gateway';
const STATE_FILE = 'model-state.json';

/**
 * Shortest gap between two persisted token-total updates.
 *
 * Token totals change on every model call, and each save is an atomic file
 * write. Coalescing them keeps a long agent turn from turning into a stream of
 * disk writes while still surviving a crash within a few seconds of the last
 * call.
 */
const TOKEN_FLUSH_INTERVAL_MS = 5000;

/**
 * @typedef {Object} ModelState
 * @property {number} fetchedAt - Unix timestamp (ms) when models were last fetched
 * @property {string[]} modelIds - sorted array of free model IDs
 * @property {Object} modelDetails - map of model ID to display metadata
 * @property {boolean} lastFetchSucceeded - whether the last fetch completed without error
 * @property {Object} [tokenStats] - per-model token totals
 * @property {Object[]} [changeLog] - recent catalog changes, newest first
 */

/** Path of the persisted state file. */
function statePath() {
  return join(resolveDshHome(), STATE_DIR, STATE_FILE);
}

/**
 * Read the persisted model state synchronously.
 *
 * The provider must answer `listModels` on the first synchronous call, before
 * any await, because the host builds the model catalog right after activation:
 * a provider that reports no models is dropped from the picker. An asynchronous
 * read would land too late, so activation seeds from here.
 *
 * @returns {ModelState|null} the state, or null if no readable file exists
 */
export function loadStateSync() {
  try {
    const state = JSON.parse(readFileSync(statePath(), 'utf-8'));
    if (!state.modelIds || !Array.isArray(state.modelIds)) return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * Persist the model state.
 * @param {ModelState} state - state to save
 */
export async function saveState(state) {
  // `writeFileAtomic` creates the parent directory itself, and requires the
  // permission bits explicitly: the state file lives under the user's own
  // `~/.dsh`, so it is private (`0o600` in a `0o700` tree) rather than
  // world-readable like the harness's shared config files.
  await writeFileAtomic(statePath(), JSON.stringify(state, null, 2), {
    mode: 0o600,
    dirMode: 0o700,
  });
}

/**
 * Own the state file for one activation.
 *
 * Catalog writes go straight through (they happen once per refresh, and the
 * refresh result is what the user is waiting on). Token-total writes are
 * coalesced, because they arrive once per model call. The returned handle is
 * disposed with the plugin's fiber, and disposal flushes anything pending so a
 * settings change or unload does not drop the last few seconds of counts.
 *
 * @param {ModelState|null} initial - the state read at activation.
 * @returns {object} the handle the plugin mutates and disposes.
 */
export function createStateStore(initial) {
  let state = initial ?? { fetchedAt: 0, modelIds: [], modelDetails: {}, lastFetchSucceeded: true };
  let pendingTimer = null;
  let disposed = false;
  let writing = Promise.resolve();

  /** Serialize writes so two saves cannot interleave inside the atomic replace. */
  const write = (next) => {
    writing = writing.then(() => saveState(next), () => saveState(next));
    return writing;
  };

  return {
    /** @returns {ModelState} the state as currently held. */
    get() {
      return state;
    },
    /**
     * Replace the catalog half of the state and persist it immediately.
     * @param {object} next - the new catalog state.
     * @returns {Promise<void>} settlement after the write.
     */
    setCatalog(next) {
      state = { ...next, tokenStats: state.tokenStats, changeLog: state.changeLog };
      return write(state);
    },
    /**
     * Record one catalog change in the persisted history.
     * @param {object} entry - the change to record.
     */
    recordChange(entry) {
      state = { ...state, changeLog: appendChangeLog(state.changeLog, entry) };
      void write(state);
    },
    /**
     * Add one call's usage to the running totals, persisting at most once per
     * {@link TOKEN_FLUSH_INTERVAL_MS}.
     * @param {string} model - model id the call was made against.
     * @param {object} usage - this call's counts.
     */
    addUsage(model, usage) {
      if (disposed) return;
      state = { ...state, tokenStats: accumulateTokenStats(state.tokenStats, model, usage) };
      if (pendingTimer !== null) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void write(state);
      }, TOKEN_FLUSH_INTERVAL_MS);
      // The timer must not hold the process open on its own.
      pendingTimer.unref?.();
    },
    /**
     * Stop coalescing and flush the current state.
     * @returns {Promise<void>} settlement after the final write.
     */
    async dispose() {
      disposed = true;
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      await write(state);
    }
  };
}
