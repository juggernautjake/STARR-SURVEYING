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

import type { DeedRecord, ChainLink, DeedsAndRecordsSection, AiUsageSummary } from '../types/research-result';
import type { ConfidenceRating } from '../types/confidence';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence';
import {
  accumulateUsage,
  buildUsageFromTokens,
  zeroUsage,
} from './ai-cost-helpers';

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

async function analyzeDeedException(
  record: DeedRecord,
  apiKey: string,
): Promise<{ summary: string; usage: Partial<AiUsageSummary> }> {
  if (!apiKey || record.pageImages.length === 0) return { summary: '', usage: {} };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Build image content blocks
    const imageContent = record.pageImages.slice(0, 5).map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/png' as const,
        data: img,
      },
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Analyze this deed document. Extract and summarize:
1. Document type (warranty deed, deed of trust, easement, etc.)
2. Grantor (seller/from) and Grantee (buyer/to)
3. Recording date and instrument number
4. Legal description — exact metes & bounds if present
5. Any easements, restrictions, or encumbrances mentioned
6. Consideration (price) if stated
7. Any notable conditions or provisions

Provide a concise 2-3 sentence summary suitable for a property surveyor.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
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

    const textBlock = response.content.find(b => b.type === 'text');
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
