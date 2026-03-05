// lib/research/ai-client.ts — Claude API wrapper for research feature
// All AI calls go through this wrapper to enforce consistency:
// - Model pinning, temperature enforcement, prompt versioning, usage logging
// - Retry with exponential backoff for transient failures
// - Request timeout handling
import Anthropic from '@anthropic-ai/sdk';
import { PROMPTS, type PromptKey } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const AI_MODEL = process.env.RESEARCH_AI_MODEL || 'claude-sonnet-4-5-20250929';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes

export interface AICallOptions {
  promptKey: PromptKey;
  userContent: string | Anthropic.MessageCreateParams['messages'][0]['content'];
  maxTokens?: number;
  /** Override max retries for this call (default: 3) */
  maxRetries?: number;
  /** Override timeout in ms for this call (default: 120000) */
  timeoutMs?: number;
}

export interface AICallResult {
  response: unknown;
  raw: string;
  promptVersion: string;
  model: string;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  retryCount: number;
}

// ── Error Classification ──────────────────────────────────────────────────────

/** AI error categories with user-friendly messages */
export type AIErrorCategory =
  | 'rate_limited'
  | 'usage_exhausted'
  | 'authentication'
  | 'connectivity'
  | 'timeout'
  | 'overloaded'
  | 'invalid_request'
  | 'content_filtered'
  | 'server_error'
  | 'unknown';

/** Custom error class that includes a user-friendly message and category */
export class AIServiceError extends Error {
  readonly category: AIErrorCategory;
  readonly userMessage: string;
  readonly retryCount: number;
  readonly statusCode?: number;

  constructor(opts: {
    category: AIErrorCategory;
    userMessage: string;
    technicalMessage: string;
    retryCount: number;
    statusCode?: number;
  }) {
    super(opts.technicalMessage);
    this.name = 'AIServiceError';
    this.category = opts.category;
    this.userMessage = opts.userMessage;
    this.retryCount = opts.retryCount;
    this.statusCode = opts.statusCode;
  }
}

/**
 * Classify an error into a user-friendly category with an actionable message.
 */
function classifyAIError(err: unknown, retryCount: number, operation: string): AIServiceError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const msg = err.message || '';

    if (status === 401 || status === 403) {
      return new AIServiceError({
        category: 'authentication',
        userMessage: 'AI service authentication failed. The API key may be invalid or expired. Please contact your administrator to verify the API configuration.',
        technicalMessage: `${operation}: Auth error (${status}): ${msg}`,
        retryCount,
        statusCode: status,
      });
    }

    if (status === 429) {
      // Distinguish between rate limit and usage exhaustion
      const isUsageLimit = msg.toLowerCase().includes('quota') ||
                           msg.toLowerCase().includes('billing') ||
                           msg.toLowerCase().includes('credit') ||
                           msg.toLowerCase().includes('exceeded');
      if (isUsageLimit) {
        return new AIServiceError({
          category: 'usage_exhausted',
          userMessage: 'AI usage limit has been reached. Your account may need additional credits or a plan upgrade. Please check your Anthropic billing dashboard or contact your administrator.',
          technicalMessage: `${operation}: Usage exhausted (429): ${msg}`,
          retryCount,
          statusCode: 429,
        });
      }
      return new AIServiceError({
        category: 'rate_limited',
        userMessage: 'The AI service is temporarily rate-limited due to high demand. The system retried automatically but the limit persists. Please wait a few minutes and try again.',
        technicalMessage: `${operation}: Rate limited (429) after ${retryCount} retries: ${msg}`,
        retryCount,
        statusCode: 429,
      });
    }

    if (status === 529) {
      return new AIServiceError({
        category: 'overloaded',
        userMessage: 'The AI service is currently overloaded and unable to process requests. This is temporary — please wait a few minutes and try again.',
        technicalMessage: `${operation}: API overloaded (529) after ${retryCount} retries: ${msg}`,
        retryCount,
        statusCode: 529,
      });
    }

    if (status === 400) {
      return new AIServiceError({
        category: 'invalid_request',
        userMessage: 'The AI request could not be processed. The document may be too large or contain unsupported content. Try with a smaller document or contact support.',
        technicalMessage: `${operation}: Bad request (400): ${msg}`,
        retryCount,
        statusCode: 400,
      });
    }

    if (status >= 500) {
      return new AIServiceError({
        category: 'server_error',
        userMessage: 'The AI service experienced an internal error. This is usually temporary — please try again in a few minutes. If the problem persists, the service may be undergoing maintenance.',
        technicalMessage: `${operation}: Server error (${status}) after ${retryCount} retries: ${msg}`,
        retryCount,
        statusCode: status,
      });
    }
  }

  // Network / connectivity errors
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (msg.includes('abort') || msg.includes('timeout')) {
      return new AIServiceError({
        category: 'timeout',
        userMessage: 'The AI request timed out. The document may be very large or complex. Try again, or if the problem persists, try processing fewer documents at once.',
        technicalMessage: `${operation}: Timeout after ${retryCount} retries: ${err.message}`,
        retryCount,
      });
    }

    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnreset') || msg.includes('socket') || msg.includes('dns')) {
      return new AIServiceError({
        category: 'connectivity',
        userMessage: 'Unable to connect to the AI service. Please check your internet connection and try again. If your connection is working, the AI service may be temporarily unreachable.',
        technicalMessage: `${operation}: Network error after ${retryCount} retries: ${err.message}`,
        retryCount,
      });
    }
  }

  // Unknown error
  const message = err instanceof Error ? err.message : String(err);
  return new AIServiceError({
    category: 'unknown',
    userMessage: 'An unexpected error occurred while communicating with the AI service. Please try again. If the problem continues, contact support with this error for assistance.',
    technicalMessage: `${operation}: Unknown error after ${retryCount} retries: ${message}`,
    retryCount,
  });
}

/** Check if an error is transient and worth retrying */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    // Retry on rate limit (429), server errors (500, 502, 503), and overloaded (529)
    return [429, 500, 502, 503, 529].includes(err.status);
  }
  // Retry on network-level errors (fetch failures, DNS, timeouts)
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('fetch') || msg.includes('network') ||
           msg.includes('econnreset') || msg.includes('timeout') ||
           msg.includes('socket') || msg.includes('abort');
  }
  return false;
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Parse AI response text — strip markdown fences and parse JSON.
 *
 * Attempts three strategies in order:
 * 1. Strip markdown code fences, then JSON.parse the whole string.
 * 2. Find the first JSON object ({...}) embedded in prose text.
 * 3. Find the first JSON array ([...]) embedded in prose text.
 *
 * Returns raw text if all three fail (callers should validate the type).
 */
function parseResponse(rawText: string): unknown {
  // Strategy 1: strip fences and parse directly
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch { /* fall through */ }

  // Strategy 2: extract first JSON object (handles commentary before/after JSON)
  const objMatch = rawText.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* fall through */ }
  }

  // Strategy 3: extract first JSON array
  const arrMatch = rawText.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch { /* fall through */ }
  }

  // All strategies failed — return raw text; callers that cast to a typed object
  // will receive a string and should guard against this.
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[AI] Response is not valid JSON; returning raw text. Preview:', rawText.substring(0, 200));
  }
  return rawText;
}

/** Create an AbortController with a timeout */
function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Call Claude with a versioned system prompt and enforced parameters.
 * Returns parsed JSON response along with metadata for audit logging.
 * Includes retry with exponential backoff for transient API failures.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const prompt = PROMPTS[options.promptKey];
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const startTime = Date.now();
  let retryCount = 0;

  const messages: Anthropic.MessageCreateParams['messages'] = [
    { role: 'user', content: options.userContent },
  ];

  while (true) {
    const { signal, clear } = createTimeoutSignal(timeoutMs);
    try {
      const response = await anthropic.messages.create(
        {
          model: AI_MODEL,
          max_tokens: options.maxTokens || 8192,
          temperature: prompt.temperature,
          system: prompt.system,
          messages,
        },
        { signal },
      );

      clear();
      const latencyMs = Date.now() - startTime;

      const textBlock = response.content.find(c => c.type === 'text');
      const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

      return {
        response: parseResponse(rawText),
        raw: rawText,
        promptVersion: prompt.version,
        model: AI_MODEL,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        latencyMs,
        retryCount,
      };
    } catch (err) {
      clear();
      if (retryCount < maxRetries && isRetryableError(err)) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        if (process.env.NODE_ENV === 'development') {
          console.warn(`AI call retry ${retryCount + 1}/${maxRetries} after ${delayMs}ms:`, err instanceof Error ? err.message : err);
        }
        await sleep(delayMs);
        retryCount++;
        continue;
      }
      // Non-retryable error or exhausted retries — throw classified error
      throw classifyAIError(err, retryCount, `callAI(${options.promptKey})`);
    }
  }
}

/**
 * Call Claude Vision with an image for OCR.
 * Includes retry with exponential backoff.
 */
export async function callVision(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
  promptKey: PromptKey = 'OCR_EXTRACTOR',
  additionalText?: string,
): Promise<AICallResult> {
  const prompt = PROMPTS[promptKey];
  const startTime = Date.now();
  let retryCount = 0;

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageBase64 },
    },
    {
      type: 'text',
      text: additionalText || 'Extract all text from this document. Return each text region with its bounding box coordinates and the text content.',
    },
  ];

  while (true) {
    const { signal, clear } = createTimeoutSignal(REQUEST_TIMEOUT_MS);
    try {
      const response = await anthropic.messages.create(
        {
          model: AI_MODEL,
          max_tokens: 8192,
          temperature: prompt.temperature,
          system: prompt.system,
          messages: [{ role: 'user', content }],
        },
        { signal },
      );

      clear();
      const latencyMs = Date.now() - startTime;

      const textBlock = response.content.find(c => c.type === 'text');
      const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

      return {
        response: parseResponse(rawText),
        raw: rawText,
        promptVersion: prompt.version,
        model: AI_MODEL,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        latencyMs,
        retryCount,
      };
    } catch (err) {
      clear();
      if (retryCount < MAX_RETRIES && isRetryableError(err)) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Vision call retry ${retryCount + 1}/${MAX_RETRIES} after ${delayMs}ms:`, err instanceof Error ? err.message : err);
        }
        await sleep(delayMs);
        retryCount++;
        continue;
      }
      throw classifyAIError(err, retryCount, `callVision(${promptKey})`);
    }
  }
}
