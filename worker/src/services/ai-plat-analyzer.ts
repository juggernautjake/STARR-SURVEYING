// worker/src/services/ai-plat-analyzer.ts
// Pipeline A — Plat Analysis for STARR RECON Phase 3.
//
// Orchestrates the existing adaptive-vision.ts, geo-reconcile.ts, and
// curve-params.ts services to produce structured LotData[] and P3BoundaryCall[]
// from plat image files.
//
// Key design rule: This file does NOT reimplement any OCR segmentation,
// geometric analysis, or curve math. It only orchestrates the existing
// services and converts their output to the Phase 3 data model.
//
// Spec: STARR_RECON/PHASE_03_EXTRACTION.md §5

import Anthropic from '@anthropic-ai/sdk';
import { adaptiveVisionOcr } from './adaptive-vision.js';
import { analyzeVisualGeometry, reconcileGeometry } from './geo-reconcile.js';
import { completeCurveParams } from '../lib/curve-params.js';
import { toConfidenceSymbol } from '../models/property-intelligence.js';
import type {
  P3BoundaryCall,
  LotData,
  EasementInfo,
  RoadInfo,
  ExtractionSource,
  Reading,
} from '../models/property-intelligence.js';
import type { PipelineLogger } from '../lib/logger.js';
import type { AdaptiveVisionResult } from './adaptive-vision.js';
import type { ReconciliationResult, CallReconciliation } from './geo-reconcile.js';

// ── Constants ─────────────────────────────────────────────────────────────

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

/** 1 Texas vara = 33⅓ inches = 2.7778 feet (exact) */
const VARAS_TO_FEET = 2.7778;

// ── Public interfaces ─────────────────────────────────────────────────────

export interface PlatSubdivisionInfo {
  name?: string;
  surveyor?: string;
  rpls?: string;
  surveyDate?: string;
  platDate?: string;
  platInstrument?: string;
  datum?: string;
  coordinateZone?: string;
  unitSystem?: string;
  scaleFactor?: number;
  totalLots?: number;
  hasReserves?: boolean;
  hasCommonAreas?: boolean;
  restrictiveCovenants?: string;
  pob?: {
    northing?: number;
    easting?: number;
    description?: string;
  };
}

export interface PlatAnalysisResult {
  lots: LotData[];
  perimeterCalls: P3BoundaryCall[];
  adjacentOwners: { name: string; calledAcreage?: number; direction: string }[];
  roads: { name: string; type: string; rowWidth?: number }[];
  easements: { type: string; width?: number; location: string }[];
  subdivisionInfo: PlatSubdivisionInfo;
  lineTable: { id: string; bearing: string; distance: number }[];
  curveTable: {
    id: string;
    radius: number;
    arcLength: number;
    delta: string;
    chordBearing: string;
    chordDistance: number;
  }[];
  notes: string[];
  totalApiCalls: number;
  durationMs: number;
}

// ── Synthesis prompt ──────────────────────────────────────────────────────

const PLAT_SYNTHESIS_PROMPT = `You are a senior licensed Texas Registered Professional Land Surveyor (RPLS) extracting structured data from plat OCR text.

Given the OCR text and geometric reconciliation summary below, extract ALL lot boundary data in structured JSON.

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no explanation.
2. Extract every bearing and distance visible in the text. Do not skip any.
3. For each lot/reserve: list every boundary call in traverse order.
4. Bearings must be in DMS quadrant format: N ##°##'##" E
5. Distances in feet, to hundredths. Convert varas: 1 vara = 2.7778 ft.
6. Mark calls as "text_only" when only OCR text supports them (no visual measurement).
7. Mark calls as "confirmed" when both OCR and visual geometry agree.
8. Mark calls as "conflict" when OCR and visual geometry disagree by > 5 degrees or > 5% distance.
9. For curves: extract ALL known params (R, L, arc, chord bearing, chord distance, delta, direction).
10. Extract adjacent owner names from "along the [NAME] [N]-acre tract" patterns.
11. Extract roads by their FM/SH/US/CR/Spur/Loop designations.
12. Extract building setbacks from notes or certificate blocks.
13. Extract easement widths and locations from plat notes.

Return JSON matching this structure exactly:
{
  "subdivisionInfo": {
    "name": "string or null",
    "surveyor": "string or null",
    "rpls": "string or null",
    "surveyDate": "YYYY-MM-DD or null",
    "platDate": "YYYY-MM-DD or null",
    "platInstrument": "string or null",
    "datum": "NAD83|NAD27|unknown or null",
    "coordinateZone": "string or null",
    "unitSystem": "string or null",
    "scaleFactor": number or null,
    "hasReserves": boolean,
    "hasCommonAreas": boolean,
    "restrictiveCovenants": "instrument number or null",
    "pob": { "northing": number or null, "easting": number or null, "description": "string or null" } or null
  },
  "lots": [
    {
      "lotId": "lot_1",
      "name": "Lot 1",
      "lotType": "residential|commercial|reserve|common_area|open_space|drainage|unknown",
      "acreage": number or null,
      "sqft": number or null,
      "calls": [
        {
          "sequenceNumber": 1,
          "bearing": "N 85°22'02\" E",
          "bearingDecimal": 85.367,
          "distance": 461.81,
          "unit": "feet",
          "type": "straight",
          "along": "string or null",
          "fromMonument": "string or null",
          "toMonument": "string or null",
          "status": "confirmed|conflict|text_only|unresolved",
          "notes": "string or null"
        }
      ],
      "curves": [
        {
          "sequenceNumber": 10,
          "bearing": "N 45°28'15\" E",
          "distance": 0,
          "unit": "feet",
          "type": "curve",
          "radius": number,
          "arcLength": number or null,
          "chordBearing": "string or null",
          "chordDistance": number or null,
          "delta": "string or null",
          "direction": "left|right",
          "along": "string or null",
          "status": "confirmed|conflict|text_only|unresolved",
          "notes": "string or null"
        }
      ],
      "buildingSetbacks": { "front": number or null, "side": number or null, "rear": number or null, "notes": "string or null" } or null,
      "easements": ["string"],
      "notes": ["string"]
    }
  ],
  "perimeterCalls": [
    {
      "sequenceNumber": 1,
      "bearing": "N 85°22'02\" E",
      "bearingDecimal": 85.367,
      "distance": 461.81,
      "unit": "feet",
      "type": "straight",
      "along": "string or null",
      "fromMonument": "string or null",
      "toMonument": "string or null",
      "status": "confirmed|conflict|text_only|unresolved",
      "notes": "string or null"
    }
  ],
  "adjacentOwners": [
    { "name": "string", "calledAcreage": number or null, "direction": "north|south|east|west|northeast|northwest|southeast|southwest|unknown" }
  ],
  "roads": [
    { "name": "string", "type": "farm_to_market|ranch_to_market|state_highway|us_highway|county_road|city_street|private_road|other", "rowWidth": number or null }
  ],
  "easements": [
    { "type": "utility|drainage|access|pipeline|other", "width": number or null, "location": "string" }
  ],
  "lineTable": [
    { "id": "L1", "bearing": "string", "distance": number }
  ],
  "curveTable": [
    { "id": "C1", "radius": number, "arcLength": number, "delta": "string", "chordBearing": "string", "chordDistance": number }
  ],
  "notes": ["string"]
}`;

// ── AIPlatAnalyzer class ──────────────────────────────────────────────────

export class AIPlatAnalyzer {
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(apiKey: string, logger: PipelineLogger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  /**
   * Analyze one or more plat image buffers (pages) and return structured data.
   * Page 1 is the survey drawing; pages 2+ are typically certificates/notes.
   */
  async analyzePlat(
    imageBuffers: Buffer[],
    projectId: string,
  ): Promise<PlatAnalysisResult> {
    const startTime = Date.now();
    this.logger.info('AIPlatAnalyzer', `Analyzing ${imageBuffers.length} plat page(s) for project ${projectId}`);

    if (imageBuffers.length === 0) {
      this.logger.warn('AIPlatAnalyzer', 'No plat image buffers provided — returning empty result');
      return this.emptyResult(Date.now() - startTime);
    }

    // Process each page independently then merge
    const pageResults: PlatAnalysisResult[] = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      try {
        this.logger.info('AIPlatAnalyzer', `Processing page ${i + 1}/${imageBuffers.length}`);
        const result = await this.analyzeSinglePlatPage(
          imageBuffers[i],
          i + 1,
          imageBuffers.length,
        );
        pageResults.push(result);
      } catch (err) {
        this.logger.error(
          'AIPlatAnalyzer',
          `Page ${i + 1} failed — skipping and continuing`,
          err,
        );
        // Continue with remaining pages rather than failing entire plat
      }
    }

    if (pageResults.length === 0) {
      this.logger.warn('AIPlatAnalyzer', 'All plat pages failed — returning empty result');
      return this.emptyResult(Date.now() - startTime);
    }

    const merged = this.mergePageResults(pageResults);
    merged.durationMs = Date.now() - startTime;

    this.logger.info(
      'AIPlatAnalyzer',
      `Plat analysis complete: ${merged.lots.length} lots, ` +
      `${merged.perimeterCalls.length} perimeter calls, ` +
      `${merged.totalApiCalls} API calls, ${merged.durationMs}ms`,
    );

    return merged;
  }

  // ── Private: single page ───────────────────────────────────────────────

  private async analyzeSinglePlatPage(
    imageBuffer: Buffer,
    pageNum: number,
    totalPages: number,
  ): Promise<PlatAnalysisResult> {
    const label = `plat-p${pageNum}`;
    let apiCalls = 0;

    // ── Step 1: Adaptive Vision OCR ─────────────────────────────────────
    // Uses the 6-phase quadrant system from adaptive-vision.ts.
    // Handles oversized plat images automatically.
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 1: AdaptiveVision OCR`);
    const ocrResult: AdaptiveVisionResult = await adaptiveVisionOcr(
      imageBuffer,
      'image/png',
      this.apiKey,
      this.logger,
      label,
    );
    apiCalls += ocrResult.totalApiCalls;
    this.logger.info(
      'AIPlatAnalyzer',
      `[${label}] OCR done: ${ocrResult.overallConfidence.toFixed(0)}% confidence, ` +
      `${ocrResult.totalSegments} segments, ${ocrResult.escalatedSegments} escalated`,
    );

    // ── Step 2: Visual Geometry Analysis ────────────────────────────────
    // Measures bearing angles and distances from the drawing geometry itself,
    // independent of the printed text labels (catches watermark obscurations).
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 2: Visual geometry analysis`);
    const base64 = imageBuffer.toString('base64');
    const visualGeometry = await analyzeVisualGeometry(
      base64,
      'image/png',
      this.apiKey,
      this.logger,
      label,
    );
    apiCalls += 1; // analyzeVisualGeometry makes one API call

    // ── Step 3: Text Extraction (lightweight pass) ───────────────────────
    // Build a minimal ExtractedBoundaryData from OCR text for reconciliation.
    // Full deed-level extraction is handled by AIDeedAnalyzer; here we just
    // need something for reconcileGeometry() to work with.
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 3: Text extraction for reconciliation`);
    const textExtraction = this.buildTextExtractionFromOcr(ocrResult.mergedText);

    // ── Step 4: Cross-Reference Reconciliation ───────────────────────────
    // Compares OCR text vs visual geometry measurements, flags conflicts.
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 4: Cross-reference reconciliation`);
    const reconciliation: ReconciliationResult = reconcileGeometry(
      visualGeometry,
      textExtraction,
      this.logger,
    );
    this.logger.info(
      'AIPlatAnalyzer',
      `[${label}] Reconciliation: ${reconciliation.agreementCount} agree, ` +
      `${reconciliation.conflictCount} conflicts, ` +
      `${reconciliation.textOnlyCount} text-only`,
    );

    // ── Step 5: Synthesis AI call ────────────────────────────────────────
    // Uses merged OCR text + reconciliation summary to produce structured JSON.
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 5: Synthesis extraction`);
    const synthesisResult = await this.runSynthesisExtraction(
      ocrResult.mergedText,
      reconciliation,
      label,
    );
    apiCalls += 1; // synthesis is one API call

    // ── Step 6: Convert to typed LotData[] ──────────────────────────────
    this.logger.info('AIPlatAnalyzer', `[${label}] Step 6: Converting to typed data model`);
    const result = this.convertSynthesisToResult(
      synthesisResult,
      reconciliation,
      pageNum,
      totalPages,
    );
    result.totalApiCalls = apiCalls;

    return result;
  }

  // ── Private: build minimal ExtractedBoundaryData from OCR ─────────────

  /**
   * Build a minimal ExtractedBoundaryData-compatible object from raw OCR text
   * so that reconcileGeometry() has something to compare against visual geometry.
   * This is a best-effort structural parse, NOT a full semantic extraction.
   */
  private buildTextExtractionFromOcr(
    ocrText: string,
  ): import('../types/index.js').ExtractedBoundaryData | null {
    if (!ocrText || ocrText.trim().length === 0) return null;

    // Parse bearing+distance pairs from OCR text using comprehensive regex
    // Handles: "N 85°22'02" E, 461.81'" and "N85-22-02E, 461.81 ft" formats
    const bearingDistPat =
      /([NS]\s*\d+[°\-]\d+['′\-][\d.]+["″\-]?\s*[EW])\s*[,\s]+\s*([\d.]+)\s*(feet|ft|varas|')/gi;
    const calls: import('../types/index.js').BoundaryCall[] = [];
    let seq = 1;
    let m: RegExpExecArray | null;

    while ((m = bearingDistPat.exec(ocrText)) !== null) {
      const rawBearing = m[1].trim();
      const rawDist    = parseFloat(m[2]);
      const rawUnit    = m[3].toLowerCase().startsWith('var') ? 'varas' : 'feet';
      if (isNaN(rawDist)) continue;

      const decDeg = this.parseBearingToDec(rawBearing);
      calls.push({
        sequence:  seq++,
        bearing:   decDeg !== null
          ? { raw: rawBearing, decimalDegrees: decDeg, quadrant: this.extractQuadrant(rawBearing) }
          : null,
        distance:  { raw: `${rawDist} ${rawUnit}`, value: rawDist, unit: rawUnit as 'feet' | 'varas' },
        curve:     null,
        toPoint:   null,
        along:     null,
        confidence: 0.7,  // text-only, moderate confidence
      });
    }

    return {
      type:             'metes_and_bounds',
      datum:            this.detectDatum(ocrText),
      pointOfBeginning: { description: 'Extracted from plat OCR', referenceMonument: null },
      calls,
      references:       [],
      area:             null,
      lotBlock:         null,
      confidence:       calls.length > 0 ? 0.7 : 0.3,
      warnings:         [],
    };
  }

  // ── Private: synthesis extraction ─────────────────────────────────────

  private async runSynthesisExtraction(
    ocrText: string,
    reconciliation: ReconciliationResult,
    label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const reconcSummary = this.buildReconciliationSummary(reconciliation);
    const prompt =
      `=== OCR TEXT ===\n${ocrText.substring(0, 12000)}\n\n` +
      `=== GEOMETRIC RECONCILIATION SUMMARY ===\n${reconcSummary}\n\n` +
      PLAT_SYNTHESIS_PROMPT;

    const tracker = this.logger.startAttempt({
      layer:  'AIPlatAnalyzer-Synthesis',
      source: 'Claude',
      method: 'synthesis-extraction',
      input:  label,
    });

    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create({
        model:      AI_MODEL,
        max_tokens: 8192,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(c => c.type === 'text');
      const raw = textBlock?.type === 'text' ? textBlock.text : '{}';

      // Strip markdown fences if present (defensive)
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        this.logger.warn('AIPlatAnalyzer', `[${label}] Synthesis JSON parse error — returning empty lots`);
        tracker({ status: 'partial', error: 'JSON parse error in synthesis response' });
        return { lots: [], perimeterCalls: [], adjacentOwners: [], roads: [], easements: [], subdivisionInfo: {}, lineTable: [], curveTable: [], notes: [] };
      }

      tracker({ status: 'success', dataPointsFound: 1 });
      return parsed;
    } catch (err) {
      tracker({ status: 'fail', error: err instanceof Error ? err.message : String(err) });
      this.logger.error('AIPlatAnalyzer', `[${label}] Synthesis API call failed`, err);
      return { lots: [], perimeterCalls: [], adjacentOwners: [], roads: [], easements: [], subdivisionInfo: {}, lineTable: [], curveTable: [], notes: [] };
    }
  }

  // ── Private: convert synthesis JSON → typed result ─────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertSynthesisToResult(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    synthesis: any,
    reconciliation: ReconciliationResult,
    pageNum: number,
    _totalPages: number,
  ): PlatAnalysisResult {
    const result: PlatAnalysisResult = {
      lots:            [],
      perimeterCalls:  [],
      adjacentOwners:  [],
      roads:           [],
      easements:       [],
      subdivisionInfo: {},
      lineTable:       [],
      curveTable:      [],
      notes:           [],
      totalApiCalls:   0,
      durationMs:      0,
    };

    if (!synthesis || typeof synthesis !== 'object') return result;

    // ── Subdivision info ──────────────────────────────────────────────────
    const si = synthesis.subdivisionInfo ?? {};
    result.subdivisionInfo = {
      name:                 this.safeStr(si.name),
      surveyor:             this.safeStr(si.surveyor),
      rpls:                 this.safeStr(si.rpls),
      surveyDate:           this.safeStr(si.surveyDate),
      platDate:             this.safeStr(si.platDate),
      platInstrument:       this.safeStr(si.platInstrument),
      datum:                this.safeStr(si.datum),
      coordinateZone:       this.safeStr(si.coordinateZone),
      unitSystem:           this.safeStr(si.unitSystem),
      scaleFactor:          typeof si.scaleFactor === 'number' ? si.scaleFactor : undefined,
      totalLots:            typeof si.totalLots === 'number'   ? si.totalLots   : undefined,
      hasReserves:          Boolean(si.hasReserves),
      hasCommonAreas:       Boolean(si.hasCommonAreas),
      restrictiveCovenants: this.safeStr(si.restrictiveCovenants),
      pob:                  si.pob ? {
        northing:    typeof si.pob.northing === 'number' ? si.pob.northing : undefined,
        easting:     typeof si.pob.easting  === 'number' ? si.pob.easting  : undefined,
        description: this.safeStr(si.pob.description),
      } : undefined,
    };

    // Build reconciliation index for fast lookup by sequence
    const recon = this.buildReconIndex(reconciliation);

    // ── Lots ─────────────────────────────────────────────────────────────
    if (Array.isArray(synthesis.lots)) {
      for (const rawLot of synthesis.lots) {
        if (!rawLot || typeof rawLot !== 'object') continue;
        const lotId = this.safeStr(rawLot.lotId) ?? `lot_${result.lots.length + 1}`;
        const lotData = this.convertRawLot(rawLot, lotId, recon);
        result.lots.push(lotData);
      }
    }

    // ── Perimeter calls ───────────────────────────────────────────────────
    if (Array.isArray(synthesis.perimeterCalls)) {
      let perimSeq = 0;
      for (const rawCall of synthesis.perimeterCalls) {
        perimSeq++;
        const call = this.convertRawCall(rawCall, `PERIM_C${perimSeq}`, perimSeq, 'PERIM', recon);
        if (call) result.perimeterCalls.push(call);
      }
    }

    // ── Adjacent owners ───────────────────────────────────────────────────
    if (Array.isArray(synthesis.adjacentOwners)) {
      for (const ao of synthesis.adjacentOwners) {
        if (ao && typeof ao === 'object' && ao.name) {
          result.adjacentOwners.push({
            name:          String(ao.name),
            calledAcreage: typeof ao.calledAcreage === 'number' ? ao.calledAcreage : undefined,
            direction:     this.safeStr(ao.direction) ?? 'unknown',
          });
        }
      }
    }

    // ── Roads ─────────────────────────────────────────────────────────────
    if (Array.isArray(synthesis.roads)) {
      for (const r of synthesis.roads) {
        if (r && r.name) {
          result.roads.push({
            name:     String(r.name),
            type:     String(r.type ?? 'unknown'),
            rowWidth: typeof r.rowWidth === 'number' ? r.rowWidth : undefined,
          });
        }
      }
    }

    // ── Easements ─────────────────────────────────────────────────────────
    if (Array.isArray(synthesis.easements)) {
      for (const e of synthesis.easements) {
        if (e && e.location) {
          result.easements.push({
            type:     String(e.type ?? 'other'),
            width:    typeof e.width === 'number' ? e.width : undefined,
            location: String(e.location),
          });
        }
      }
    }

    // ── Line / curve tables ───────────────────────────────────────────────
    if (Array.isArray(synthesis.lineTable)) {
      for (const lt of synthesis.lineTable) {
        if (lt && lt.id && lt.bearing && typeof lt.distance === 'number') {
          result.lineTable.push({ id: lt.id, bearing: lt.bearing, distance: lt.distance });
        }
      }
    }
    if (Array.isArray(synthesis.curveTable)) {
      for (const ct of synthesis.curveTable) {
        if (ct && ct.id && typeof ct.radius === 'number') {
          result.curveTable.push({
            id:           ct.id,
            radius:       ct.radius,
            arcLength:    typeof ct.arcLength === 'number' ? ct.arcLength : 0,
            delta:        String(ct.delta ?? ''),
            chordBearing: String(ct.chordBearing ?? ''),
            chordDistance: typeof ct.chordDistance === 'number' ? ct.chordDistance : 0,
          });
        }
      }
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    if (Array.isArray(synthesis.notes)) {
      result.notes = synthesis.notes.filter((n: unknown) => typeof n === 'string');
    }

    // Page 2+ typically adds notes, certifications, and table data but
    // usually doesn't have full lot boundary calls. Tag notes from later pages.
    if (pageNum > 1 && result.notes.length > 0) {
      result.notes = result.notes.map(n => `[Page ${pageNum}] ${n}`);
    }

    return result;
  }

  // ── Private: convert raw lot from synthesis ─────────────────────────────

  private convertRawLot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawLot: any,
    lotId: string,
    recon: Map<number, CallReconciliation>,
  ): LotData {
    const boundaryCalls: P3BoundaryCall[] = [];
    const curves: P3BoundaryCall[] = [];

    // Straight-line calls
    if (Array.isArray(rawLot.calls)) {
      let seq = 0;
      for (const rc of rawLot.calls) {
        seq++;
        const call = this.convertRawCall(rc, `${lotId}_C${seq}`, seq, lotId, recon);
        if (call) boundaryCalls.push(call);
      }
    }

    // Curve calls
    if (Array.isArray(rawLot.curves)) {
      let seq = 0;
      for (const rc of rawLot.curves) {
        seq++;
        const call = this.convertRawCurveCall(rc, `${lotId}_CV${seq}`, seq, lotId, recon);
        if (call) curves.push(call);
      }
    }

    // Compute average confidence across all calls
    const allCalls = [...boundaryCalls, ...curves];
    const avgConf = allCalls.length > 0
      ? Math.round(allCalls.reduce((s, c) => s + c.confidence, 0) / allCalls.length)
      : 50;

    return {
      lotId,
      name:     this.safeStr(rawLot.name) ?? lotId,
      lotType:  this.parseLotType(rawLot.lotType),
      acreage:  typeof rawLot.acreage === 'number' ? rawLot.acreage : undefined,
      sqft:     typeof rawLot.sqft    === 'number' ? rawLot.sqft    : undefined,
      boundaryCalls,
      curves,
      buildingSetbacks: rawLot.buildingSetbacks
        ? {
            front: typeof rawLot.buildingSetbacks.front === 'number' ? rawLot.buildingSetbacks.front : undefined,
            side:  typeof rawLot.buildingSetbacks.side  === 'number' ? rawLot.buildingSetbacks.side  : undefined,
            rear:  typeof rawLot.buildingSetbacks.rear  === 'number' ? rawLot.buildingSetbacks.rear  : undefined,
            notes: this.safeStr(rawLot.buildingSetbacks.notes),
          }
        : undefined,
      easements: Array.isArray(rawLot.easements) ? rawLot.easements.filter((e: unknown) => typeof e === 'string') : [],
      notes:     Array.isArray(rawLot.notes)     ? rawLot.notes.filter((n: unknown) => typeof n === 'string') : [],
      confidence: avgConf,
    };
  }

  // ── Private: convert raw straight-line call ────────────────────────────

  private convertRawCall(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: any,
    callId: string,
    seqNum: number,
    lotId: string,
    recon: Map<number, CallReconciliation>,
  ): P3BoundaryCall | null {
    if (!raw || typeof raw !== 'object') return null;

    const bearing  = this.safeStr(raw.bearing) ?? '';
    const distance = typeof raw.distance === 'number' ? raw.distance : parseFloat(raw.distance ?? '0');
    if (!bearing || isNaN(distance)) return null;

    // Unit handling — convert varas if needed
    const rawUnit: 'feet' | 'varas' = raw.unit === 'varas' ? 'varas' : 'feet';
    const distFeet = rawUnit === 'varas' ? distance * VARAS_TO_FEET : distance;

    // Determine status from synthesis or reconciliation index
    const rawStatus = this.safeStr(raw.status) ?? 'text_only';
    const reconEntry = recon.get(seqNum);
    const status = (reconEntry?.status ?? rawStatus) as 'confirmed' | 'conflict' | 'text_only' | 'unresolved';

    // Map to confidence value
    const ocrConf = typeof raw.confidence === 'number' ? Math.round(raw.confidence * 100) : 70;
    const confSymbol = toConfidenceSymbol(
      ocrConf,
      status,
      reconEntry?.bearingAgreement ?? null,
    );

    // Build readings array
    const readings: Reading[] = [{
      value:       `${bearing}, ${distFeet.toFixed(2)}'`,
      source:      'plat_text' as ExtractionSource,
      confidence:  ocrConf,
      isGeometric: false,
    }];

    if (reconEntry?.visualBearing) {
      readings.push({
        value:       `${reconEntry.visualBearing}, ${(reconEntry.visualDistance_ft ?? 0).toFixed(2)}'`,
        source:      'plat_geometry' as ExtractionSource,
        confidence:  65,
        isGeometric: true,
      });
    }

    return {
      callId,
      sequenceNumber: seqNum,
      bearing,
      bearingDecimal: typeof raw.bearingDecimal === 'number' ? raw.bearingDecimal : undefined,
      distance:       distFeet,
      unit:           'feet' as const,
      type:           'straight' as const,
      along:          this.safeStr(raw.along),
      fromMonument:   this.safeStr(raw.fromMonument),
      toMonument:     this.safeStr(raw.toMonument),
      confidence:     ocrConf,
      confidenceSymbol: confSymbol,
      sources:        ['plat_text'],
      allReadings:    readings,
      bestReading:    `${bearing}, ${distFeet.toFixed(2)}'`,
      notes:          this.safeStr(raw.notes),
    };
  }

  // ── Private: convert raw curve call ───────────────────────────────────

  private convertRawCurveCall(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: any,
    callId: string,
    seqNum: number,
    _lotId: string,
    recon: Map<number, CallReconciliation>,
  ): P3BoundaryCall | null {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.radius !== 'number') return null;

    const radius       = raw.radius as number;
    const arcLength    = typeof raw.arcLength    === 'number' ? raw.arcLength    : undefined;
    const delta        = this.safeStr(raw.delta);
    const chordBearing = this.safeStr(raw.chordBearing);
    const chordDist    = typeof raw.chordDistance === 'number' ? raw.chordDistance : undefined;
    const direction    = (raw.direction === 'right' ? 'right' : 'left') as 'left' | 'right';

    // Use curve-params.ts to fill in any missing parameters
    const known: import('../lib/curve-params.js').KnownCurveParams = {
      radius_ft:    radius,
      arcLength_ft: arcLength,
      direction,
    };

    // Parse delta string to decimal degrees if possible
    if (delta) {
      const dm = delta.match(/(\d+)[°\s]+(\d+)['\s]+[\d.]+/);
      if (dm) {
        known.delta_deg = parseInt(dm[1], 10) + parseInt(dm[2], 10) / 60;
      } else {
        const simpleMatch = delta.match(/([\d.]+)/);
        if (simpleMatch) known.delta_deg = parseFloat(simpleMatch[1]);
      }
    }
    if (chordDist) known.chord_ft = chordDist;

    const completed = completeCurveParams(known, chordBearing ?? null);

    // Build the curve data object
    const curveData: P3BoundaryCall['curve'] = {
      radius,
      arcLength:     completed.params.arcLength_ft ?? arcLength,
      chordBearing:  completed.params.chordBearing ?? chordBearing ?? undefined,
      chordDistance: completed.params.chord_ft ?? chordDist,
      delta:         delta ?? undefined,
      direction,
    };

    // If we computed any missing parameters, record it
    if (completed.computed.length > 0) {
      const firstComputed = completed.computed[0];
      const computedVal   = completed.params[firstComputed];
      if (computedVal !== null) {
        curveData.computed = {
          missingParam:   firstComputed,
          computedValue:  computedVal as number,
          formula:        `${firstComputed} computed from known params`,
        };
      }
    }

    // Arc length as the "distance" for the call (for closure math purposes)
    const arcDist = curveData.arcLength ?? 0;

    const rawStatus  = this.safeStr(raw.status) ?? 'text_only';
    const reconEntry = recon.get(seqNum);
    const status     = (reconEntry?.status ?? rawStatus) as 'confirmed' | 'conflict' | 'text_only' | 'unresolved';
    const ocrConf    = 70;
    const confSymbol = toConfidenceSymbol(ocrConf, status, reconEntry?.bearingAgreement ?? null);

    const readings: Reading[] = [{
      value:       `Curve R=${radius}', L=${(arcDist).toFixed(2)}'`,
      source:      'plat_text' as ExtractionSource,
      confidence:  ocrConf,
      isGeometric: false,
    }];

    return {
      callId,
      sequenceNumber: seqNum,
      bearing:         chordBearing ?? '',
      bearingDecimal:  undefined,
      distance:        arcDist,
      unit:            'feet' as const,
      type:            'curve' as const,
      along:           this.safeStr(raw.along),
      curve:           curveData,
      confidence:      ocrConf,
      confidenceSymbol: confSymbol,
      sources:         ['plat_text'],
      allReadings:     readings,
      bestReading:     `Curve R=${radius}', L=${arcDist.toFixed(2)}', ${direction}`,
      notes:           completed.warnings.length > 0 ? completed.warnings.join('; ') : undefined,
    };
  }

  // ── Private: merge multi-page results ─────────────────────────────────

  private mergePageResults(results: PlatAnalysisResult[]): PlatAnalysisResult {
    if (results.length === 0) return this.emptyResult(0);
    if (results.length === 1) return results[0];

    // Page 1 is the primary drawing — its lot/boundary data takes priority.
    // Later pages add notes, table data, certifications, and supplemental info.
    const primary = { ...results[0] };

    for (let i = 1; i < results.length; i++) {
      const page = results[i];

      // Supplement subdivision info with any non-null fields from later pages
      primary.subdivisionInfo = this.mergeSubdivisionInfo(primary.subdivisionInfo, page.subdivisionInfo);

      // Add lots only if page 1 didn't find them (avoids duplicates)
      for (const lot of page.lots) {
        if (!primary.lots.find(l => l.lotId === lot.lotId)) {
          primary.lots.push(lot);
        }
      }

      // Supplement perimeter calls
      if (primary.perimeterCalls.length === 0 && page.perimeterCalls.length > 0) {
        primary.perimeterCalls = page.perimeterCalls;
      }

      // Merge unique adjacent owners
      for (const ao of page.adjacentOwners) {
        if (!primary.adjacentOwners.find(a => a.name.toLowerCase() === ao.name.toLowerCase())) {
          primary.adjacentOwners.push(ao);
        }
      }

      // Merge unique roads
      for (const r of page.roads) {
        if (!primary.roads.find(pr => pr.name.toLowerCase() === r.name.toLowerCase())) {
          primary.roads.push(r);
        }
      }

      // Supplement line/curve tables from later pages (often on page 2)
      if (primary.lineTable.length === 0) primary.lineTable = page.lineTable;
      if (primary.curveTable.length === 0) primary.curveTable = page.curveTable;

      // Accumulate notes and easements
      primary.notes.push(...page.notes);
      primary.easements.push(...page.easements);
      primary.totalApiCalls += page.totalApiCalls;
    }

    return primary;
  }

  private mergeSubdivisionInfo(a: PlatSubdivisionInfo, b: PlatSubdivisionInfo): PlatSubdivisionInfo {
    // For each field, keep the non-null/undefined value (prefer a over b)
    return {
      name:                 a.name  ?? b.name,
      surveyor:             a.surveyor ?? b.surveyor,
      rpls:                 a.rpls ?? b.rpls,
      surveyDate:           a.surveyDate ?? b.surveyDate,
      platDate:             a.platDate ?? b.platDate,
      platInstrument:       a.platInstrument ?? b.platInstrument,
      datum:                a.datum ?? b.datum,
      coordinateZone:       a.coordinateZone ?? b.coordinateZone,
      unitSystem:           a.unitSystem ?? b.unitSystem,
      scaleFactor:          a.scaleFactor ?? b.scaleFactor,
      totalLots:            a.totalLots ?? b.totalLots,
      hasReserves:          a.hasReserves ?? b.hasReserves,
      hasCommonAreas:       a.hasCommonAreas ?? b.hasCommonAreas,
      restrictiveCovenants: a.restrictiveCovenants ?? b.restrictiveCovenants,
      pob:                  a.pob ?? b.pob,
    };
  }

  // ── Private: utility helpers ───────────────────────────────────────────

  private emptyResult(durationMs: number): PlatAnalysisResult {
    return {
      lots:           [],
      perimeterCalls: [],
      adjacentOwners: [],
      roads:          [],
      easements:      [],
      subdivisionInfo: {},
      lineTable:      [],
      curveTable:     [],
      notes:          [],
      totalApiCalls:  0,
      durationMs,
    };
  }

  private buildReconIndex(recon: ReconciliationResult): Map<number, CallReconciliation> {
    const m = new Map<number, CallReconciliation>();
    for (const cr of recon.callReconciliations) {
      m.set(cr.sequence, cr);
    }
    return m;
  }

  private buildReconciliationSummary(recon: ReconciliationResult): string {
    const lines: string[] = [
      `Agreement: ${recon.agreementCount} calls | Conflicts: ${recon.conflictCount} | Text-only: ${recon.textOnlyCount}`,
      `Overall agreement: ${recon.overallAgreementPct.toFixed(1)}%`,
    ];
    if (recon.bearingConflicts.length > 0) {
      lines.push('Bearing conflicts:');
      for (const c of recon.bearingConflicts.slice(0, 5)) {
        lines.push(`  Seq ${c.sequence}: ${c.description} — candidates: ${c.candidates.join(', ')}`);
      }
    }
    if (recon.recommendations.length > 0) {
      lines.push('Recommendations:');
      for (const r of recon.recommendations.slice(0, 5)) {
        lines.push(`  Seq ${r.sequence}: ${r.recommendedValue} — ${r.reasoning}`);
      }
    }
    return lines.join('\n');
  }

  private parseLotType(raw: unknown): LotData['lotType'] {
    const valid: LotData['lotType'][] = ['residential', 'commercial', 'reserve', 'common_area', 'open_space', 'drainage'];
    if (typeof raw === 'string' && valid.includes(raw as LotData['lotType'])) {
      return raw as LotData['lotType'];
    }
    return 'unknown';
  }

  private safeStr(val: unknown): string | undefined {
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return undefined;
  }

  /**
   * Parse a quadrant bearing string to decimal degrees within the quadrant (0–90).
   * e.g. "N 85°22'02\" E" → 85.3672
   */
  private parseBearingToDec(bearing: string): number | null {
    // Match: [NS] [deg]°[min]'[sec]" [EW]
    const m = bearing.match(/([NS])\s*(\d+)[°\-]\s*(\d+)['′\-]\s*([\d.]+)["""″]?\s*([EW])/i);
    if (!m) return null;
    const deg = parseInt(m[2], 10);
    const min = parseInt(m[3], 10);
    const sec = parseFloat(m[4]);
    return deg + min / 60 + sec / 3600;
  }

  private extractQuadrant(bearing: string): string {
    const upper = bearing.toUpperCase();
    if (upper.startsWith('N') && upper.endsWith('E')) return 'NE';
    if (upper.startsWith('N') && upper.endsWith('W')) return 'NW';
    if (upper.startsWith('S') && upper.endsWith('E')) return 'SE';
    if (upper.startsWith('S') && upper.endsWith('W')) return 'SW';
    return 'NE';
  }

  private detectDatum(text: string): 'NAD83' | 'NAD27' | 'unknown' {
    if (/NAD.?83/i.test(text)) return 'NAD83';
    if (/NAD.?27/i.test(text)) return 'NAD27';
    return 'unknown';
  }
}
