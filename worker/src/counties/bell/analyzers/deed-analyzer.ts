/**
 * Bell County Deed Analyzer
 *
 * Uses Claude AI to analyze deed documents:
 *   - Reconstruct chain of title
 *   - Extract metes & bounds
 *   - Identify easements and restrictions
 *   - Summarize each deed in plain language
 *   - Detect gaps or anomalies in ownership history
 */

import type { DeedRecord, ChainLink, DeedsAndRecordsSection, AiUsageSummary } from '../types/research-result.js';
import type { ConfidenceRating } from '../types/confidence.js';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence.js';
import {
  accumulateUsage,
  buildUsageFromTokens,
  zeroUsage,
} from './ai-cost-helpers.js';

// ── Types ────────────────────────────────────────────────────────────

export interface DeedAnalysisInput {
  /** Deed records with page images from the clerk scraper */
  deedRecords: DeedRecord[];
  /** Legal description from CAD/GIS */
  cadLegalDescription: string | null;
  /** Current owner from CAD */
  currentOwner: string | null;
}

export interface DeedAnalyzerProgress {
  phase: string;
  message: string;
  timestamp: string;
}

export interface DeedAnalysisResult {
  section: DeedsAndRecordsSection;
  aiUsage: AiUsageSummary;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Analyze all deed records and produce a complete deed history analysis.
 */
export async function analyzeBellDeeds(
  input: DeedAnalysisInput,
  anthropicApiKey: string,
  onProgress: (p: DeedAnalyzerProgress) => void,
): Promise<DeedAnalysisResult> {
  const progress = (msg: string) => {
    onProgress({ phase: 'Deed Analysis', message: msg, timestamp: new Date().toISOString() });
  };

  const usage = zeroUsage();

  if (input.deedRecords.length === 0) {
    progress('No deed records to analyze');
    return {
      section: {
        summary: 'No deed records were found during research.',
        records: [],
        chainOfTitle: [],
        confidence: computeConfidence({
          sourceReliability: 0,
          dataUsefulness: 0,
          crossValidation: 0,
          sourceName: 'none',
          validatedBy: [],
          contradictedBy: [],
        }),
      },
      aiUsage: usage,
    };
  }

  progress(`Analyzing ${input.deedRecords.length} deed record(s)...`);

  // ── Step 1: AI-analyze each deed document ──────────────────────────
  const analyzedRecords: DeedRecord[] = [];
  for (const record of input.deedRecords) {
    if (record.pageImages.length > 0) {
      progress(`Analyzing: ${record.documentType} — ${record.instrumentNumber ?? 'no instrument #'}`);
      const { summary: aiSummary, usage: callUsage } = await analyzeDeedException(record, anthropicApiKey);
      accumulateUsage(usage, callUsage);
      analyzedRecords.push({ ...record, aiSummary });
    } else {
      analyzedRecords.push(record);
    }
  }

  // ── Step 2: Reconstruct chain of title ─────────────────────────────
  progress('Reconstructing chain of title...');
  const chainOfTitle = buildChainOfTitle(analyzedRecords);

  // ── Step 3: Generate overall summary ───────────────────────────────
  progress('Generating ownership history summary...');
  const { summary, usage: summaryUsage } = await generateDeedSummary(analyzedRecords, chainOfTitle, input.currentOwner, anthropicApiKey);
  accumulateUsage(usage, summaryUsage);

  // ── Step 4: Compute confidence ─────────────────────────────────────
  const hasImages = analyzedRecords.some(r => r.pageImages.length > 0);
  const hasChain = chainOfTitle.length >= 2;
  const confidence = computeConfidence({
    sourceReliability: SOURCE_RELIABILITY['county-clerk-official'],
    dataUsefulness: hasImages ? 25 : 10,
    crossValidation: hasChain ? 15 : 5,
    sourceName: 'Bell County Clerk',
    validatedBy: hasChain ? ['Chain of title reconstruction'] : [],
    contradictedBy: [],
  });

  progress(`Deed analysis complete: ${chainOfTitle.length} links in chain`);

  return {
    section: {
      summary,
      records: analyzedRecords,
      chainOfTitle,
      confidence,
    },
    aiUsage: usage,
  };
}

// ── Internal: Individual Deed Analysis ───────────────────────────────

/**
 * Build a plain-text fallback summary from deed record metadata alone,
 * used when AI analysis is unavailable or fails.
 */
function buildFallbackDeedSummary(record: DeedRecord): string {
  const parts: string[] = [`Document type: ${record.documentType}`];
  if (record.grantor) parts.push(`Grantor: ${record.grantor}`);
  if (record.grantee) parts.push(`Grantee: ${record.grantee}`);
  if (record.recordingDate) parts.push(`Recorded: ${record.recordingDate}`);
  if (record.instrumentNumber) parts.push(`Instrument #${record.instrumentNumber}`);
  if (record.legalDescription) {
    parts.push(`Legal: ${record.legalDescription.slice(0, 120)}`);
  }
  return parts.join(' | ') + '. (AI image analysis was not available for this document.)';
}

// ── Image resize utility ─────────────────────────────────────────────

const MAX_DEED_DIMENSION = 7_900;
const MAX_DEED_IMAGE_BYTES = 4_718_592; // 4.5 MiB

async function resizeDeedImage(base64Img: string): Promise<{ data: string; mediaType: 'image/png' | 'image/jpeg' } | null> {
  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
    let buf = Buffer.from(base64Img, 'base64');
    const meta = await sharp(buf).metadata();
    const { width, height } = meta;
    if (!width || !height) return { data: base64Img, mediaType: 'image/png' };

    let mediaType: 'image/png' | 'image/jpeg' = 'image/png';

    if (width > MAX_DEED_DIMENSION || height > MAX_DEED_DIMENSION) {
      const scale = MAX_DEED_DIMENSION / Math.max(width, height);
      const nw = Math.round(width * scale);
      const nh = Math.round(height * scale);
      console.log(`[deed-analyzer] Resizing deed image from ${width}x${height} to ${nw}x${nh}`);
      buf = await sharp(buf).resize(nw, nh, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() as Buffer;
    }

    if (buf.length > MAX_DEED_IMAGE_BYTES) {
      console.log(`[deed-analyzer] Compressing deed image (${buf.length} bytes) — JPEG q80`);
      buf = await sharp(buf).jpeg({ quality: 80 }).toBuffer() as Buffer;
      mediaType = 'image/jpeg';
    }

    if (buf.length > MAX_DEED_IMAGE_BYTES) {
      console.log(`[deed-analyzer] Re-compressing deed image (${buf.length} bytes) — JPEG q60`);
      buf = await sharp(buf).jpeg({ quality: 60 }).toBuffer() as Buffer;
      mediaType = 'image/jpeg';
    }

    return { data: buf.toString('base64'), mediaType };
  } catch (err) {
    const rawBytes = Buffer.from(base64Img, 'base64');
    console.warn(`[deed-analyzer] Image resize failed (${rawBytes.length} bytes), skipping image:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function analyzeDeedException(
  record: DeedRecord,
  apiKey: string,
): Promise<{ summary: string; usage: Partial<AiUsageSummary> }> {
  if (!apiKey || record.pageImages.length === 0) return { summary: '', usage: {} };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Resize images to fit within Claude Vision API limits (max 8000px per dimension)
    const resizeResults = await Promise.all(record.pageImages.slice(0, 5).map(img => resizeDeedImage(img)));
    const resized = resizeResults.filter((r): r is NonNullable<typeof r> => r !== null);
    if (resized.length === 0) {
      console.warn('[deed-analyzer] All deed images failed resize — skipping AI analysis');
      return { summary: buildFallbackDeedSummary(record), usage: {} };
    }
    const imageContent = resized.map(({ data, mediaType }) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mediaType,
        data,
      },
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `You are analyzing a deed document from Bell County, Texas for a property surveyor.
Extract ALL of the following information thoroughly:

1. Document type (warranty deed, deed of trust, easement, etc.)
2. Grantor (seller/from) and Grantee (buyer/to) — include full legal names
3. Recording date and instrument number
4. Legal description — transcribe the FULL metes & bounds description if present,
   including ALL bearing/distance calls (e.g., "N 45°30'15" E, 200.50 ft"),
   points of beginning, monuments, and curve data
5. Lot number, block number, and subdivision name if referenced
6. Any easements, restrictions, right-of-way dedications, or encumbrances mentioned
7. Consideration (price) if stated
8. Acreage or area if stated
9. Any notable conditions, liens, or provisions

Be thorough — every bearing, distance, monument, and easement reference matters for the survey.
Provide a detailed summary suitable for a field surveyor reviewing the chain of title.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      summary: textBlock ? textBlock.text : buildFallbackDeedSummary(record),
      usage: buildUsageFromTokens(inputTokens, outputTokens),
    };
  } catch (err) {
    console.warn(
      `[deed-analyzer] AI analysis failed for ${record.documentType} ` +
      `${record.instrumentNumber ?? '(no inst#)'}: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
    return { summary: buildFallbackDeedSummary(record), usage: {} };
  }
}

// ── Internal: Chain of Title ─────────────────────────────────────────

function buildChainOfTitle(records: DeedRecord[]): ChainLink[] {
  // Filter to conveyance documents only
  const conveyances = records.filter(r => {
    const type = r.documentType.toUpperCase();
    return type.includes('DEED') && !type.includes('TRUST') && !type.includes('RELEASE');
  });

  // Sort by date (oldest first)
  conveyances.sort((a, b) => {
    const dateA = a.recordingDate ? new Date(a.recordingDate).getTime() : 0;
    const dateB = b.recordingDate ? new Date(b.recordingDate).getTime() : 0;
    return dateA - dateB;
  });

  return conveyances.map((record, index) => ({
    order: index + 1,
    instrumentNumber: record.instrumentNumber,
    date: record.recordingDate,
    from: record.grantor ?? 'UNKNOWN',
    to: record.grantee ?? 'UNKNOWN',
    type: record.documentType,
  }));
}

// ── Internal: Summary Generation ─────────────────────────────────────

/**
 * Build a structured ownership-history summary from deed metadata alone,
 * used when no Anthropic API key is set or when the AI call fails.
 */
function buildNoAiDeedSummary(
  records: DeedRecord[],
  chain: ChainLink[],
  currentOwner: string | null,
): string {
  const dates = records.map(r => r.recordingDate).filter(Boolean).sort() as string[];
  const oldestDate = dates[0] ?? 'unknown';
  const newestDate = dates[dates.length - 1] ?? 'unknown';
  const docTypes = [...new Set(records.map(r => r.documentType))];

  let summary =
    `Found ${records.length} recorded document(s) spanning ${oldestDate} to ${newestDate}. ` +
    `Document types: ${docTypes.join(', ')}. ` +
    `Current owner: ${currentOwner ?? 'unknown'}. ` +
    `Chain of title: ${chain.length} conveyance(s)`;

  if (chain.length > 0) {
    const first = chain[0];
    const last  = chain[chain.length - 1];
    summary += ` — ${first.from} (${first.date ?? '?'}) → ${last.to} (${last.date ?? '?'})`;
  }

  return summary + '.';
}

async function generateDeedSummary(
  records: DeedRecord[],
  chain: ChainLink[],
  currentOwner: string | null,
  apiKey: string,
): Promise<{ summary: string; usage: Partial<AiUsageSummary> }> {
  if (!apiKey) {
    return { summary: buildNoAiDeedSummary(records, chain, currentOwner), usage: {} };
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const chainText = chain.map(link =>
      `${link.order}. ${link.date ?? '?'}: ${link.from} → ${link.to} (${link.type}, Inst# ${link.instrumentNumber ?? 'n/a'})`
    ).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Summarize this Bell County, Texas property ownership history for a surveyor. Current owner: ${currentOwner ?? 'unknown'}.

Chain of title:
${chainText}

Total documents found: ${records.length}
Document types: ${[...new Set(records.map(r => r.documentType))].join(', ')}

Write a concise 3-5 sentence narrative summary covering:
- Current ownership
- Key transfers and dates
- Any gaps or concerns in the chain
- Total span of recorded history`,
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      summary: textBlock?.text ?? buildNoAiDeedSummary(records, chain, currentOwner),
      usage: buildUsageFromTokens(inputTokens, outputTokens),
    };
  } catch (err) {
    console.warn(
      `[deed-analyzer] AI summary generation failed: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
    return { summary: buildNoAiDeedSummary(records, chain, currentOwner), usage: {} };
  }
}
