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

import type { DeedRecord, ChainLink, DeedsAndRecordsSection } from '../types/research-result';
import type { ConfidenceRating } from '../types/confidence';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence';

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

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Analyze all deed records and produce a complete deed history analysis.
 */
export async function analyzeBellDeeds(
  input: DeedAnalysisInput,
  anthropicApiKey: string,
  onProgress: (p: DeedAnalyzerProgress) => void,
): Promise<DeedsAndRecordsSection> {
  const progress = (msg: string) => {
    onProgress({ phase: 'Deed Analysis', message: msg, timestamp: new Date().toISOString() });
  };

  if (input.deedRecords.length === 0) {
    progress('No deed records to analyze');
    return {
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
    };
  }

  progress(`Analyzing ${input.deedRecords.length} deed record(s)...`);

  // ── Step 1: AI-analyze each deed document ──────────────────────────
  const analyzedRecords: DeedRecord[] = [];
  for (const record of input.deedRecords) {
    if (record.pageImages.length > 0) {
      progress(`Analyzing: ${record.documentType} — ${record.instrumentNumber ?? 'no instrument #'}`);
      const aiSummary = await analyzeDeedException(record, anthropicApiKey);
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
  const summary = await generateDeedSummary(analyzedRecords, chainOfTitle, input.currentOwner, anthropicApiKey);

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
    summary,
    records: analyzedRecords,
    chainOfTitle,
    confidence,
  };
}

// ── Internal: Individual Deed Analysis ───────────────────────────────

async function analyzeDeedException(
  record: DeedRecord,
  apiKey: string,
): Promise<string> {
  if (!apiKey || record.pageImages.length === 0) return '';

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
    return textBlock ? textBlock.text : '';
  } catch {
    return '';
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

async function generateDeedSummary(
  records: DeedRecord[],
  chain: ChainLink[],
  currentOwner: string | null,
  apiKey: string,
): Promise<string> {
  if (!apiKey) {
    // Generate a basic summary without AI
    const deedCount = records.length;
    const oldestDate = records
      .map(r => r.recordingDate)
      .filter(Boolean)
      .sort()[0] ?? 'unknown';
    const newestDate = records
      .map(r => r.recordingDate)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? 'unknown';

    return `Found ${deedCount} recorded document(s) spanning from ${oldestDate} to ${newestDate}. ` +
      `Current owner: ${currentOwner ?? 'unknown'}. ` +
      `Chain of title contains ${chain.length} conveyance(s).`;
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
    return textBlock?.text ?? '';
  } catch {
    return `Found ${records.length} document(s). Current owner: ${currentOwner ?? 'unknown'}.`;
  }
}
