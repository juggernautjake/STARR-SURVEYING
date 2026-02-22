// lib/research/ai-client.ts — Claude API wrapper for research feature
// All AI calls go through this wrapper to enforce consistency:
// - Model pinning, temperature enforcement, prompt versioning, usage logging
import Anthropic from '@anthropic-ai/sdk';
import { PROMPTS, type PromptKey } from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const AI_MODEL = process.env.RESEARCH_AI_MODEL || 'claude-sonnet-4-5-20250929';

export interface AICallOptions {
  promptKey: PromptKey;
  userContent: string | Anthropic.MessageCreateParams['messages'][0]['content'];
  maxTokens?: number;
}

export interface AICallResult {
  response: unknown;
  raw: string;
  promptVersion: string;
  model: string;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
}

/**
 * Call Claude with a versioned system prompt and enforced parameters.
 * Returns parsed JSON response along with metadata for audit logging.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const prompt = PROMPTS[options.promptKey];
  const startTime = Date.now();

  const messages: Anthropic.MessageCreateParams['messages'] = [
    { role: 'user', content: options.userContent },
  ];

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: options.maxTokens || 8192,
    temperature: prompt.temperature,
    system: prompt.system,
    messages,
  });

  const latencyMs = Date.now() - startTime;

  const textBlock = response.content.find(c => c.type === 'text');
  const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  // Parse JSON response — strip markdown fences if present
  let parsed: unknown;
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Return raw text if not valid JSON
    parsed = rawText;
  }

  return {
    response: parsed,
    raw: rawText,
    promptVersion: prompt.version,
    model: AI_MODEL,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    latencyMs,
  };
}

/**
 * Call Claude Vision with an image for OCR.
 */
export async function callVision(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
  promptKey: PromptKey = 'OCR_EXTRACTOR',
  additionalText?: string,
): Promise<AICallResult> {
  const prompt = PROMPTS[promptKey];
  const startTime = Date.now();

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

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 8192,
    temperature: prompt.temperature,
    system: prompt.system,
    messages: [{ role: 'user', content }],
  });

  const latencyMs = Date.now() - startTime;

  const textBlock = response.content.find(c => c.type === 'text');
  const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  let parsed: unknown;
  try {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = rawText;
  }

  return {
    response: parsed,
    raw: rawText,
    promptVersion: prompt.version,
    model: AI_MODEL,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    latencyMs,
  };
}
