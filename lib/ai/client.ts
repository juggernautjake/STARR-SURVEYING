// lib/ai/client.ts — one client, one place (audit §5, Phase 3 item 13).
//
// §5: *"Six unrelated AI surfaces, each with its own hand-rolled prompt and its own Anthropic
// client… A central `lib/ai/` module: one client factory, one model config, one tool registry, one
// context digest builder, one cost/usage log. Six copies of the same 40 lines is how prompt drift
// and cost surprises happen."*
//
// This is the client factory and the call wrapper. It does four things the six copies each did
// differently or not at all: pins the model by ROLE (not by a literal ID), retries the errors worth
// retrying, records what the call cost, and turns SDK errors into something a user can read.
//
// ── IT DOES NOT REPLACE THE EXISTING SURFACES OVERNIGHT ─────────────────────────────────────────
//
// `lib/research/ai-client.ts` already does retry, timeout, prompt versioning and error
// classification well, and rewriting a working research pipeline to prove a point is how a
// refactor becomes an outage. New surfaces use this; existing ones adopt it when they are next
// touched. What ships today is the single source for the MODEL and the USAGE LOG — the two things
// §5 measured as actually broken.

import Anthropic from '@anthropic-ai/sdk';
import { requestParamsFor, type AiRole } from './models';
import { readUsage, recordAiUsage } from './usage';

let cached: Anthropic | null = null;

/** The one client. Constructed lazily so importing this module in a build with no key does not throw.
 *
 *  A missing key is NOT defaulted to a placeholder: a placeholder produces a 401 at call time that
 *  reads like a revoked key, and somebody spends an afternoon rotating credentials that were never
 *  configured. `aiConfigured()` answers the question directly instead. */
export function aiClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  }
  return cached;
}

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export class AiNotConfigured extends Error {
  constructor() {
    super('AI is not configured on this deployment: ANTHROPIC_API_KEY is not set.');
    this.name = 'AiNotConfigured';
  }
}

export interface AiCallOptions {
  role: AiRole;
  /** Which part of the app is calling. Recorded, and the only way a cost report can name a culprit. */
  surface: string;
  system?: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  toolChoice?: Anthropic.MessageCreateParams['tool_choice'];
  maxTokens?: number;
  userEmail?: string | null;
  /** Retries for transient failures. 0 disables. */
  retries?: number;
  signal?: AbortSignal;
}

export interface AiCallResult {
  message: Anthropic.Message;
  /** Concatenated text blocks, for the common case. Tool calls are on `message.content`. */
  text: string;
  model: string;
  latencyMs: number;
  costCents: number | null;
}

/** Errors worth retrying: rate limits, overload, and transient server faults.
 *
 *  Deliberately NOT 400 or 401 — retrying a malformed request three times just makes the user wait
 *  three times as long for the same failure. */
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') return err.status >= 500;
  return false;
}

/** What to tell a user. The SDK's messages are accurate and unreadable; these are neither wrong nor
 *  alarming, and each says what the person should do next. */
export function userMessageFor(err: unknown): string {
  if (err instanceof AiNotConfigured) return 'The AI assistant is not set up on this system yet.';
  if (err instanceof Anthropic.RateLimitError) return 'The AI service is busy right now. Try again in a moment.';
  if (err instanceof Anthropic.AuthenticationError) return 'The AI service rejected our credentials. An administrator needs to check the API key.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check the connection and try again.';
  if (err instanceof Anthropic.APIError && err.status === 529) return 'The AI service is overloaded. Try again shortly.';
  if (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500) return 'The AI service had a problem. Try again shortly.';
  return 'The AI request could not be completed.';
}

export async function callAi(opts: AiCallOptions): Promise<AiCallResult> {
  if (!aiConfigured()) throw new AiNotConfigured();

  const params = requestParamsFor(opts.role);
  const retries = opts.retries ?? 2;
  const started = Date.now();

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await aiClient().messages.create(
        {
          ...params,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.system ? { system: opts.system } : {}),
          messages: opts.messages,
          ...(opts.tools?.length ? { tools: opts.tools } : {}),
          ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
        },
        { signal: opts.signal },
      );

      const latencyMs = Date.now() - started;
      const usage = readUsage(message.usage);
      recordAiUsage({
        role: opts.role,
        model: params.model,
        surface: opts.surface,
        latencyMs,
        userEmail: opts.userEmail,
        ...usage,
      });

      // Text blocks only. Tool-use blocks stay on `message.content` for the caller — flattening them
      // into the string is how a tool call becomes a paragraph of JSON in a chat window.
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return {
        message,
        text,
        model: params.model,
        latencyMs,
        costCents: null,
      };
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryable(err)) break;
      // Exponential backoff with jitter. Without the jitter, every request that failed together
      // retries together, and the retry storm is worse than the original spike.
      const delay = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Failures are recorded too. A cost report that only counts successes cannot explain a month where
  // half the calls timed out — the tokens were still spent.
  recordAiUsage({
    role: opts.role,
    model: params.model,
    surface: opts.surface,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: Date.now() - started,
    error: lastError instanceof Error ? lastError.name : 'unknown',
    userEmail: opts.userEmail,
  });

  throw lastError;
}
