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
  /** Target property context for relevance filtering in summaries */
  targetProperty?: {
    situsAddress: string | null;
    acreage: number | null;
    abstractNumber: string | null;
    surveyName: string | null;
    subdivisionName: string | null;
    propertyId: string | null;
  } | null;
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
  const { summary, usage: summaryUsage } = await generateDeedSummary(analyzedRecords, chainOfTitle, input.currentOwner, anthropicApiKey, input.targetProperty);
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
    let buf: any = Buffer.from(base64Img, 'base64');
    const meta = await sharp(buf).metadata();
    const { width, height } = meta;
    if (!width || !height) return { data: base64Img, mediaType: 'image/png' };

    let mediaType: 'image/png' | 'image/jpeg' = 'image/png';

    if (width > MAX_DEED_DIMENSION || height > MAX_DEED_DIMENSION) {
      const scale = MAX_DEED_DIMENSION / Math.max(width, height);
      const nw = Math.round(width * scale);
      const nh = Math.round(height * scale);
      // Resize oversized image to fit Claude Vision API limits
      buf = await sharp(buf).resize(nw, nh, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    }

    if (buf.length > MAX_DEED_IMAGE_BYTES) {
      // Compress oversized image to JPEG q80
      buf = await sharp(buf).jpeg({ quality: 80 }).toBuffer();
      mediaType = 'image/jpeg';
    }

    if (buf.length > MAX_DEED_IMAGE_BYTES) {
      // Re-compress to JPEG q60 as fallback
      buf = await sharp(buf).jpeg({ quality: 60 }).toBuffer();
      mediaType = 'image/jpeg';
    }

    return { data: buf.toString('base64'), mediaType };
  } catch {
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
      // All deed images failed resize — fall back to metadata-only summary
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
      max_tokens: 12000,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `You are an expert Texas Registered Professional Land Surveyor (RPLS) and title examiner analyzing a deed document from Bell County, Texas. Extract ALL information with maximum thoroughness and precision. This analysis will be used directly by a field surveyor to locate property corners and boundaries.

REQUIRED EXTRACTION — do not skip any section. Be exhaustive.

1. **Document Type**: warranty deed, deed of trust, special warranty deed, quitclaim, easement, right-of-way, restrictive covenant, correction deed, etc. Note if this is a correction or amendment to a prior instrument.

2. **Parties**: Full legal names of Grantor (seller/from) and Grantee (buyer/to). Include middle names, suffixes (Jr., Sr., III), entity types (LLC, LP, Inc.), and trustee designations. If married couples, note "husband and wife" or "as their community property."

3. **Recording Information**: Recording date, instrument number, volume/page (if older deed), county clerk file number, any cross-references to other instruments. Note the county of recording and state.

4. **Legal Description — TRANSCRIBE IN FULL WITH EXACT PRECISION**:
   - Point of Beginning (POB): full description including reference monument, distance, and bearing from a known point. If the POB references a survey corner, name the survey.
   - ALL bearing/distance calls: transcribe EXACTLY as written (e.g., "N 45°30'15" E, 200.50 feet" or "S 89°59'30" W, 461.81 ft"). Do not paraphrase or approximate — copy each call verbatim.
   - ALL curve data: radius, arc length, chord bearing, chord distance, delta angle, direction (left/right), center point if given
   - ALL monument descriptions at each call point: iron rod, iron pin, concrete monument, PK nail, railroad spike, cap stamped "RPLS #XXXX", etc. Note "found" vs "set" for each monument.
   - Along lines: "along the south line of Lot 12", "along the north R.O.W. line of FM 436" — note which boundary each call runs along
   - Texas vara measurements: note if varas are used (1 vara = 33⅓ inches = 2.7778 feet). Convert to feet if possible.
   - Closure: does the description close back to the POB? Note closure distance and bearing if stated.
   - If the legal description references a survey or field notes by book and page, transcribe that reference exactly.
   - If the description says "more or less" or "approximately", note it — this affects boundary precision.

5. **Lot/Block/Subdivision**: Lot number, block number, subdivision/addition name, phase/section, filing information, abstract/survey name and number (e.g., "Abstract No. 488, William Hartrick Survey"). Note any replat or amended plat references.

6. **Prior Deed References — CRITICAL FOR DEED CHAIN HISTORY**:
   - ALL references to prior deeds: "being the same property conveyed in Vol. 465, Pg. 96" or "Instrument No. 2010043440"
   - Parent tract references: "being a part of a 12.358 acre tract described in..."
   - Survey/abstract references: "situated in the William Hartrick Survey, Abstract No. 488"
   - Any "called from" references mentioning adjacent owners by name
   - Previous instrument numbers or recording references in the body of the deed
   - Plat recording references: "as shown on plat recorded in Cabinet X, Slide Y" or "Plat Cabinet A, Page B"

7. **Easements & Encumbrances**: ALL easements created, referenced, or reserved — utility (electric, gas, water, sewer, telecom), drainage, access/ingress-egress, conservation, pipeline. Include width (e.g., "10-foot utility easement"), location description, and beneficiary entity. Note if easements run along specific boundary lines.

8. **Right-of-Way**: Any ROW dedications or references to existing ROW (TxDOT, county road, FM road). Note the ROW width and which side of centerline. Reference any condemnation or acquisition instruments.

9. **Financial**: Consideration (price), liens, deed of trust references, assumption clauses

10. **Area**: Acreage or square footage as stated. Note "more or less" qualifier. If both are given, note any discrepancy. If the area is computed from calls vs. stated area, note the difference.

11. **Special Provisions**: Restrictions, covenants, mineral reservations (surface only? ½ minerals?), timber rights, water rights, homestead disclaimers, subordination agreements, conditions of conveyance

12. **Adjacent Owners & Properties**: Any neighboring property owners mentioned by name in the boundary description. Note the relationship (e.g., "along the east line of a tract owned by Smith")

13. **Confidence Assessment**: For each major section, rate your confidence:
    - HIGH: clearly readable, unambiguous
    - MEDIUM: some characters unclear but context makes meaning obvious
    - LOW: partially illegible, marked with [?]
    Note any portions of the document that are cut off, obscured, or illegible.

FORMAT your response as a detailed narrative summary suitable for a field surveyor preparing to stake this property. Start with document identification, then systematic description of the boundary (going around the tract clockwise from the POB), then all references and encumbrances. Group related information together. Mark uncertain readings with [?] and note why they are uncertain.`,
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
  targetProperty?: DeedAnalysisInput['targetProperty'],
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

    // Gather AI summaries from individual deed analyses for richer context
    const deedDetails = records
      .filter(r => r.aiSummary && r.aiSummary.length > 50)
      .map(r => `--- ${r.documentType} (${r.instrumentNumber ?? 'no inst#'}, ${r.recordingDate ?? '?'}) ---\n${r.aiSummary!.substring(0, 1500)}`)
      .join('\n\n');

    // Build target property context for relevance guidance
    const targetContext = targetProperty
      ? `\nTARGET PROPERTY:
- Address: ${targetProperty.situsAddress ?? 'unknown'}
- Acreage: ${targetProperty.acreage ?? 'unknown'}
- Abstract: ${targetProperty.abstractNumber ?? 'unknown'}
- Survey: ${targetProperty.surveyName ?? 'unknown'}
- Subdivision: ${targetProperty.subdivisionName ?? 'unknown'}
- Property ID: ${targetProperty.propertyId ?? 'unknown'}
`
      : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a senior Texas RPLS and title examiner. Synthesize a comprehensive property ownership history for a Bell County, Texas surveyor.

Current owner: ${currentOwner ?? 'unknown'}.
${targetContext}
Chain of title:
${chainText}

Total documents found: ${records.length}
Document types: ${[...new Set(records.map(r => r.documentType))].join(', ')}

${deedDetails ? `\nDetailed AI analysis of each deed:\n${deedDetails}\n` : ''}

IMPORTANT: Only include information about the TARGET PROPERTY described above. If any deed or document references a completely different property (different survey, different abstract number, different subdivision, or a property clearly belonging to someone else), EXCLUDE it entirely from your summary. Do not mention unrelated properties, plats, or deeds — they were erroneously included in the search results.

Write a thorough ownership history summary (8-15 sentences) covering:
- Complete chain of title from earliest to most recent owner
- Key transfers: who sold to whom, when, and the instrument numbers
- Legal description consistency: did the legal description change between deeds?
- Acreage consistency: did the acreage change between conveyances (was land split off)?
- Subdivision history: when was the land platted, who was the developer?
- Any gaps or anomalies in the chain (missing links, long gaps between transfers)
- Easements created or referenced across the deed history
- Prior deed references found that could lead to even older records
- Abstract/survey references (e.g., "William Hartrick Survey, A-488")
- Any red flags: boundary discrepancies, unclear descriptions, potential title issues`,
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
