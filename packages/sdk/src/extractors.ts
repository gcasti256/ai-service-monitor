/**
 * Token and response extractors for common AI SDK response shapes.
 *
 * These handle the raw response objects from OpenAI and Anthropic SDKs,
 * extracting token usage and content without requiring the caller to
 * know the response structure.
 */

/**
 * Extract token usage from an OpenAI chat completion response.
 *
 * Expected shape:
 * ```json
 * { "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 } }
 * ```
 */
export function extractOpenAITokens(
  result: unknown,
): { input: number; output: number } | null {
  if (!isObject(result)) return null;

  const usage = (result as Record<string, unknown>).usage;
  if (!isObject(usage)) return null;

  const u = usage as Record<string, unknown>;
  const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0;
  const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;

  if (promptTokens === 0 && completionTokens === 0) return null;

  return { input: promptTokens, output: completionTokens };
}

/**
 * Extract token usage from an Anthropic message response.
 *
 * Expected shape:
 * ```json
 * { "usage": { "input_tokens": 100, "output_tokens": 50 } }
 * ```
 */
export function extractAnthropicTokens(
  result: unknown,
): { input: number; output: number } | null {
  if (!isObject(result)) return null;

  const usage = (result as Record<string, unknown>).usage;
  if (!isObject(usage)) return null;

  const u = usage as Record<string, unknown>;
  const inputTokens = typeof u.input_tokens === 'number' ? u.input_tokens : 0;
  const outputTokens = typeof u.output_tokens === 'number' ? u.output_tokens : 0;

  if (inputTokens === 0 && outputTokens === 0) return null;

  return { input: inputTokens, output: outputTokens };
}

/**
 * Extract response content from an OpenAI chat completion.
 *
 * Expected shape:
 * ```json
 * {
 *   "choices": [{
 *     "message": { "content": "Hello!" },
 *     "finish_reason": "stop"
 *   }]
 * }
 * ```
 */
export function extractOpenAIResponse(
  result: unknown,
): { content?: string; finishReason?: string } | null {
  if (!isObject(result)) return null;

  const r = result as Record<string, unknown>;
  const choices = r.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const firstChoice = choices[0];
  if (!isObject(firstChoice)) return null;

  const choice = firstChoice as Record<string, unknown>;
  const message = choice.message;
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined;

  let content: string | undefined;
  if (isObject(message)) {
    const msg = message as Record<string, unknown>;
    content = typeof msg.content === 'string' ? msg.content : undefined;
  }

  if (!content && !finishReason) return null;

  return { content, finishReason };
}

/**
 * Extract response content from an Anthropic message response.
 *
 * Expected shape:
 * ```json
 * {
 *   "content": [{ "type": "text", "text": "Hello!" }],
 *   "stop_reason": "end_turn"
 * }
 * ```
 */
export function extractAnthropicResponse(
  result: unknown,
): { content?: string; finishReason?: string } | null {
  if (!isObject(result)) return null;

  const r = result as Record<string, unknown>;
  const contentBlocks = r.content;
  const stopReason = typeof r.stop_reason === 'string' ? r.stop_reason : undefined;

  let content: string | undefined;
  if (Array.isArray(contentBlocks) && contentBlocks.length > 0) {
    const firstBlock = contentBlocks[0];
    if (isObject(firstBlock)) {
      const block = firstBlock as Record<string, unknown>;
      content = typeof block.text === 'string' ? block.text : undefined;
    }
  }

  if (!content && !stopReason) return null;

  return { content, finishReason: stopReason };
}

/** Type guard for plain objects. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
