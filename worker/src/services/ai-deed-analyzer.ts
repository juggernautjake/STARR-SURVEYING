// worker/src/services/ai-deed-analyzer.ts
// Pipeline B — Deed Text Analysis for STARR RECON Phase 3.
//
// Wraps the existing extractDocuments() function from ai-extraction.ts to
// produce structured DeedAnalysisResult and DeedChainEntry objects.
//
// Key design rule: This file does NOT reimplement extraction logic.
// It only orchestrates extractDocuments() and converts its output to the
// Phase 3 data model types.
//
// Spec: docs/planning/in-progress/STARR_RECON/PHASE_03_EXTRACTION.md §6

import Anthropic from '@anthropic-ai/sdk';
import { extractDocuments } from './ai-extraction.js';
import { completeBoundaryCallCurve } from '../lib/curve-params.js';
import { toConfidenceSymbol } from '../models/property-intelligence.js';
import type {
  P3BoundaryCall,
  DeedChainEntry,
  ExtractionSource,
  Reading,
} from '../models/property-intelligence.js';
import type { DocumentResult, BoundaryCall, ExtractedBoundaryData } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6';

/** 1 Texas vara = 33⅓ inches = 2.7778 feet (exact survey feet) */
const VARAS_TO_FEET = 2.7778;

// ── Metadata extraction prompt ────────────────────────────────────────────

const DEED_METADATA_PROMPT = `You are a senior Texas RPLS and title examiner with 30+ years of experience. Given this Texas deed document text, extract structured metadata with maximum thoroughness.

Return ONLY valid JSON (no markdown fences):
{
  "grantor": "full legal name of grantor/seller — include middle names, suffixes, entity types",
  "grantee": "full legal name of grantee/buyer — include middle names, suffixes, entity types",
  "deedDate": "YYYY-MM-DD or null",
  "recordingDate": "YYYY-MM-DD or null",
  "instrumentNumber": "string or null",
  "volumePage": { "volume": "string", "page": "string" } or null,
  "calledAcreage": number or null,
  "surveyReference": "JOHN SMITH SURVEY, A-123 or null — include abstract number",
  "parentTract": "description of the larger tract this parcel was carved from, or null",
  "parentInstrument": "instrument number or Vol/Page of the parent tract deed, or null",
  "priorDeedReferences": [
    {
      "instrumentNumber": "string or null — e.g. 2010043440",
      "volumePage": { "volume": "string", "page": "string" } or null,
      "description": "context of the reference — e.g. 'being the same land conveyed to...'",
      "type": "parent_deed|prior_conveyance|easement_deed|plat_reference|abstract_reference"
    }
  ],
  "calledFrom": [
    { "name": "string — full name of adjacent owner", "reference": "Vol 1234, Pg 567 or instrument number or null", "acreage": number or null, "direction": "north|south|east|west|northeast|northwest|southeast|southwest|null" }
  ],
  "easementsMentioned": ["detailed string description of each easement — include width, type, beneficiary, and location"],
  "rightOfWay": [
    { "name": "road/highway name", "width": number or null, "unit": "feet", "type": "TxDOT|county|city|private" }
  ],
  "coordinateInfo": {
    "datum": "NAD83|NAD27|unknown or null",
    "zone": "Texas Central|Texas South|Texas North|null",
    "pob": { "northing": number or null, "easting": number or null }
  } or null,
  "mineralReservation": "description of any mineral rights reservation or null",
  "restrictions": ["any restrictive covenants or deed restrictions"],
  "specialNotes": ["any unusual provisions, liens, title concerns, or surveyor notes"]
}

CRITICAL RULES:
- Extract EVERY reference to prior deeds. These are essential for building the deed chain history.
- Look for: "being the same property conveyed in...", "as described in...", "recorded in Vol...", "Instrument No..."
- For calledFrom: include EVERY adjacent owner mentioned by name in the boundary description.
- For easementsMentioned: include ALL easements — created, referenced, or reserved. Include width and type.
- For priorDeedReferences: capture ALL instrument numbers and Vol/Page references found anywhere in the deed.
- Extract exact names, do not abbreviate.
- Return empty arrays [] when no data found, not null.`;

// ── Public interfaces ─────────────────────────────────────────────────────

export interface DeedAnalysisResult {
  grantor: string;
  grantee: string;
  deedDate?: string;         // ISO date
  recordingDate?: string;    // ISO date
  instrumentNumber?: string;
  volumePage?: { volume: string; page: string };
  calledAcreage?: number;
  surveyReference?: string;  // "WILLIAM HARTRICK SURVEY, A-488"
  parentTract?: string;      // Description of parent tract
  parentInstrument?: string;
  metesAndBounds: P3BoundaryCall[];
  calledFrom: {
    name: string;
    reference?: string;
    acreage?: number;
    direction?: string;
  }[];
  easementsMentioned: string[];
  coordinateInfo?: {
    datum?: string;
    zone?: string;
    pob?: { northing?: number; easting?: number };
  };
  specialNotes: string[];
  confidence: number;  // 0–100
  rawExtraction?: ExtractedBoundaryData;
  totalApiCalls: number;
}

// ── AIDeedAnalyzer class ──────────────────────────────────────────────────

export class AIDeedAnalyzer {
  constructor(
    private apiKey: string,
    private logger: PipelineLogger,
  ) {}

  /**
   * Analyze one deed document (all pages as DocumentResult[]).
   * Calls extractDocuments() from ai-extraction.ts, then runs a second
   * structured-metadata extraction pass.
   */
  async analyzeDeed(
    documentResults: DocumentResult[],
    projectId: string,
    instrumentHint?: string,
  ): Promise<DeedAnalysisResult> {
    const label = instrumentHint ?? `deed-${projectId}`;
    const startTime = Date.now();
    let totalApiCalls = 0;

    this.logger.info('AIDeedAnalyzer', `Analyzing deed: ${label} (${documentResults.length} document result(s))`);

    if (documentResults.length === 0) {
      this.logger.warn('AIDeedAnalyzer', `No document results for ${label} — returning empty result`);
      return this.emptyResult(0);
    }

    // ── Step 1: Run the existing extractDocuments() pipeline ─────────────
    // This handles: multi-page OCR, adaptive vision for large images,
    // multi-pass verification, and confidence scoring.
    this.logger.info('AIDeedAnalyzer', `[${label}] Step 1: extractDocuments() via ai-extraction.ts`);

    let extraction: ExtractedBoundaryData | null = null;
    let updatedDocs: DocumentResult[] = documentResults;

    try {
      const extractResult = await extractDocuments(
        documentResults,
        null,   // No CAD legal description at Phase 3 level
        this.apiKey,
        this.logger,
      );
      updatedDocs  = extractResult.documents;
      extraction   = extractResult.boundary;
      totalApiCalls += updatedDocs.reduce((n, d) => n + (d.processingErrors?.length ?? 0) + 1, 0);

      this.logger.info(
        'AIDeedAnalyzer',
        `[${label}] extractDocuments complete: ${extraction?.calls.length ?? 0} calls, ` +
        `confidence ${extraction?.confidence.toFixed(2) ?? '?'}`,
      );
    } catch (err) {
      this.logger.error('AIDeedAnalyzer', `[${label}] extractDocuments failed`, err);
      // Return a partial result rather than throwing — Phase 3 continues with other docs
      return { ...this.emptyResult(Date.now() - startTime), totalApiCalls };
    }

    // ── Step 2: Convert boundary calls to P3BoundaryCall[] ────────────────
    const metesAndBounds = extraction
      ? this.convertCalls(extraction.calls, 'deed_text')
      : [];

    // ── Step 3: Collect all OCR text for metadata extraction ─────────────
    const allText = [
      ...updatedDocs.map(d => d.textContent ?? ''),
      ...updatedDocs.map(d => d.ocrText ?? ''),
    ].filter(t => t.trim().length > 20).join('\n\n---\n\n');

    // ── Step 4: Structured metadata extraction (grantor/grantee/calledFrom) ─
    this.logger.info('AIDeedAnalyzer', `[${label}] Step 4: Structured deed metadata extraction`);
    const metadata = await this.extractDeedMetadata(allText, label);
    totalApiCalls += 1;

    // ── Assemble result ────────────────────────────────────────────────────
    const confidence = extraction ? Math.round(extraction.confidence * 100) : 40;

    return {
      grantor:         metadata.grantor ?? '',
      grantee:         metadata.grantee ?? '',
      deedDate:        metadata.deedDate ?? undefined,
      recordingDate:   metadata.recordingDate ?? undefined,
      instrumentNumber: metadata.instrumentNumber ?? undefined,
      volumePage:      metadata.volumePage ?? undefined,
      calledAcreage:   metadata.calledAcreage ?? extraction?.area?.value ?? undefined,
      surveyReference: metadata.surveyReference ?? undefined,
      parentTract:     metadata.parentTract ?? undefined,
      parentInstrument: metadata.parentInstrument ?? undefined,
      metesAndBounds,
      calledFrom:      metadata.calledFrom ?? [],
      easementsMentioned: metadata.easementsMentioned ?? [],
      coordinateInfo:  metadata.coordinateInfo ?? undefined,
      specialNotes:    metadata.specialNotes ?? [],
      confidence,
      rawExtraction:   extraction ?? undefined,
      totalApiCalls,
    };
  }

  /**
   * Convert a DeedAnalysisResult into a DeedChainEntry for
   * PropertyIntelligence.deedChain[].
   */
  toDeedChainEntry(result: DeedAnalysisResult, documentType = 'deed'): DeedChainEntry {
    return {
      instrument:      result.instrumentNumber ?? '',
      type:            documentType,
      date:            result.deedDate ?? result.recordingDate ?? '',
      grantor:         result.grantor,
      grantee:         result.grantee,
      calledAcreage:   result.calledAcreage,
      parentTract:     result.parentTract,
      parentInstrument: result.parentInstrument,
      surveyReference: result.surveyReference,
      metesAndBounds:  result.metesAndBounds,
      notes:           [
        ...result.specialNotes,
        ...result.easementsMentioned.map(e => `Easement: ${e}`),
      ],
    };
  }

  /**
   * Convert legacy BoundaryCall[] (from ai-extraction.ts) to P3BoundaryCall[]
   * with the given source tag. Varas are converted to feet.
   */
  convertCalls(
    calls: BoundaryCall[],
    source: ExtractionSource,
  ): P3BoundaryCall[] {
    const result: P3BoundaryCall[] = [];

    for (const call of calls) {
      if (!call.bearing && !call.curve) continue;

      const rawBearing   = call.bearing?.raw ?? '';
      const rawDistValue = call.distance?.value ?? 0;
      const rawDistUnit  = call.distance?.unit ?? 'feet';

      // Convert varas to feet
      const distFeet = rawDistUnit === 'varas'
        ? rawDistValue * VARAS_TO_FEET
        : rawDistValue;

      const ocrConf    = Math.round(call.confidence * 100);
      const confSymbol = toConfidenceSymbol(ocrConf, 'text_only', null);

      const readings: Reading[] = [{
        value:       `${rawBearing}, ${distFeet.toFixed(2)}'`,
        source,
        confidence:  ocrConf,
        isGeometric: false,
      }];

      if (call.curve) {
        // Curve call — complete missing params using curve-params.ts
        const curveData: P3BoundaryCall['curve'] = {
          radius:        call.curve.radius?.value ?? 0,
          arcLength:     call.curve.arcLength?.value,
          chordBearing:  call.curve.chordBearing?.raw,
          chordDistance: call.curve.chordDistance?.value,
          delta:         call.curve.delta?.raw,
          direction:     call.curve.direction,
        };

        // Attempt to complete the curve params
        try {
          const completed = completeBoundaryCallCurve(call.curve);
          if (completed.computed.length > 0) {
            const firstParam = completed.computed[0];
            const val = completed.params[firstParam];
            if (val !== null) {
              curveData.computed = {
                missingParam:  firstParam,
                computedValue: val as number,
                formula:       `${firstParam} computed from known params`,
              };
            }
          }
          // Fill in any newly computed params (guard guarantees non-null before assignment)
          if (!curveData.arcLength    && completed.params.arcLength_ft !== null) curveData.arcLength    = completed.params.arcLength_ft;
          if (!curveData.chordDistance && completed.params.chord_ft     !== null) curveData.chordDistance = completed.params.chord_ft;
        } catch (curveErr) {
          // completeBoundaryCallCurve failures are non-fatal but worth noting for debugging
          this.logger.warn(
            'AIDeedAnalyzer',
            `Curve completion failed for sequence ${call.sequence}: ${curveErr instanceof Error ? curveErr.message : String(curveErr)}`,
          );
        }

        const arcL = curveData.arcLength ?? 0;
        result.push({
          callId:           `deed_CV${call.sequence}`,
          sequenceNumber:   call.sequence,
          bearing:          call.curve.chordBearing?.raw ?? rawBearing,
          bearingDecimal:   call.bearing?.decimalDegrees,
          distance:         arcL,
          unit:             'feet',
          type:             'curve',
          along:            call.along ?? undefined,
          toMonument:       call.toPoint ?? undefined,
          curve:            curveData,
          confidence:       ocrConf,
          confidenceSymbol: confSymbol,
          sources:          [source],
          allReadings:      readings,
          bestReading:      `Curve R=${curveData.radius}', L=${arcL.toFixed(2)}'`,
        });
      } else {
        // Straight-line call
        result.push({
          callId:           `deed_C${call.sequence}`,
          sequenceNumber:   call.sequence,
          bearing:          rawBearing,
          bearingDecimal:   call.bearing?.decimalDegrees,
          distance:         distFeet,
          unit:             rawDistUnit === 'varas' ? 'varas' : 'feet',
          type:             'straight',
          along:            call.along ?? undefined,
          toMonument:       call.toPoint ?? undefined,
          confidence:       ocrConf,
          confidenceSymbol: confSymbol,
          sources:          [source],
          allReadings:      readings,
          bestReading:      `${rawBearing}, ${distFeet.toFixed(2)}'`,
        });
      }
    }

    return result;
  }

  // ── Private: extract deed metadata ────────────────────────────────────

  private async extractDeedMetadata(
    text: string,
    label: string,
  ): Promise<{
    grantor?: string;
    grantee?: string;
    deedDate?: string;
    recordingDate?: string;
    instrumentNumber?: string;
    volumePage?: { volume: string; page: string };
    calledAcreage?: number;
    surveyReference?: string;
    parentTract?: string;
    parentInstrument?: string;
    priorDeedReferences?: { instrumentNumber?: string; volumePage?: { volume: string; page: string }; description?: string; type?: string }[];
    calledFrom: { name: string; reference?: string; acreage?: number; direction?: string }[];
    easementsMentioned: string[];
    rightOfWay?: { name: string; width?: number; unit?: string; type?: string }[];
    coordinateInfo?: {
      datum?: string;
      zone?: string;
      pob?: { northing?: number; easting?: number };
    };
    mineralReservation?: string;
    restrictions?: string[];
    specialNotes: string[];
  }> {
    const emptyMeta = {
      grantor: '', grantee: '', calledFrom: [], easementsMentioned: [], specialNotes: [],
      priorDeedReferences: [], rightOfWay: [], restrictions: [],
    };

    if (!text || text.trim().length < 30) {
      this.logger.warn('AIDeedAnalyzer', `[${label}] Insufficient text for metadata extraction`);
      return emptyMeta;
    }

    const tracker = this.logger.startAttempt({
      layer:  'AIDeedAnalyzer-Metadata',
      source: 'Claude',
      method: 'deed-metadata',
      input:  label,
    });

    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create({
        model:      AI_MODEL,
        max_tokens: 4096,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `${DEED_METADATA_PROMPT}\n\n=== DEED TEXT ===\n${text.substring(0, 15000)}`,
        }],
      });

      const textBlock = response.content.find(c => c.type === 'text');
      const raw = textBlock?.type === 'text' ? textBlock.text : '{}';

      // Strip markdown fences
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        this.logger.warn('AIDeedAnalyzer', `[${label}] Metadata JSON parse error`);
        tracker({ status: 'partial', error: 'JSON parse error in metadata response' });
        return emptyMeta;
      }

      tracker({ status: 'success', dataPointsFound: 1 });

      return {
        grantor:         this.safeStr(parsed.grantor),
        grantee:         this.safeStr(parsed.grantee),
        deedDate:        this.safeStr(parsed.deedDate),
        recordingDate:   this.safeStr(parsed.recordingDate),
        instrumentNumber: this.safeStr(parsed.instrumentNumber),
        volumePage:      this.parseVolumePage(parsed.volumePage),
        calledAcreage:   typeof parsed.calledAcreage === 'number' ? parsed.calledAcreage : undefined,
        surveyReference: this.safeStr(parsed.surveyReference),
        parentTract:     this.safeStr(parsed.parentTract),
        parentInstrument: this.safeStr(parsed.parentInstrument),
        priorDeedReferences: this.parsePriorDeedReferences(parsed.priorDeedReferences),
        calledFrom:      this.parseCalledFrom(parsed.calledFrom),
        easementsMentioned: this.parseStringArray(parsed.easementsMentioned),
        rightOfWay:      this.parseRightOfWay(parsed.rightOfWay),
        coordinateInfo:  this.parseCoordinateInfo(parsed.coordinateInfo),
        mineralReservation: this.safeStr(parsed.mineralReservation),
        restrictions:    this.parseStringArray(parsed.restrictions),
        specialNotes:    this.parseStringArray(parsed.specialNotes),
      };
    } catch (err) {
      tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
      this.logger.error('AIDeedAnalyzer', `[${label}] Metadata extraction API call failed`, err);
      return emptyMeta;
    }
  }

  // ── Private: type-safe parsing helpers ────────────────────────────────

  private emptyResult(totalApiCalls: number): DeedAnalysisResult {
    return {
      grantor:            '',
      grantee:            '',
      metesAndBounds:     [],
      calledFrom:         [],
      easementsMentioned: [],
      specialNotes:       [],
      confidence:         0,
      totalApiCalls,
    };
  }

  private safeStr(val: unknown): string | undefined {
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return undefined;
  }

  private parseVolumePage(val: unknown): { volume: string; page: string } | undefined {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const volume = this.safeStr(obj.volume);
      const page   = this.safeStr(obj.page);
      if (volume && page) return { volume, page };
    }
    return undefined;
  }

  private parseCalledFrom(val: unknown): DeedAnalysisResult['calledFrom'] {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;
      const name = this.safeStr(obj.name);
      if (!name) return [];
      return [{
        name,
        reference: this.safeStr(obj.reference),
        acreage:   typeof obj.acreage === 'number' ? obj.acreage : undefined,
        direction: this.safeStr(obj.direction),
      }];
    });
  }

  private parseStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return [];
    return val.filter(s => typeof s === 'string' && s.trim().length > 0) as string[];
  }

  private parseCoordinateInfo(val: unknown): DeedAnalysisResult['coordinateInfo'] {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
    const obj = val as Record<string, unknown>;
    return {
      datum: this.safeStr(obj.datum),
      zone:  this.safeStr(obj.zone),
      pob:   obj.pob && typeof obj.pob === 'object' ? {
        northing: typeof (obj.pob as Record<string, unknown>).northing === 'number'
          ? (obj.pob as Record<string, unknown>).northing as number : undefined,
        easting:  typeof (obj.pob as Record<string, unknown>).easting === 'number'
          ? (obj.pob as Record<string, unknown>).easting  as number : undefined,
      } : undefined,
    };
  }

  private parsePriorDeedReferences(val: unknown): {
    instrumentNumber?: string;
    volumePage?: { volume: string; page: string };
    description?: string;
    type?: string;
  }[] {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;
      const instrumentNumber = this.safeStr(obj.instrumentNumber);
      const volumePage = this.parseVolumePage(obj.volumePage);
      const description = this.safeStr(obj.description);
      const type = this.safeStr(obj.type);
      // At least one identifying field must be present
      if (!instrumentNumber && !volumePage) return [];
      return [{ instrumentNumber, volumePage, description, type }];
    });
  }

  private parseRightOfWay(val: unknown): {
    name: string;
    width?: number;
    unit?: string;
    type?: string;
  }[] {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const obj = item as Record<string, unknown>;
      const name = this.safeStr(obj.name);
      if (!name) return [];
      return [{
        name,
        width: typeof obj.width === 'number' ? obj.width : undefined,
        unit: this.safeStr(obj.unit) ?? 'feet',
        type: this.safeStr(obj.type),
      }];
    });
  }
}
