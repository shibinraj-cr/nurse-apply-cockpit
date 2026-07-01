// Anthropic Messages API wrapper (DESIGN.md §4). Two disciplines baked in:
//   1. Structured output via a forced tool call (guarantees valid JSON shape).
//   2. Prompt caching: the byte-stable grounding context (candidate profile /
//      master CV) goes in a cached system block; per-posting text in the user
//      turn. Verify usage.cache_read_input_tokens to confirm cache hits.
//
// Every AI module degrades gracefully when no ANTHROPIC_API_KEY is set: getClient()
// returns null and callers fall back to deterministic/heuristic logic, so the
// cockpit stays fully runnable without a key. NODE-ONLY.

import Anthropic from '@anthropic-ai/sdk';
import { env, hasAnthropic } from './env';

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!hasAnthropic) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export interface CallUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface StructuredResponse<T> {
  data: T;
  usage: CallUsage;
  model: string;
}

/**
 * Force a single structured tool call and return its validated input object.
 * Returns null when no API key is configured (caller must provide a fallback).
 */
export async function structuredCall<T>(opts: {
  model: string;
  system: string;
  /** Byte-stable grounding context placed in a cache_control: ephemeral block. */
  cachedContext?: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<StructuredResponse<T> | null> {
  const c = getClient();
  if (!c) return null;

  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: opts.system }];
  if (opts.cachedContext) {
    system.push({
      type: 'text',
      text: opts.cachedContext,
      cache_control: { type: 'ephemeral' },
    });
  }

  const msg = await c.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1500,
    system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: opts.toolName },
    messages: [{ role: 'user', content: opts.user }],
  });

  const block = msg.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Anthropic returned no tool_use block');
  }

  const usage = msg.usage as unknown as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };

  return {
    data: block.input as T,
    model: msg.model,
    usage: {
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      cacheReadTokens: usage?.cache_read_input_tokens,
      cacheWriteTokens: usage?.cache_creation_input_tokens,
    },
  };
}
