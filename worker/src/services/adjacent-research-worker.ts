// worker/src/services/adjacent-research-worker.ts — Phase 5 Step 2
// Automates the per-adjacent-property research workflow:
//   A: Find deed via instrument# hint, grantee name, or grantor name
//   B: Download watermarked preview images via KofileClerkAdapter
//   C: Extract metes & bounds via Claude Vision AI
//   D: Trace chain of title 1-2 generations back (with AI boundary comparison)
//
// Spec §5.4 — Adjacent Property Research Worker
//
// NOTES:
//   - ANTHROPIC_API_KEY must be set for Steps C and AI deed selection
//   - Rate limit: configurable via CLERK_RATE_LIMIT_MS env var (default: 3000ms)
//   - AI model is read from RESEARCH_AI_MODEL env var (defaults to claude-sonnet-4-5-20250929)
//   - This worker is designed for sequential execution (not parallel) to avoid rate-limit violations
//   - All HTTP AI calls check response.ok before parsing JSON (Phase 3/4 pattern)
//   - Structured logging via PipelineLogger (per spec: no bare console.log in Phase 5 code)

import * as fs from 'fs';
import * as path from 'path';
import { PipelineLogger } from '../lib/logger.js';
import type { ClerkAdapter, ClerkDocumentResult, DocumentImage } from '../adapters/clerk-adapter.js';
import type { AdjacentResearchTask } from './adjacent-queue-builder.js';

// ── AI Model ──────────────────────────────────────────────────────────────────
// Always read from environment — never hardcode a model name
const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

// ── Rate limit ────────────────────────────────────────────────────────────────
// Minimum milliseconds between county clerk page navigations.
// Set CLERK_RATE_LIMIT_MS to override. Default: 3000ms (per spec §5.4).
const RATE_LIMIT_BASE_MS = (() => {
  const val = parseInt(process.env.CLERK_RATE_LIMIT_MS ?? '3000', 10);
  return isNaN(val) || val < 500 ? 3000 : val; // enforce minimum 500ms
})();

// ── Output Types ─────────────────────────────────────────────────────────────

export interface AdjacentResearchResult {
  owner: string;
  researchStatus: 'complete' | 'partial' | 'not_found' | 'failed';
  documentsFound: {
    deeds: DownloadedDocument[];
    plats: DownloadedDocument[];
  };
  extractedBoundary: ExtractedAdjacentBoundary | null;
  chainOfTitle: ChainEntry[];
  searchLog: SearchLogEntry[];
  errors: string[];
  timing: {
    totalMs: number;
    searchMs: number;
    downloadMs: number;
    extractionMs: number;
  };
}

export interface DownloadedDocument {
  instrumentNumber: string;
  type: string;
  date: string;
  grantor: string;
  grantee: string;
  pages: number;
  images: string[];        // Absolute local file paths
  calledAcreage?: number;
  relevanceScore: number;  // 0-100
}

export interface ExtractedAdjacentBoundary {
  totalCalls: number;
  metesAndBounds: AdjacentBoundaryCall[];
  calledAcreage?: number;
  surveyReference?: string;
  pointOfBeginning?: string;
  notes: string[];
}

export interface AdjacentBoundaryCall {
  callNumber: number;
  bearing: string;
  distance: number;
  unit: 'feet' | 'varas';
  type: 'straight' | 'curve';
  along?: string;
  monument?: string;
  /** True when this call mentions our property or subdivision */
  referencesOurProperty: boolean;
  /** True when AI determined this call forms the shared boundary */
  isSharedBoundary: boolean;
  confidence: number;
  curve?: {
    radius: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
  };
}

export interface ChainEntry {
  grantor: string;
  grantee: string;
  date: string;
  instrument: string;
  calledAcreage?: number;
  /** Whether the boundary description changed relative to the previous deed */
  boundaryDescriptionChanged: boolean;
}

export interface SearchLogEntry {
  query: string;
  type: 'instrument' | 'grantee' | 'grantor' | 'legal';
  resultsFound: number;
  selectedDocument?: string;
  reason: string;
}

// ── AdjacentResearchWorker ────────────────────────────────────────────────────

export class AdjacentResearchWorker {
  private clerkAdapter: ClerkAdapter;
  private apiKey: string;
  private outputDir: string;
  private searchLog: SearchLogEntry[] = [];
  private errors: string[] = [];
  private logger: PipelineLogger;

  constructor(clerkAdapter: ClerkAdapter, projectId: string) {
    this.clerkAdapter = clerkAdapter;
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.outputDir = `/tmp/harvest/${projectId}/adjacent`;
    this.logger = new PipelineLogger(projectId);

    // Ensure output directory exists
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
    } catch (e) {
      this.logger.warn('AdjacentWorker', `Could not create output dir ${this.outputDir}: ${e}`);
    }
  }

  /**
   * Research one adjacent property: find deed, download images, extract boundary, trace chain.
   * Returns a complete AdjacentResearchResult regardless of success/failure.
   */
  async researchAdjacentProperty(
    task: AdjacentResearchTask,
    ourPropertyContext: {
      owner: string;
      subdivisionName?: string;
      instrumentNumbers: string[];
      sharedCallBearings: string[];
    },
  ): Promise<AdjacentResearchResult> {
    const startTime = Date.now();
    const ownerSlug = task.owner.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const ownerDir = path.join(this.outputDir, ownerSlug);

    // Create per-owner subdirectory for images
    try {
      fs.mkdirSync(ownerDir, { recursive: true });
    } catch (e) {
      this.logger.warn('AdjacentWorker', `Could not create owner dir ${ownerDir}: ${e}`);
    }

    const result: AdjacentResearchResult = {
      owner:            task.owner,
      researchStatus:   'not_found',
      documentsFound:   { deeds: [], plats: [] },
      extractedBoundary: null,
      chainOfTitle:     [],
      searchLog:        [],
      errors:           [],
      timing:           { totalMs: 0, searchMs: 0, downloadMs: 0, extractionMs: 0 },
    };

    try {
      // ── Step A: Find the adjacent deed ─────────────────────────────────────
      this.logger.info('AdjacentWorker', `Searching for deed: ${task.owner}`);
      const searchStart = Date.now();
      const deed = await this.findAdjacentDeed(task, ourPropertyContext);
      result.timing.searchMs = Date.now() - searchStart;
      result.searchLog = [...this.searchLog];
      this.searchLog = [];

      if (!deed) {
        result.researchStatus = 'not_found';
        result.errors.push(
          `Could not find deed for "${task.owner}" after trying ${task.alternateNames.length} name variants. ` +
          `Tip: Verify name spelling and check if property was conveyed before 1980 (may require manual search).`,
        );
        result.timing.totalMs = Date.now() - startTime;
        return result;
      }

      // ── Step B: Download deed images ────────────────────────────────────────
      this.logger.info('AdjacentWorker', `Downloading images for ${deed.instrumentNumber}`);
      const downloadStart = Date.now();
      const images = await this.downloadDeedImages(deed, ownerDir);
      result.timing.downloadMs = Date.now() - downloadStart;

      result.documentsFound.deeds.push({
        instrumentNumber: deed.instrumentNumber,
        type:             deed.documentType,
        date:             deed.recordingDate,
        grantor:          deed.grantors.join(', '),
        grantee:          deed.grantees.join(', '),
        pages:            images.length,
        images:           images.map((img) => img.imagePath),
        relevanceScore:   80,
      });

      if (images.length === 0) {
        result.researchStatus = 'partial';
        result.errors.push(
          `Deed ${deed.instrumentNumber} found but no watermarked preview images are available. ` +
          `Check if county adapter supports getDocumentImages() for this clerk system.`,
        );
        result.timing.totalMs = Date.now() - startTime;
        return result;
      }

      // ── Step C: AI extraction of metes & bounds ─────────────────────────────
      if (!this.apiKey) {
        result.researchStatus = 'partial';
        result.errors.push('ANTHROPIC_API_KEY is not set — skipping AI boundary extraction');
        result.timing.totalMs = Date.now() - startTime;
        return result;
      }

      this.logger.info('AdjacentWorker', `Extracting boundary from ${images.length} page(s)...`);
      const extractStart = Date.now();
      const extracted = await this.extractBoundaryFromAdjacentDeed(
        images.map((img) => img.imagePath),
        task,
        ourPropertyContext,
      );
      result.timing.extractionMs = Date.now() - extractStart;

      result.extractedBoundary = extracted;
      result.researchStatus = extracted && extracted.totalCalls > 0 ? 'complete' : 'partial';

      if (!extracted || extracted.totalCalls === 0) {
        result.errors.push(
          `AI extraction returned no boundary calls for ${task.owner}. ` +
          `Possible causes: watermarks obscure critical data, non-standard deed format, or deed predates metes-and-bounds descriptions.`,
        );
      } else {
        this.logger.info(
          'AdjacentWorker',
          `Extracted ${extracted.totalCalls} calls, ` +
          `${extracted.metesAndBounds.filter((c) => c.isSharedBoundary).length} shared boundary calls`,
        );
      }

      // ── Step D: Chain of title (1-2 generations) ───────────────────────────
      if (deed.grantors.length > 0) {
        try {
          result.chainOfTitle = await this.traceChainOfTitle(deed, 2);
        } catch (e) {
          result.errors.push(`Chain of title trace failed: ${e}`);
        }
      }

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      result.researchStatus = 'failed';
      result.errors.push(`Research failed for "${task.owner}": ${msg}`);
      this.logger.error('AdjacentWorker', `Error researching ${task.owner}`, error);
    }

    result.timing.totalMs = Date.now() - startTime;
    result.searchLog = [...this.searchLog];
    this.searchLog = [];
    this.errors = [];
    return result;
  }

  // ── Step A: Find deed ────────────────────────────────────────────────────────

  private async findAdjacentDeed(
    task: AdjacentResearchTask,
    context: {
      owner: string;
      subdivisionName?: string;
      instrumentNumbers: string[];
      sharedCallBearings: string[];
    },
  ): Promise<ClerkDocumentResult | null> {

    // Strategy 1: Direct instrument number (fastest + most reliable)
    for (const inst of task.instrumentHints) {
      if (!inst) continue;
      try {
        const results = await this.clerkAdapter.searchByInstrumentNumber(inst);
        this.searchLog.push({
          query: inst, type: 'instrument',
          resultsFound: results.length,
          selectedDocument: results[0]?.instrumentNumber,
          reason: 'Direct instrument number from plat/deed reference',
        });
        if (results.length > 0) {
          this.logger.info('AdjacentWorker', `Found via instrument# ${inst}`);
          return results[0];
        }
      } catch (e) {
        this.searchLog.push({ query: inst, type: 'instrument', resultsFound: 0, reason: `Error: ${e}` });
      }
      await this.rateLimit();
    }

    // Strategy 2: Grantee name search with AI selection if multiple results
    for (const nameVariant of task.alternateNames) {
      if (!nameVariant || nameVariant.length < 3) continue;
      try {
        const results = await this.clerkAdapter.searchByGranteeName(nameVariant);
        const deeds = results.filter((r) =>
          ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'deed', 'other'].includes(
            r.documentType,
          ),
        );
        this.searchLog.push({
          query: nameVariant, type: 'grantee',
          resultsFound: deeds.length,
          reason: `Grantee name variant search`,
        });

        if (deeds.length === 0) { await this.rateLimit(); continue; }
        if (deeds.length === 1) {
          this.logger.info('AdjacentWorker', `Found via grantee name "${nameVariant}" (1 result)`);
          return deeds[0];
        }

        // Multiple results — use AI to select the most relevant deed
        if (this.apiKey) {
          const selected = await this.aiSelectCorrectDeed(deeds, task, context);
          if (selected) {
            this.logger.info('AdjacentWorker', `AI selected deed ${selected.instrumentNumber} from ${deeds.length} candidates`);
            return selected;
          }
        } else {
          // Without AI, take the most recent deed
          const sorted = [...deeds].sort(
            (a, b) => new Date(b.recordingDate).getTime() - new Date(a.recordingDate).getTime(),
          );
          return sorted[0] ?? null;
        }
      } catch (e) {
        this.searchLog.push({ query: nameVariant, type: 'grantee', resultsFound: 0, reason: `Error: ${e}` });
      }
      await this.rateLimit();
    }

    // Strategy 3: Grantor name search (fallback — may have sold property)
    const primaryName = task.alternateNames[0] ?? task.owner;
    try {
      const results = await this.clerkAdapter.searchByGrantorName(primaryName);
      const deeds = results.filter((r) =>
        ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed'].includes(r.documentType),
      );
      this.searchLog.push({
        query: primaryName, type: 'grantor',
        resultsFound: deeds.length,
        reason: 'Grantor search — property may have been sold',
      });
      if (deeds.length > 0) {
        return this.apiKey
          ? await this.aiSelectCorrectDeed(deeds, task, context)
          : (deeds[0] ?? null);
      }
    } catch (e) {
      this.searchLog.push({ query: primaryName, type: 'grantor', resultsFound: 0, reason: `Error: ${e}` });
    }

    return null;
  }

  // ── AI deed selector ─────────────────────────────────────────────────────────

  private async aiSelectCorrectDeed(
    candidates: ClerkDocumentResult[],
    task: AdjacentResearchTask,
    context: { owner: string; subdivisionName?: string },
  ): Promise<ClerkDocumentResult | null> {
    const candidateList = candidates
      .map(
        (c, i) =>
          `${i + 1}. Instrument# ${c.instrumentNumber} | Type: ${c.documentType} | ` +
          `Date: ${c.recordingDate} | Grantors: ${c.grantors.join(', ')} | ` +
          `Grantees: ${c.grantees.join(', ')}`,
      )
      .join('\n');

    const prompt = `You are a title researcher selecting the correct deed for an adjacent property.

LOOKING FOR: A deed conveying real property TO (grantee) "${task.owner}".
CONTEXT: Adjacent to "${context.owner}"${context.subdivisionName ? ` (${context.subdivisionName})` : ''}.
CALLED ACREAGES from our plat: ${task.calledAcreages.length > 0 ? task.calledAcreages.join(', ') + ' acres' : 'unknown'}.
SHARED BOUNDARY DIRECTION: ${task.sharedDirection}.

CANDIDATE DEEDS:
${candidateList}

SELECT the deed that best matches by:
1. Grantee should be "${task.owner}" (or a name variant)
2. Acreage should match one of: ${task.calledAcreages.join(', ')} (if known)
3. Prefer the most recent (current ownership)
4. A deed of trust or lien is NOT what we want

Reply with ONLY the number (1, 2, 3...) or "NONE" if no match.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      // Check HTTP status before parsing
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        this.logger.warn(
          'AdjacentWorker',
          `AI deed selection HTTP ${response.status}: ${errBody.slice(0, 200)}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      };

      if (data.error) {
        this.logger.warn('AdjacentWorker', `AI deed selection API error: ${data.error.message ?? JSON.stringify(data.error)}`);
        return null;
      }

      const answer = (data.content?.[0]?.text ?? '').trim();

      if (answer === 'NONE') return null;
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < candidates.length) {
        this.searchLog.push({
          query: `AI selection (${candidates.length} candidates)`,
          type: 'grantee',
          resultsFound: candidates.length,
          selectedDocument: candidates[idx].instrumentNumber,
          reason: `AI selected candidate #${idx + 1}`,
        });
        return candidates[idx];
      }
    } catch (e) {
      this.logger.warn('AdjacentWorker', `AI deed selection failed: ${e}`);
    }
    return null;
  }

  // ── Step B: Download images ──────────────────────────────────────────────────

  private async downloadDeedImages(
    deed: ClerkDocumentResult,
    _outputDir: string,
  ): Promise<DocumentImage[]> {
    // Note: _outputDir parameter is reserved for future use when adapters support
    // specifying an output directory for downloads. Currently adapters save to
    // their own configured paths and return DocumentImage objects with imagePath.
    try {
      return await this.clerkAdapter.getDocumentImages(deed.instrumentNumber);
    } catch (e) {
      this.logger.warn('AdjacentWorker', `Failed to download images for ${deed.instrumentNumber}: ${e}`);
      return [];
    }
  }

  // ── Step C: AI extraction ────────────────────────────────────────────────────

  private async extractBoundaryFromAdjacentDeed(
    imagePaths: string[],
    task: AdjacentResearchTask,
    context: { owner: string; subdivisionName?: string },
  ): Promise<ExtractedAdjacentBoundary | null> {
    if (imagePaths.length === 0) return null;

    // Build image content blocks for Claude Vision
    const imageContents = imagePaths
      .filter((p) => {
        try { return fs.existsSync(p); } catch { return false; }
      })
      .map((p) => {
        const ext = p.toLowerCase();
        const mediaType = ext.endsWith('.jpg') || ext.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType as 'image/jpeg' | 'image/png',
            data: fs.readFileSync(p).toString('base64'),
          },
        };
      });

    if (imageContents.length === 0) {
      this.logger.warn('AdjacentWorker', 'No readable images found for AI extraction');
      return null;
    }

    const prompt = `You are a professional land surveyor extracting metes and bounds boundary data from an adjacent property deed.

THIS DEED BELONGS TO: ${task.owner}
OUR SUBJECT PROPERTY: ${context.owner}${context.subdivisionName ? ` (part of ${context.subdivisionName})` : ''}
THE SHARED BOUNDARY IS ON THE: ${task.sharedDirection} side of our property

Extract the COMPLETE metes and bounds description. Return ONLY valid JSON (no markdown):
{
  "calledAcreage": 0.0,
  "surveyReference": "abstract/survey name if found",
  "pointOfBeginning": "monument description",
  "metesAndBounds": [
    {
      "callNumber": 1,
      "bearing": "N 45°28'15\\" E",
      "distance": 100.00,
      "unit": "feet",
      "type": "straight",
      "along": "what this line runs along (e.g. 'FM 436 ROW') or null",
      "monument": "monument at end of this call or null",
      "referencesOurProperty": false,
      "isSharedBoundary": false,
      "confidence": 80,
      "curve": null
    }
  ],
  "notes": []
}

CRITICAL:
- Set referencesOurProperty=true for calls mentioning "${context.owner}" or "${context.subdivisionName ?? 'N/A'}"
- Set isSharedBoundary=true for calls along the ${task.sharedDirection} side (shared with our property)
- Include ALL calls — do not skip any
- For varas: set unit="varas" and do NOT convert to feet
- For watermarked text: provide best reading and set confidence accordingly (0-100)
- For curve calls: populate the "curve" object with radius, arcLength, chordBearing, chordDistance, delta`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 8000,
          messages: [
            {
              role: 'user',
              content: [...imageContents, { type: 'text', text: prompt }],
            },
          ],
        }),
      });

      // Always check HTTP status before parsing — avoids silent failures on rate limits / auth errors
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        this.logger.warn(
          'AdjacentWorker',
          `AI extraction HTTP ${response.status} ${response.statusText}: ${errBody.slice(0, 200)}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      };

      // Handle Anthropic API-level errors (e.g., context-length exceeded)
      if (data.error) {
        this.logger.warn('AdjacentWorker', `AI extraction API error: ${data.error.message ?? JSON.stringify(data.error)}`);
        return null;
      }

      const text = data.content?.[0]?.text ?? '';
      if (!text) {
        this.logger.warn('AdjacentWorker', 'AI extraction returned empty response');
        return null;
      }

      const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim()) as {
        metesAndBounds?: AdjacentBoundaryCall[];
        calledAcreage?: number;
        surveyReference?: string;
        pointOfBeginning?: string;
        notes?: string[];
      };

      return {
        totalCalls:       parsed.metesAndBounds?.length ?? 0,
        metesAndBounds:   parsed.metesAndBounds ?? [],
        calledAcreage:    parsed.calledAcreage,
        surveyReference:  parsed.surveyReference,
        pointOfBeginning: parsed.pointOfBeginning,
        notes:            parsed.notes ?? [],
      };
    } catch (e) {
      this.logger.warn('AdjacentWorker', `AI extraction parse failed: ${e}`);
      return null;
    }
  }

  // ── Step D: Chain of title ────────────────────────────────────────────────────

  private async traceChainOfTitle(
    startDeed: ClerkDocumentResult,
    generations: number,
  ): Promise<ChainEntry[]> {
    // The most recent deed's metes-and-bounds text (used for boundary comparison)
    // We store the raw document text/description to compare against predecessors.
    // If the adapter returns a legalDescription field, use it; otherwise use instrument summary.
    const getDescription = (doc: ClerkDocumentResult): string =>
      (doc as unknown as Record<string, unknown>).legalDescription as string
      ?? `${doc.documentType} dated ${doc.recordingDate} Grantors: ${doc.grantors.join(', ')} Grantees: ${doc.grantees.join(', ')}`;

    const chain: ChainEntry[] = [
      {
        grantor:                    startDeed.grantors.join(', '),
        grantee:                    startDeed.grantees.join(', '),
        date:                       startDeed.recordingDate,
        instrument:                 startDeed.instrumentNumber,
        boundaryDescriptionChanged: false,
      },
    ];

    let currentGrantors = startDeed.grantors;
    let previousDescription = getDescription(startDeed);

    for (let gen = 0; gen < generations && currentGrantors.length > 0; gen++) {
      const grantor = currentGrantors[0];
      try {
        const results = await this.clerkAdapter.searchByGranteeName(grantor, {
          documentTypes: ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed'] as never,
        });
        const sorted = results
          .filter((r) =>
            ['warranty_deed', 'special_warranty_deed', 'quitclaim_deed', 'other'].includes(
              r.documentType,
            ),
          )
          .sort(
            (a, b) =>
              new Date(b.recordingDate).getTime() - new Date(a.recordingDate).getTime(),
          );

        if (sorted.length > 0) {
          const pred = sorted[0];
          const predDescription = getDescription(pred);

          // Detect if the boundary description changed between this deed and the previous one.
          // Uses AI comparison if API key is available; falls back to heuristic comparison.
          const changed = await this.detectBoundaryDescriptionChange(
            previousDescription,
            predDescription,
          );

          chain.push({
            grantor:                    pred.grantors.join(', '),
            grantee:                    pred.grantees.join(', '),
            date:                       pred.recordingDate,
            instrument:                 pred.instrumentNumber,
            boundaryDescriptionChanged: changed,
          });
          currentGrantors = pred.grantors;
          previousDescription = predDescription;
        } else {
          break;
        }
      } catch (e) {
        this.logger.warn('AdjacentWorker', `Chain of title search failed for "${grantor}": ${e}`);
        break;
      }
      await this.rateLimit();
    }

    return chain;
  }

  /**
   * Detect whether the boundary description changed between two consecutive deeds.
   *
   * Priority:
   *   1. If ANTHROPIC_API_KEY set: use Claude to compare the two descriptions.
   *   2. Otherwise: use heuristic keyword comparison (number of bearing references, acreage).
   *
   * Returns true if a meaningful change is detected, false otherwise.
   * Never throws — returns false on any error to avoid stopping the chain trace.
   */
  private async detectBoundaryDescriptionChange(
    previousDesc: string,
    currentDesc: string,
  ): Promise<boolean> {
    // If both descriptions are identical, skip AI call (common in early-generation deeds
    // that copy the full metes-and-bounds verbatim)
    if (previousDesc.trim() === currentDesc.trim()) return false;

    // Heuristic: if descriptions are short summaries (no bearing data), cannot compare
    const hasBearingData = (desc: string) => /N\s+\d|S\s+\d|bearing|metes|bounds/i.test(desc);
    if (!hasBearingData(previousDesc) || !hasBearingData(currentDesc)) {
      // Cannot determine from instrument summaries alone — assume no change
      return false;
    }

    // With API key: ask Claude to compare
    if (this.apiKey) {
      try {
        const prompt = `Compare these two property deed descriptions and determine if the boundary description (metes and bounds) changed between them.

DEED 1 (predecessor/older):
${previousDesc.slice(0, 1500)}

DEED 2 (successor/newer):
${currentDesc.slice(0, 1500)}

Did the boundary description change? Answer ONLY "YES" or "NO".
YES = the metes-and-bounds calls (bearings, distances) are meaningfully different.
NO = the calls are essentially the same (same boundary, possibly different phrasing).`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: 10,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          // Rate limited or auth error — fall through to heuristic
          this.logger.warn('AdjacentWorker', `boundaryDescriptionChanged AI call HTTP ${response.status}`);
          return false;
        }

        const data = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
          error?: { message?: string };
        };

        if (data.error) {
          this.logger.warn('AdjacentWorker', `boundaryDescriptionChanged AI error: ${data.error.message}`);
          return false;
        }

        const answer = (data.content?.[0]?.text ?? '').trim().toUpperCase();
        return answer.startsWith('YES');
      } catch (e) {
        this.logger.warn('AdjacentWorker', `boundaryDescriptionChanged AI call failed: ${e}`);
        return false;
      }
    }

    // Heuristic fallback (no API key): compare normalized bearing strings
    // If the set of bearings in both descriptions overlaps > 80%, assume unchanged
    const extractBearings = (desc: string): string[] =>
      (desc.match(/[NS]\s*\d+[°\s]+\d+['']\s*\d*[""]?\s*[EW]/gi) ?? [])
        .map((b) => b.replace(/\s+/g, '').toUpperCase());

    const bearings1 = new Set(extractBearings(previousDesc));
    const bearings2 = new Set(extractBearings(currentDesc));
    if (bearings1.size === 0 || bearings2.size === 0) return false;

    const intersection = [...bearings1].filter((b) => bearings2.has(b)).length;
    const overlapRatio = intersection / Math.max(bearings1.size, bearings2.size);
    return overlapRatio < 0.8; // < 80% overlap → boundary likely changed
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────────

  /**
   * Minimum delay between county clerk navigations to avoid rate-limit violations.
   * Base delay read from CLERK_RATE_LIMIT_MS env var (default: 3000ms).
   * Adds a random jitter of 0-2 seconds on top to avoid detectable patterns.
   */
  private async rateLimit(): Promise<void> {
    const delay = RATE_LIMIT_BASE_MS + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
