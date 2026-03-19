// worker/src/counties/bell/analyzers/screenshot-classifier.ts
// AI-powered screenshot classification.
//
// After all screenshots are collected, this module reviews each one using
// Claude Vision to determine whether it contains useful survey/property
// data or is junk (error pages, empty results, auth walls, blank PDF
// viewers, etc.).
//
// The regex-based classifier in artifact-uploader.ts catches obvious cases
// by checking URL/description/pageText. This AI classifier catches visual
// issues the regex cannot: empty PDF viewers that rendered but show nothing,
// pages that loaded but display "No matching records", generic splash pages,
// irrelevant content, etc.

import type { ScreenshotCapture } from '../types/research-result.js';
import { buildUsageFromTokens, zeroUsage, accumulateUsage } from './ai-cost-helpers.js';
import type { AiUsageSummary } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ScreenshotClassification {
  /** Whether the screenshot contains useful property/survey content */
  useful: boolean;
  /** Short reason for the classification */
  reason: string;
}

export interface ClassificationResult {
  /** Screenshots classified as useful for the main review section */
  useful: ScreenshotCapture[];
  /** Screenshots classified as misc/junk for the collapsed bottom section */
  misc: ScreenshotCapture[];
  /** AI usage for all classification calls */
  aiUsage: AiUsageSummary;
}

// ── Quick Regex Pre-Check ────────────────────────────────────────────

/** Patterns that definitively mark a screenshot as misc without needing AI */
const DEFINITE_MISC_PATTERNS = [
  /no\s*results?\s*found/i,
  /0\s*results?\s*found/i,
  /no\s*records?\s*found/i,
  /no\s*documents?\s*found/i,
  /no\s*data\s*(?:available|found)/i,
  /try\s*again/i,
  /please\s*try\s*(?:again|later)/i,
  /search\s*returned\s*no/i,
  /your\s*search\s*did\s*not/i,
  /not\s*authorized/i,
  /unauthorized/i,
  /access\s*denied/i,
  /permission\s*denied/i,
  /login\s*required/i,
  /sign\s*in\s*to\s*continue/i,
  /session\s*(?:expired|timeout)/i,
  /403\s*forbidden/i,
  /401\s*unauthorized/i,
  /page\s*not\s*found/i,
  /404\s*(?:error|not\s*found)/i,
  /500\s*(?:error|internal\s*server)/i,
  /server\s*error/i,
  /something\s*went\s*wrong/i,
  /an?\s*error\s*(?:has\s*)?occurred/i,
  /captcha/i,
  /verify\s*you\s*are\s*(?:human|not\s*a\s*(?:robot|bot))/i,
];

const DEFINITE_MISC_URL_PATTERNS = [
  /[?&]f=json/i,
  /\/query\?/i,
  /about:blank/i,
  /chrome-error/i,
];

function isDefiniteMisc(ss: ScreenshotCapture): boolean {
  const text = `${ss.url} ${ss.description} ${ss.pageText ?? ''}`;
  for (const p of DEFINITE_MISC_PATTERNS) {
    if (p.test(text)) return true;
  }
  for (const p of DEFINITE_MISC_URL_PATTERNS) {
    if (p.test(ss.url)) return true;
  }
  // Very short page text = likely empty/broken
  if (ss.pageText !== undefined) {
    const trimmed = (ss.pageText ?? '').replace(/\s+/g, ' ').trim();
    if (trimmed.length < 20) return true;
  }
  return false;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Classify all screenshots as useful or misc using regex + AI vision.
 *
 * Flow:
 * 1. Regex pre-check catches obvious junk (no AI cost)
 * 2. Remaining screenshots are batched and sent to AI for visual review
 * 3. AI determines if the screenshot shows useful property/survey data
 */
export async function classifyScreenshots(
  screenshots: ScreenshotCapture[],
  anthropicApiKey: string,
  onProgress: (msg: string) => void,
): Promise<ClassificationResult> {
  const usage = zeroUsage();
  const useful: ScreenshotCapture[] = [];
  const misc: ScreenshotCapture[] = [];

  if (screenshots.length === 0) {
    return { useful, misc, aiUsage: usage };
  }

  onProgress(`Classifying ${screenshots.length} screenshot(s)...`);

  // ── Step 1: Regex pre-check ────────────────────────────────────
  const needsAiReview: ScreenshotCapture[] = [];

  for (const ss of screenshots) {
    if (isDefiniteMisc(ss)) {
      misc.push(ss);
    } else {
      needsAiReview.push(ss);
    }
  }

  if (misc.length > 0) {
    onProgress(`  Regex filter: ${misc.length} screenshot(s) classified as MISC`);
  }

  // ── Step 2: AI vision review ───────────────────────────────────
  if (!anthropicApiKey || needsAiReview.length === 0) {
    useful.push(...needsAiReview);
    onProgress(`Classification complete: ${useful.length} useful, ${misc.length} misc`);
    return { useful, misc, aiUsage: usage };
  }

  onProgress(`  AI reviewing ${needsAiReview.length} screenshot(s)...`);

  // Process in batches of 4 to keep token usage manageable
  const BATCH_SIZE = 4;
  for (let i = 0; i < needsAiReview.length; i += BATCH_SIZE) {
    const batch = needsAiReview.slice(i, i + BATCH_SIZE);
    try {
      const { classifications, batchUsage } = await classifyBatch(batch, anthropicApiKey);
      accumulateUsage(usage, batchUsage);

      for (let j = 0; j < batch.length; j++) {
        const cls = classifications[j];
        if (cls && cls.useful) {
          useful.push(batch[j]);
        } else {
          // Tag the reason in the description so the UI can show it
          const reason = cls?.reason ?? 'AI classified as not useful';
          batch[j].description = `${batch[j].description} [MISC: ${reason}]`;
          misc.push(batch[j]);
        }
      }
    } catch (err) {
      // On AI failure, keep all screenshots as useful (conservative)
      onProgress(`  ⚠ AI classification batch failed: ${err instanceof Error ? err.message : String(err)}`);
      useful.push(...batch);
    }
  }

  onProgress(`Classification complete: ${useful.length} useful, ${misc.length} misc`);
  return { useful, misc, aiUsage: usage };
}

// ── Internal: AI Batch Classification ────────────────────────────────

async function classifyBatch(
  batch: ScreenshotCapture[],
  apiKey: string,
): Promise<{ classifications: ScreenshotClassification[]; batchUsage: Partial<AiUsageSummary> }> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  // Resize screenshots for classification (small — we just need to see the content)
  const imageContent: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }> = [];

  for (const ss of batch) {
    try {
      const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
      const buf = Buffer.from(ss.imageBase64, 'base64');
      // Resize to small for classification (saves tokens)
      const resized = await sharp(buf)
        .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 50 })
        .toBuffer();
      imageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: resized.toString('base64') },
      });
    } catch {
      // If resize fails, use original (but still try)
      imageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: ss.imageBase64 },
      });
    }
  }

  const descriptions = batch.map((ss, i) =>
    `Screenshot ${i + 1}: source="${ss.source}", url="${ss.url}", description="${ss.description}"`
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: `You are reviewing ${batch.length} screenshot(s) captured during a property research pipeline in Bell County, Texas. For each screenshot, determine if it shows USEFUL content for a property surveyor's review, or if it's MISC/junk.

${descriptions}

A screenshot is USEFUL if it shows:
- Property records, tax data, appraisal info, ownership details
- Map views showing parcels, boundaries, or land features
- Document images (deeds, plats, easements)
- Search results that actually found relevant records
- Any substantive data about property, land, or legal records

A screenshot is MISC (not useful) if it shows:
- "No results found" or empty search results
- Error pages, 404s, 500s, server errors
- Login/authentication pages or access denied messages
- Empty PDF viewers or document viewers with no content loaded
- CAPTCHA or bot verification pages
- Blank or nearly blank pages
- Generic website homepages with no property-specific data
- Loading spinners or "please wait" pages
- Cookie consent dialogs covering the actual content

Respond with a JSON array (one entry per screenshot, in order):
[{"useful": true/false, "reason": "brief reason"}]`,
        },
      ],
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
  const batchUsage = buildUsageFromTokens(
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
  );

  if (!textBlock) {
    return {
      classifications: batch.map(() => ({ useful: true, reason: 'AI returned no response' })),
      batchUsage,
    };
  }

  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ useful?: boolean; reason?: string }>;
      return {
        classifications: parsed.map(p => ({
          useful: p.useful ?? true,
          reason: p.reason ?? '',
        })),
        batchUsage,
      };
    }
  } catch { /* fall through */ }

  // Parse failure — default to useful
  return {
    classifications: batch.map(() => ({ useful: true, reason: 'AI response parse failed' })),
    batchUsage,
  };
}
