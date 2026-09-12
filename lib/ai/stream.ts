// lib/ai/stream.ts — the streaming twin of callAi, for the one surface where a person is waiting
// on the line: the phone receptionist.
//
// callAi returns when the whole reply exists. On a phone that is the wrong shape: the caller hears
// nothing until the last token, then everything at once. Streaming lets the text-to-speech engine
// start on the first sentence while the model is still writing the second, which is most of the
// difference between "an IVR" and "someone answering".
//
// Same model roster, same usage log, same cache breakpoint as callAi. No mid-stream retry: a retry
// after the caller has heard half a sentence would repeat it.
import type Anthropic from '@anthropic-ai/sdk';
import { aiClient, aiConfigured, AiNotConfigured, type AiCallOptions } from './client';
import { requestParamsFor } from './models';
import { readUsage, recordAiUsage } from './usage';

export interface AiStreamResult {
  /** The full text, once the stream has ended. */
  text: string;
  model: string;
  latencyMs: number;
  /** Time to the first text delta — the number a caller actually feels. */
  firstTokenMs: number | null;
}

export async function streamAi(
  opts: Omit<AiCallOptions, 'tools' | 'toolChoice' | 'retries'>,
  onText: (delta: string) => void,
): Promise<AiStreamResult> {
  if (!aiConfigured()) throw new AiNotConfigured();
  const params = requestParamsFor(opts.role);
  const started = Date.now();
  let firstTokenMs: number | null = null;

  try {
    const stream = aiClient().messages.stream(
      {
        ...params,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.system
          ? { system: opts.cacheSystem ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }] : opts.system }
          : {}),
        messages: opts.messages,
      },
      { signal: opts.signal },
    );
    stream.on('text', (delta: string) => {
      if (firstTokenMs === null) firstTokenMs = Date.now() - started;
      onText(delta);
    });
    const message: Anthropic.Message = await stream.finalMessage();
    const latencyMs = Date.now() - started;
    recordAiUsage({ role: opts.role, model: params.model, surface: opts.surface, latencyMs, userEmail: opts.userEmail, ...readUsage(message.usage) });
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return { text, model: params.model, latencyMs, firstTokenMs };
  } catch (err) {
    recordAiUsage({ role: opts.role, model: params.model, surface: opts.surface, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, error: err instanceof Error ? err.name : 'unknown', userEmail: opts.userEmail });
    throw err;
  }
}
