import { describe, it, expect } from 'vitest';
import {
  extractOpenAITokens,
  extractAnthropicTokens,
  extractOpenAIResponse,
  extractAnthropicResponse,
} from '../extractors.js';

describe('extractOpenAITokens', () => {
  it('extracts tokens from a standard OpenAI response', () => {
    const result = extractOpenAITokens({
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    expect(result).toEqual({ input: 100, output: 50 });
  });

  it('returns null for missing usage', () => {
    expect(extractOpenAITokens({})).toBeNull();
    expect(extractOpenAITokens({ usage: null })).toBeNull();
  });

  it('returns null for zero tokens', () => {
    expect(extractOpenAITokens({ usage: { prompt_tokens: 0, completion_tokens: 0 } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractOpenAITokens(null)).toBeNull();
    expect(extractOpenAITokens(undefined)).toBeNull();
    expect(extractOpenAITokens('string')).toBeNull();
    expect(extractOpenAITokens(42)).toBeNull();
  });

  it('handles missing token fields gracefully', () => {
    const result = extractOpenAITokens({ usage: { prompt_tokens: 100 } });
    expect(result).toEqual({ input: 100, output: 0 });
  });
});

describe('extractAnthropicTokens', () => {
  it('extracts tokens from a standard Anthropic response', () => {
    const result = extractAnthropicTokens({
      usage: { input_tokens: 200, output_tokens: 100 },
    });
    expect(result).toEqual({ input: 200, output: 100 });
  });

  it('returns null for missing usage', () => {
    expect(extractAnthropicTokens({})).toBeNull();
  });

  it('returns null for zero tokens', () => {
    expect(extractAnthropicTokens({ usage: { input_tokens: 0, output_tokens: 0 } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractAnthropicTokens(null)).toBeNull();
    expect(extractAnthropicTokens([])).toBeNull();
  });
});

describe('extractOpenAIResponse', () => {
  it('extracts content and finish_reason from OpenAI response', () => {
    const result = extractOpenAIResponse({
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
    });
    expect(result).toEqual({ content: 'Hello!', finishReason: 'stop' });
  });

  it('returns null for empty choices', () => {
    expect(extractOpenAIResponse({ choices: [] })).toBeNull();
  });

  it('returns null for missing choices', () => {
    expect(extractOpenAIResponse({})).toBeNull();
  });

  it('handles missing message content', () => {
    const result = extractOpenAIResponse({
      choices: [{ message: {}, finish_reason: 'length' }],
    });
    expect(result).toEqual({ content: undefined, finishReason: 'length' });
  });

  it('returns null when no useful data is found', () => {
    expect(extractOpenAIResponse({ choices: [{ message: {} }] })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(extractOpenAIResponse(null)).toBeNull();
    expect(extractOpenAIResponse('string')).toBeNull();
  });
});

describe('extractAnthropicResponse', () => {
  it('extracts content and stop_reason from Anthropic response', () => {
    const result = extractAnthropicResponse({
      content: [{ type: 'text', text: 'Hello from Claude' }],
      stop_reason: 'end_turn',
    });
    expect(result).toEqual({ content: 'Hello from Claude', finishReason: 'end_turn' });
  });

  it('returns null for empty content blocks', () => {
    expect(extractAnthropicResponse({ content: [] })).toBeNull();
  });

  it('handles missing text in content block', () => {
    const result = extractAnthropicResponse({
      content: [{ type: 'image' }],
      stop_reason: 'end_turn',
    });
    expect(result).toEqual({ content: undefined, finishReason: 'end_turn' });
  });

  it('returns null for non-object input', () => {
    expect(extractAnthropicResponse(null)).toBeNull();
  });

  it('extracts stop_reason when no content blocks exist', () => {
    const result = extractAnthropicResponse({ stop_reason: 'max_tokens' });
    expect(result).toEqual({ content: undefined, finishReason: 'max_tokens' });
  });
});
