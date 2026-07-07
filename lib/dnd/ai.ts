// lib/dnd/ai.ts — AI server scaffolding for the /dnd platform (Phase I1). The single
// entry point every /dnd AI feature goes through: NPC sheet build/edit (I2/I3), plot
// hooks (I4), and session recaps (I5). Wraps @anthropic-ai/sdk with model pinning,
// bounded retry/backoff, and helpers for plain text, JSON, streaming, and tool use.
// Self-contained (no app-alias imports) so it's usable from scripts + tests too.
import Anthropic from '@anthropic-ai/sdk';

// Pinned but overridable. Defaults to the model the rest of this app already uses.
const MODEL = process.env.DND_AI_MODEL || process.env.RESEARCH_AI_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 800;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  return client;
}

/** True when an API key is configured — lets callers show a graceful "AI off" state. */
export function dndAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) return [429, 500, 502, 503, 529].includes(err.status ?? 0);
  if (err instanceof Error) return /fetch|network|econnreset|timeout|socket|abort/i.test(err.message);
  return false;
}

export interface DndAIOptions {
  system?: string;
  /** A single user string, or full message turns for multi-turn/agentic loops. */
  user: string | Anthropic.MessageParam[];
  maxTokens?: number;
  temperature?: number;
  /** Tools for structured output / agentic use (I2). */
  tools?: Anthropic.Tool[];
  toolChoice?: Anthropic.MessageCreateParams['tool_choice'];
}

function toMessages(user: DndAIOptions['user']): Anthropic.MessageParam[] {
  return typeof user === 'string' ? [{ role: 'user', content: user }] : user;
}

/** Raw message create with retry/backoff — returns the full Anthropic response. */
export async function dndCreate(opts: DndAIOptions): Promise<Anthropic.Message> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await anthropic().messages.create({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        ...(opts.system ? { system: opts.system } : {}),
        ...(opts.tools ? { tools: opts.tools } : {}),
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
        messages: toMessages(opts.user),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES && retryable(err)) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/** Convenience: run a prompt and return the concatenated text output. */
export async function dndComplete(opts: DndAIOptions): Promise<string> {
  const res = await dndCreate(opts);
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** Run a prompt expecting JSON; tolerant of code fences / surrounding prose. */
export async function dndCompleteJSON<T = unknown>(opts: DndAIOptions): Promise<T> {
  const raw = await dndComplete(opts);
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error('AI response was not valid JSON.');
  }
}

/** Return the first tool-use block's input (structured output for I2). */
export async function dndToolCall<T = unknown>(opts: DndAIOptions): Promise<{ input: T; name: string } | null> {
  const res = await dndCreate(opts);
  const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return block ? { input: block.input as T, name: block.name } : null;
}

/** Stream a prompt's text deltas (for live NL edits / recaps — I3/I5). */
export async function* dndStream(opts: DndAIOptions): AsyncGenerator<string> {
  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    ...(opts.system ? { system: opts.system } : {}),
    messages: toMessages(opts.user),
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export { MODEL as DND_AI_MODEL };
