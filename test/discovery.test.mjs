/**
 * Capability-discovery tests.
 *
 * The catalog is the single source of truth for what each free model can do, so
 * every capability this plugin offers — tool declarations, image input, and the
 * reasoning levels the picker lists — is read from it rather than hard-coded.
 * The failure mode is quiet in both directions: a capability claimed but absent
 * makes the harness persist a request that can never succeed, and one present
 * but not read silently removes a feature the model actually has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFreeModels, normalizeModel, reasoningLevelsOf } from '../lib/discovery.js';

test('only free models survive the filter', () => {
  const models = extractFreeModels([
    { id: 'free-one', name: 'Free One', isFree: true },
    { id: 'paid-one', name: 'Paid One', isFree: false },
    { id: 'unstated', name: 'Unstated' }
  ]);
  assert.deepEqual(models.map((m) => m.id), ['free-one']);
});

test('tool support is read from the advertised parameters', () => {
  // Claiming `tools` for a model that never listed the parameter makes the
  // harness send a tool declaration the upstream rejects.
  assert.equal(normalizeModel({ id: 'a', supported_parameters: ['tools', 'reasoning'] }).supportsTools, true);
  assert.equal(normalizeModel({ id: 'b', supported_parameters: ['reasoning'] }).supportsTools, false);
  assert.equal(normalizeModel({ id: 'c' }).supportsTools, false, 'an unstated capability falls back to the conservative answer');
});

test('input modalities come from the catalog architecture', () => {
  const vision = normalizeModel({ id: 'a', architecture: { input_modalities: ['text', 'image'] } });
  assert.deepEqual(vision.inputModalities, ['text', 'image']);
  const textOnly = normalizeModel({ id: 'b', architecture: { input_modalities: ['text'] } });
  assert.deepEqual(textOnly.inputModalities, ['text']);
  assert.deepEqual(normalizeModel({ id: 'c' }).inputModalities, ['text'], 'an unstated modality is text-only');
});

test('windows and ceilings are read from where the catalog states them', () => {
  const model = normalizeModel({
    id: 'a',
    context_length: 200000,
    top_provider: { context_length: 100000, max_completion_tokens: 8192 }
  });
  // The top-level window wins when both are present; the ceiling only ever
  // appears under `top_provider`.
  assert.equal(model.contextLength, 200000);
  assert.equal(model.maxCompletionTokens, 8192);

  const fallback = normalizeModel({ id: 'b', top_provider: { context_length: 131072 } });
  assert.equal(fallback.contextLength, 131072);
  assert.ok(fallback.maxCompletionTokens > 0, 'an absent ceiling still yields a usable positive integer');
});

test('the training flag is only set when the catalog states it', () => {
  assert.equal(normalizeModel({ id: 'a', mayTrainOnYourPrompts: true }).mayTrainOnPrompts, true);
  assert.equal(normalizeModel({ id: 'b' }).mayTrainOnPrompts, false);
});

test('reasoning levels keep the names the catalog used', () => {
  // Variant names differ per model (`low/medium/high`, `instant/thinking`), so
  // they are kept verbatim: mapping them onto a fixed vocabulary would offer
  // levels the model never claimed.
  const levels = reasoningLevelsOf({
    opencode: {
      variants: {
        low: { reasoning: { enabled: true, effort: 'low' } },
        medium: { reasoning: { enabled: true, effort: 'medium' } },
        high: { reasoning: { enabled: true, effort: 'high' } }
      }
    }
  });
  assert.deepEqual(levels, [
    { id: 'low', name: 'low', effort: 'low' },
    { id: 'medium', name: 'medium', effort: 'medium' },
    { id: 'high', name: 'high', effort: 'high' }
  ]);
});

test('an off level may carry no wire value, but an enabled one may not', () => {
  // An enabled level with no `effort` cannot be sent, so offering it would make
  // the picker list a choice that fails on selection. An off level legitimately
  // omits one, which means "send no reasoning field at all".
  const levels = reasoningLevelsOf({
    opencode: {
      variants: {
        broken: { reasoning: { enabled: true } },
        off: { reasoning: { enabled: false } },
        kept: { reasoning: { enabled: true, effort: 'high' } }
      }
    }
  });
  assert.deepEqual(levels.map((level) => level.id), ['off', 'kept']);
  assert.equal(levels[0].effort, undefined);
});

test('a catalog entry with no variants offers no reasoning levels', () => {
  // `kilo-auto` declares an empty variant map, so the picker shows no effort
  // control for it rather than one that cannot be honored.
  assert.deepEqual(reasoningLevelsOf({}), []);
  assert.deepEqual(reasoningLevelsOf({ opencode: {} }), []);
  assert.deepEqual(reasoningLevelsOf({ opencode: { variants: {} } }), []);
  assert.deepEqual(reasoningLevelsOf({ opencode: { variants: { weird: { reasoning: null } } } }), []);
});
