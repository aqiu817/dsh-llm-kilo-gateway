/**
 * Wire-format translation between the harness vocabulary and the Kilo Gateway's
 * OpenAI-compatible Chat Completions API.
 *
 * Kept separate from the adapter so the mapping rules — which are pure, and
 * which is where every subtle protocol bug lives — can be read and tested
 * without a network or a live harness.
 *
 * @module dsh-llm-kilo-gateway/wire
 */

/**
 * Convert one harness message's content blocks into the wire `content` value.
 *
 * Text blocks join into a plain string when the message carries nothing else,
 * because that is the shape every OpenAI-compatible endpoint understands
 * without negotiation. A message with images or tool calls keeps the structured
 * form, since collapsing it would silently drop the non-text parts.
 *
 * @param {object[]} blocks - the message's content blocks.
 * @param {(ref: object) => Promise<{data: Uint8Array, mediaType: string}|undefined>} loadImage - resolves one image reference to bytes.
 * @param {AbortSignal} [signal] - cancellation for image reads.
 * @returns {Promise<string|object[]>} the wire content value.
 */
export async function toWireContent(blocks, loadImage, signal) {
  const parts = [];
  let sawNonText = false;
  for (const block of blocks) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image') {
      sawNonText = true;
      const image = await loadImage(block.attachment, signal);
      if (image === undefined) continue;
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` }
      });
      continue;
    }
    if (block.type === 'tool-call') {
      // Handled by the caller: a tool call is a property of the assistant
      // message, not a content part.
      sawNonText = true;
      continue;
    }
    // `reasoning`, `file`, and tool-change blocks have no wire representation
    // here. Reasoning is replayed as its own field by the caller; files are
    // projected to handle text by the harness before reaching an adapter.
    sawNonText = true;
  }

  if (!sawNonText) return parts.map((part) => part.text).join('');
  return parts;
}

/**
 * Build the wire `tool_calls` array for one assistant message.
 * @param {object[]} blocks - the message's content blocks.
 * @returns {object[]|undefined} the tool calls, or undefined when there are none.
 */
export function toWireToolCalls(blocks) {
  const calls = blocks.filter((block) => block.type === 'tool-call');
  if (calls.length === 0) return undefined;
  return calls.map((call) => ({
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: call.arguments }
  }));
}

/**
 * Convert harness messages into the wire message array.
 *
 * The harness's `tool` role and its `toolCallId` map onto the wire's
 * `role: "tool"` plus `tool_call_id`, and an assistant message that requested
 * tools carries them in `tool_calls` with `content` allowed to be null — both
 * are required for the upstream to accept a tool result at all.
 *
 * @param {object[]} messages - harness messages, in order.
 * @param {object} options - translation inputs.
 * @param {(ref: object, signal?: AbortSignal) => Promise<{data: Uint8Array, mediaType: string}|undefined>} options.loadImage - resolves an image reference.
 * @param {AbortSignal} [options.signal] - cancellation for image reads.
 * @param {(message: object) => string|undefined} [options.reasoningOf] - replays stored reasoning for one assistant message.
 * @returns {Promise<object[]>} wire messages.
 */
export async function toWireMessages(messages, options) {
  const wire = [];
  for (const message of messages) {
    const blocks = Array.isArray(message.content) ? message.content : [];

    if (message.role === 'tool') {
      wire.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
      });
      continue;
    }

    if (message.role === 'assistant') {
      const toolCalls = toWireToolCalls(blocks);
      const content = await toWireContent(blocks, options.loadImage, options.signal);
      const reasoning = options.reasoningOf?.(message);
      // A turn that only called tools has nothing to say, and the wire wants
      // null rather than an empty value: `toWireContent` answers `""` for a
      // text-only message but `[]` once any non-text block is present, so both
      // empties have to be recognized here. Some upstreams in the free pool
      // reject either one outright, which would fail every tool call.
      const emptyContent = content === '' || (Array.isArray(content) && content.length === 0);
      wire.push({
        role: 'assistant',
        content: toolCalls !== undefined && emptyContent ? null : content,
        ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
        ...(reasoning === undefined || reasoning.length === 0 ? {} : { reasoning })
      });
      continue;
    }

    // `system`, `developer`, and `user` pass through by role. A `developer`
    // message is folded into `system`: it is the harness's name for the same
    // slot, and OpenAI-compatible endpoints that predate the `developer` role
    // reject it as an unknown value.
    wire.push({
      role: message.role === 'developer' ? 'system' : message.role,
      content: await toWireContent(blocks, options.loadImage, options.signal)
    });
  }
  return wire;
}

/**
 * Convert harness tool schemas into the wire `tools` array.
 *
 * Every object node gets an explicit `required` array. The harness omits the
 * field when no parameter is required, and part of the upstream pool rejects
 * that as `null is not of type "array"`.
 *
 * @param {object[]|undefined} tools - harness tool schemas.
 * @returns {object[]|undefined} wire tools, or undefined when there are none.
 */
export function toWireTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: withRequiredArrays(tool.parameters)
    }
  }));
}

/**
 * Fill a missing `required` array into every object node of a JSON schema.
 * @param {unknown} schema - the schema to walk.
 * @returns {unknown} the schema, with `required` present on every object node.
 */
export function withRequiredArrays(schema) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const node = { ...schema };
  const isObjectNode = node.type === 'object' || node.properties !== undefined;
  if (isObjectNode && !Array.isArray(node.required)) node.required = [];
  if (node.properties !== null && typeof node.properties === 'object') {
    node.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, child]) => [key, withRequiredArrays(child)])
    );
  }
  if (node.items !== undefined) node.items = withRequiredArrays(node.items);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(node[key])) node[key] = node[key].map(withRequiredArrays);
  }
  return node;
}

/**
 * Convert one wire usage object into the harness's disjoint token accounting.
 *
 * The harness counts uncached input separately from cache reads and writes
 * (billed input is their sum), while an OpenAI-compatible endpoint folds cache
 * hits into `prompt_tokens`. The cached part is therefore subtracted out of the
 * input count rather than added alongside it.
 *
 * @param {object|undefined} usage - the wire `usage` object.
 * @returns {object|undefined} a harness usage object, or undefined when absent.
 */
export function toHarnessUsage(usage) {
  if (usage === null || typeof usage !== 'object') return undefined;
  const number = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
  const prompt = number(usage.prompt_tokens);
  const details = usage.prompt_tokens_details ?? {};
  const cacheReadTokens = number(details.cached_tokens);
  const cacheWriteTokens = number(details.cache_write_tokens);
  const completionDetails = usage.completion_tokens_details ?? {};
  const reasoningTokens = number(completionDetails.reasoning_tokens);
  const inputTokens = Math.max(0, prompt - cacheReadTokens - cacheWriteTokens);
  const outputTokens = number(usage.completion_tokens);
  return {
    inputTokens,
    outputTokens,
    ...(Number.isFinite(usage.total_tokens) ? { totalTokens: usage.total_tokens } : {}),
    ...(cacheReadTokens === 0 ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === 0 ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === 0 ? {} : { reasoningTokens })
  };
}

/**
 * Map a wire `finish_reason` onto a harness finish reason.
 *
 * `tool_calls` is the one that matters: reporting it as `stop` would end the
 * turn with the requested calls unexecuted, because the loop only dispatches
 * tools when the finish reason says so.
 *
 * @param {string|undefined} reason - the wire finish reason.
 * @returns {object} a harness finish reason.
 */
export function toFinishReason(reason) {
  switch (reason) {
    case 'length':
      return { kind: 'max-tokens' };
    case 'tool_calls':
    case 'function_call':
      return { kind: 'tool-calls' };
    default:
      return { kind: 'stop' };
  }
}
