/**
 * Model discovery from the Kilo Gateway API.
 *
 * The catalog is the single source of truth for what each free model can do:
 * its context window, its output ceiling, the modalities it accepts, whether
 * it takes tool declarations, and which reasoning levels it offers. Every one
 * of those is read here rather than hard-coded, so a model added upstream is
 * fully usable without a release.
 *
 * @module dsh-llm-kilo-gateway/discovery
 */

import { DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_COMPLETION_TOKENS } from './state-util.js';

/**
 * Fetch all models from the Kilo Gateway API.
 * @param catalogUrl - the models endpoint URL
 * @param signal - optional AbortSignal
 * @returns the full model catalog
 */
export async function fetchAllModels(catalogUrl, signal) {
  const response = await fetch(catalogUrl, {
    signal,
    headers: { 'Accept': 'application/json' }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kilo Gateway model catalog returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Kilo Gateway model catalog response missing "data" array');
  }
  return data.data;
}

/**
 * Filter the model catalog for free models only.
 * @param allModels - the full model catalog
 * @returns array of normalized free model entries
 */
export function extractFreeModels(allModels) {
  return allModels
    .filter(m => m.isFree === true)
    .map(m => normalizeModel(m));
}

/**
 * Read the reasoning levels a catalog entry offers.
 *
 * The levels live in `opencode.variants`: each key is the level's *name* and
 * its `reasoning.effort` is the value the gateway accepts on the wire. A
 * variant with `reasoning.enabled === false` is the "off" level — it carries
 * `effort: "none"`, and whether that spelling is accepted is the model's own
 * business (some endpoints reject it as "reasoning is mandatory").
 *
 * Variant names differ per model (`low/medium/high`, `instant/thinking`,
 * `none/minimal/…`), so the names are kept verbatim as the offered level ids
 * rather than mapped onto a fixed vocabulary: an invented mapping would offer
 * levels the model never claimed.
 *
 * @param m - raw catalog entry
 * @returns ordered levels, or an empty array when the entry declares none
 */
export function reasoningLevelsOf(m) {
  const variants = m.opencode?.variants;
  if (variants === null || typeof variants !== 'object') return [];
  const levels = [];
  for (const [name, variant] of Object.entries(variants)) {
    if (name.length === 0) continue;
    const reasoning = variant?.reasoning;
    if (reasoning === null || typeof reasoning !== 'object') continue;
    const enabled = reasoning.enabled !== false;
    const effort = typeof reasoning.effort === 'string' ? reasoning.effort : undefined;
    // An enabled level with no wire value cannot be sent; an "off" level may
    // legitimately omit one, which means "send no reasoning field at all".
    if (enabled && (effort === undefined || effort.length === 0)) continue;
    levels.push({
      id: name,
      name,
      ...(effort === undefined || effort.length === 0 ? {} : { effort })
    });
  }
  return levels;
}

/**
 * Normalize a raw Kilo Gateway model entry into the plugin's model format.
 *
 * Capabilities are read from the catalog rather than assumed: `tools` is only
 * advertised when the entry lists the parameter, and the modalities come from
 * `architecture`. A field the catalog omits falls back to the conservative
 * answer (text-only, no tools), because claiming a capability the model lacks
 * makes the harness persist a request that can never succeed.
 *
 * @param m - raw model entry from the Kilo API
 * @returns normalized model
 */
export function normalizeModel(m) {
  const supported = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
  const inputModalities = m.architecture?.input_modalities ?? ['text'];
  const levels = reasoningLevelsOf(m);
  return {
    id: m.id,
    name: m.name || m.id,
    // The catalog states the window at the top level and the output ceiling
    // under `top_provider`; both are read with the same defaults the persisted
    // state uses, so a model keeps one shape whether it came from the network
    // or from the state file.
    contextLength: m.context_length || m.top_provider?.context_length || DEFAULT_CONTEXT_LENGTH,
    maxCompletionTokens: m.top_provider?.max_completion_tokens || DEFAULT_MAX_COMPLETION_TOKENS,
    inputModalities,
    outputModalities: m.architecture?.output_modalities || ['text'],
    supportsTools: supported.includes('tools'),
    reasoningLevels: levels,
    expires: m.expiration_date || undefined,
    mayTrainOnPrompts: m.mayTrainOnYourPrompts === true
  };
}
