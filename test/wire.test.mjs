/**
 * Wire-format translation tests.
 *
 * The adapter's mapping rules are pure functions, and that is exactly where a
 * protocol bug is silent: an assistant turn whose `tool_calls` arrive under the
 * wrong shape, a `tool` message missing its `tool_call_id`, or a `finish_reason`
 * reported as `stop` when the model actually asked for tools. Each of those
 * still produces a well-formed HTTP 200, so nothing upstream reports it — the
 * conversation simply does the wrong thing. These tests pin the mapping.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

import {
  toFinishReason,
  toHarnessUsage,
  toWireContent,
  toWireMessages,
  toWireToolCalls,
  toWireTools,
  withRequiredArrays
} from '../lib/wire.js';

const here = dirname(fileURLToPath(import.meta.url));

/** An image loader standing in for the attachment service. */
const loader = async () => ({ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' });

test('a text-only message collapses to a plain string', () => {
  // Every OpenAI-compatible endpoint takes this shape without negotiation, so a
  // message that is only text must not be sent as a structured part array.
  return toWireContent([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }], loader).then((content) => {
    assert.equal(content, 'hello world');
  });
});

test('a message with an image keeps the structured part array', async () => {
  const content = await toWireContent(
    [{ type: 'text', text: 'what is this?' }, { type: 'image', attachment: { attachmentId: 'a1' } }],
    loader
  );
  assert.deepEqual(content, [
    { type: 'text', text: 'what is this?' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }
  ]);
});

test('an unreadable image is dropped rather than failing the whole turn', async () => {
  // The harness already substitutes placeholder text for models that declare
  // text-only input; throwing here over an unreadable attachment would be worse
  // than sending the text that did load.
  const content = await toWireContent(
    [{ type: 'text', text: 'describe' }, { type: 'image', attachment: { attachmentId: 'gone' } }],
    async () => undefined
  );
  assert.deepEqual(content, [{ type: 'text', text: 'describe' }]);
});

test('a real image round-trips onto the wire byte-for-byte', async () => {
  // The fixture is a genuine PNG, and that is the point: a corrupt one makes
  // every provider reject the request with an opaque "broken data stream",
  // which reads exactly like "this model cannot take images" and once led to
  // that wrong conclusion. Keeping a valid fixture plus this check means a
  // failing image test can only ever mean the translation is broken.
  const png = readFileSync(join(here, 'fixtures', 'red-64x64.png'));
  assert.ok(
    png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'the fixture must carry the PNG signature'
  );
  // Read the IHDR, so a truncated or mislabelled fixture cannot pass as usable.
  assert.equal(png.readUInt32BE(16), 64, 'fixture width');
  assert.equal(png.readUInt32BE(20), 64, 'fixture height');
  assert.equal(png.readUInt8(25), 2, 'fixture colour type must be truecolour');
  assert.equal(pixelDataLength(png), 64 * (1 + 64 * 3), 'the IDAT must inflate to exactly one 64x64 truecolour frame');

  const content = await toWireContent([{ type: 'image', attachment: { attachmentId: 'red' } }], async () => ({
    data: png,
    mediaType: 'image/png'
  }));
  const part = content[0];
  assert.equal(part.type, 'image_url');
  assert.match(part.image_url.url, /^data:image\/png;base64,/);
  const decoded = Buffer.from(part.image_url.url.split(',')[1], 'base64');
  assert.ok(decoded.equals(png), 'the wire payload must decode back to the exact fixture bytes');
});

/**
 * The inflated byte length of a PNG's image data.
 *
 * This is the integrity check that catches a truncated or corrupt fixture: the
 * declared dimensions have to match what the IDAT actually decompresses to, and
 * the compressed stream has to inflate at all.
 *
 * @param {Buffer} png - the encoded PNG.
 * @returns {number} decompressed IDAT length.
 */
function pixelDataLength(png) {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.ok(chunks.length > 0, 'the fixture carries no IDAT chunk');
  return inflateSync(Buffer.concat(chunks)).length;
}

test('a tool call is a message property, never a content part', async () => {
  const blocks = [{ type: 'tool-call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' }];
  assert.deepEqual(toWireToolCalls(blocks), [
    { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }
  ]);
  // Its presence keeps the content structured rather than collapsing to a string.
  assert.deepEqual(await toWireContent(blocks, loader), []);
  assert.equal(toWireToolCalls([{ type: 'text', text: 'hi' }]), undefined);
});

test('an assistant turn that only called tools sends null content', async () => {
  // The wire wants null, not "", and some upstreams in the free pool reject the
  // empty string outright — which would make every tool call fail.
  const wire = await toWireMessages(
    [{ role: 'assistant', content: [{ type: 'tool-call', id: 'call_1', name: 'f', arguments: '{}' }] }],
    { loadImage: loader }
  );
  assert.deepEqual(wire, [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'f', arguments: '{}' } }] }]);
});

test('a tool result carries the id the assistant called with', async () => {
  // Without `tool_call_id` the upstream cannot pair the result with its request
  // and rejects the whole conversation.
  const wire = await toWireMessages([{ role: 'tool', toolCallId: 'call_1', content: [{ type: 'text', text: '18°C' }] }], { loadImage: loader });
  assert.deepEqual(wire, [{ role: 'tool', tool_call_id: 'call_1', content: '18°C' }]);
});

test('a developer message is folded into the system role', async () => {
  // Endpoints that predate the `developer` role reject it as an unknown value,
  // and it occupies the same slot as `system` anyway.
  const wire = await toWireMessages([{ role: 'developer', content: [{ type: 'text', text: 'be terse' }] }], { loadImage: loader });
  assert.deepEqual(wire, [{ role: 'system', content: 'be terse' }]);
});

test('stored reasoning is replayed only when the caller supplies it', async () => {
  const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'answer' }] }];
  const without = await toWireMessages(messages, { loadImage: loader });
  assert.equal(Object.prototype.hasOwnProperty.call(without[0], 'reasoning'), false);

  const withReasoning = await toWireMessages(messages, { loadImage: loader, reasoningOf: () => 'because' });
  assert.equal(withReasoning[0].reasoning, 'because');

  // Empty reasoning is omitted rather than sent as an empty field.
  const empty = await toWireMessages(messages, { loadImage: loader, reasoningOf: () => '' });
  assert.equal(Object.prototype.hasOwnProperty.call(empty[0], 'reasoning'), false);
});

test('tool schemas pass through with an explicit required array', () => {
  const wire = toWireTools([
    {
      name: 'get_weather',
      description: 'Look up the weather',
      parameters: { type: 'object', properties: { city: { type: 'string' } } }
    }
  ]);
  assert.deepEqual(wire, [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Look up the weather',
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: [] }
      }
    }
  ]);
  assert.equal(toWireTools([]), undefined);
  assert.equal(toWireTools(undefined), undefined);
});

test('required arrays are filled through nested, array, and union schemas', () => {
  // Part of the upstream pool rejects a missing `required` as `null is not of
  // type "array"`, so the fill has to reach every object node, not only the root.
  const filled = withRequiredArrays({
    type: 'object',
    properties: {
      outer: { type: 'object', properties: { inner: { type: 'object' } } },
      list: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' } } } },
      choice: { anyOf: [{ type: 'object' }, { type: 'string' }] }
    }
  });

  assert.deepEqual(filled, {
    type: 'object',
    properties: {
      outer: { type: 'object', properties: { inner: { type: 'object', required: [] } }, required: [] },
      list: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' } }, required: [] } },
      choice: { anyOf: [{ type: 'object', required: [] }, { type: 'string' }] }
    },
    required: []
  });
});

test('an existing required array is preserved', () => {
  const filled = withRequiredArrays({ type: 'object', required: ['city'], properties: { city: { type: 'string' } } });
  assert.deepEqual(filled.required, ['city']);
});

test('cache tokens are subtracted out of the input count, not added beside it', () => {
  // The harness keeps uncached input disjoint from cache reads and writes
  // (billed input is their sum), while the endpoint folds cache hits into
  // `prompt_tokens`. Counting both would double-charge every cached call.
  const usage = toHarnessUsage({
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200,
    prompt_tokens_details: { cached_tokens: 800 },
    completion_tokens_details: { reasoning_tokens: 50 }
  });
  assert.deepEqual(usage, {
    inputTokens: 200,
    outputTokens: 200,
    totalTokens: 1200,
    cacheReadTokens: 800,
    reasoningTokens: 50
  });
});

test('usage normalizes a malformed or absent payload instead of emitting NaN', () => {
  assert.equal(toHarnessUsage(undefined), undefined);
  assert.equal(toHarnessUsage(null), undefined);
  assert.deepEqual(toHarnessUsage({ prompt_tokens: 'many', completion_tokens: undefined }), {
    inputTokens: 0,
    outputTokens: 0
  });
  // A cache count larger than the prompt cannot drive the input below zero.
  assert.equal(toHarnessUsage({ prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 999 } }).inputTokens, 0);
});

test('finish reasons map onto the harness vocabulary', () => {
  // `tool_calls` is the one that matters: reporting it as `stop` would end the
  // turn with the requested calls unexecuted.
  assert.deepEqual(toFinishReason('tool_calls'), { kind: 'tool-calls' });
  assert.deepEqual(toFinishReason('function_call'), { kind: 'tool-calls' });
  assert.deepEqual(toFinishReason('length'), { kind: 'max-tokens' });
  assert.deepEqual(toFinishReason('stop'), { kind: 'stop' });
  assert.deepEqual(toFinishReason(undefined), { kind: 'stop' });
  assert.deepEqual(toFinishReason('something_new'), { kind: 'stop' });
});
