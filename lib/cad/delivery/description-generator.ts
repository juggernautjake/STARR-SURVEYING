// lib/cad/delivery/description-generator.ts
//
// Phase 7 §5 — survey-description generator (deterministic
// core).
//
// Pulls the boundary polygon out of `DrawingDocument`, builds
// a synthetic `Traverse` for it, and runs the existing
// `generateLegalDescription` helper to land the metes-and-
// bounds text. Wraps the result in a `SurveyDescription`
// record carrying:
//   * legal description
//   * standard survey notes (basis of bearings, datum, flood
//     zone, disclaimer) sourced from title-block + sealData
//   * a populated certification block
//   * title-block fields auto-filled from the active document
//   * a revision-history entry stamped at generation time
//
// Pure: no I/O, no Claude. The Claude-augmented narrative
// pass + survey-description dialog UI land in a follow-up
// slice.
//
// When no closed boundary polygon exists (e.g. the surveyor
// hasn't AI-drawn the boundary yet), `generateSurveyDescription`
// returns `null`. Callers should surface a "boundary required"
// hint instead of trying to ship an empty description.

import { computeAreaFromPoints2D } from '../geometry/area';
import {
  DEFAULT_LEGAL_DESC_CONFIG,
  generateLegalDescription,
  type LegalDescConfig,
} from '../geometry/legal-desc';
import { createTraverse } from '../geometry/traverse';
import {
  generateId,
  type DrawingDocument,
  type Feature,
  type Point2D,
  type SurveyPoint,
  type Traverse,
} from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type SurveyNoteCategory =
  | 'BASIS_OF_BEARINGS'
  | 'DATUM'
  | 'FLOOD'
  | 'DISCLAIMER'
  | 'GENERAL';

export interface SurveyNote {
  id:       string;
  category: SurveyNoteCategory;
  text:     string;
}

export interface DescriptionRevision {
  at:      string;
  by:      'AI' | 'USER';
  summary: string;
}

export interface SurveyDescription {
  jobId:           string;
  generatedAt:     string;
  generatedByAI:   boolean;

  legalDescription:  string;
  surveyNotes:       SurveyNote[];
  fieldNarrative:    string | null;
  certificationText: string;

  // Title-block roll-up
  projectName:    string;
  projectNumber:  string | null;
  clientName:     string | null;
  county:         string;
  state:          string;
  surveyDate:     string;
  fileDate:       string;
  abstract:       string | null;
  survey:         string | null;
  township:       string | null;
  range:          string | null;
  section:        string | null;
  acreage:        number;
  floodZone:      string | null;
  floodPanel:     string | null;
  floodPanelDate: string | null;
  basisOfBearings: string;

  revisions: DescriptionRevision[];
}

export interface GenerateDescriptionOptions {
  /** Override the legal-description formatter config. */
  legalDescConfig?: Partial<LegalDescConfig>;
  /** Optional field-conditions narrative (skipped when null). */
  fieldNarrative?: string | null;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Generate a `SurveyDescription` from the active document.
 * Returns null when no closed boundary polygon is present.
 */
export function generateSurveyDescription(
  doc: DrawingDocument,
  options: GenerateDescriptionOptions = {}
): SurveyDescription | null {
  const boundary = pickBoundaryPolygon(doc);
  if (!boundary) return null;
  const vertices = boundary.geometry.vertices ?? [];
  if (vertices.length < 3) return null;

  const traverse = buildTraverseFromVertices(vertices);
  if (traverse.legs.length < 3) return null;

  const tb = doc.settings.titleBlock;
  const basisOfBearings = pickBasisOfBearings(tb.notes ?? '');
  const flood = pickFloodNote(tb.notes ?? '');

  const config: LegalDescConfig = {
    ...DEFAULT_LEGAL_DESC_CONFIG,
    basisOfBearings,
    ...(options.legalDescConfig ?? {}),
  };

  const legalDescription = generateLegalDescription(
    traverse,
    new Map(),
    config
  );
  const area = traverse.area
    ? traverse.area
    : computeAreaFromPoints2D(vertices);

  const surveyNotes: SurveyNote[] = buildStandardNotes({
    basisOfBearings,
    floodZone: flood?.zone ?? null,
    floodPanel: flood?.panel ?? null,
  });

  const certificationText = buildCertificationText(tb, doc);
  const generatedAt = new Date().toISOString();

  return {
    jobId: doc.id,
    generatedAt,
    generatedByAI: false,
    legalDescription,
    surveyNotes,
    fieldNarrative: options.fieldNarrative ?? null,
    certificationText,
    projectName: tb.projectName || doc.name,
    projectNumber: tb.projectNumber || null,
    clientName: tb.clientName || null,
    county: pickCounty(tb.notes ?? '') ?? 'Unknown',
    state: 'Texas',
    surveyDate: tb.surveyDate || todayUSDate(),
    fileDate: todayUSDate(),
    abstract: pickKeyValue(tb.notes ?? '', /abstract\s*(?:no\.?)?\s*[:\-]?\s*([A-Za-z]?-?\d+[\w-]*)/i),
    survey: pickKeyValue(tb.notes ?? '', /survey\s*[:\-]\s*([^\n.;]+?)(?:[\n.;]|$)/i),
    township: pickKeyValue(tb.notes ?? '', /township\s*[:\-]\s*([\w\d-]+)/i),
    range: pickKeyValue(tb.notes ?? '', /range\s*[:\-]\s*([\w\d-]+)/i),
    section: pickKeyValue(tb.notes ?? '', /section\s*[:\-]\s*([\w\d-]+)/i),
    acreage: roundTo(area.acres, 4),
    floodZone: flood?.zone ?? null,
    floodPanel: flood?.panel ?? null,
    floodPanelDate: flood?.panelDate ?? null,
    basisOfBearings,
    revisions: [
      {
        at: generatedAt,
        by: 'AI',
        summary:
          `Auto-generated from boundary polygon (${traverse.legs.length} legs, ` +
          `${roundTo(area.acres, 4).toFixed(4)} acres).`,
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────
// Boundary discovery
// ────────────────────────────────────────────────────────────

/**
 * Pick the boundary polygon from the document. Heuristic:
 *   1. If a polygon's layer matches /boundary/i, prefer it.
 *   2. Otherwise pick the largest closed polygon by area.
 * Returns null when no closed polygon exists.
 */
function pickBoundaryPolygon(doc: DrawingDocument): Feature | null {
  const polygons = Object.values(doc.features).filter(
    (f) => !f.hidden && f.type === 'POLYGON' && (f.geometry.vertices?.length ?? 0) >= 3
  );
  if (polygons.length === 0) return null;

  const named = polygons.find((f) => {
    const layerName = doc.layers[f.layerId]?.name ?? '';
    return /boundary|property/i.test(layerName);
  });
  if (named) return named;

  let best = polygons[0];
  let bestArea = 0;
  for (const f of polygons) {
    const a = computeAreaFromPoints2D(f.geometry.vertices ?? []).squareFeet;
    if (a > bestArea) {
      best = f;
      bestArea = a;
    }
  }
  return best;
}

function buildTraverseFromVertices(vertices: Point2D[]): Traverse {
  const points = new Map<string, SurveyPoint>();
  const ids: string[] = [];
  for (const v of vertices) {
    const id = generateId();
    ids.push(id);
    points.set(id, syntheticSurveyPoint(id, v));
  }
  return createTraverse(ids, points, true, 'Boundary');
}

function syntheticSurveyPoint(id: string, p: Point2D): SurveyPoint {
  // Deliberately partial — the legal-description generator only
  // touches northing / easting / codeDefinition. The cast keeps
  // the synthetic point compatible with the SurveyPoint shape
  // without dragging in import-flow plumbing the deterministic
  // generator doesn't need.
  return {
    id,
    pointNumber: 0,
    pointName: '',
    parsedName: { baseNumber: 0 } as SurveyPoint['parsedName'],
    northing: p.y,
    easting: p.x,
    elevation: null,
    rawCode: '',
    parsedCode: {} as SurveyPoint['parsedCode'],
    resolvedAlphaCode: '',
    resolvedNumericCode: '',
    codeSuffix: null,
    codeDefinition: null,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: '',
    layerId: '',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
  };
}

// ────────────────────────────────────────────────────────────
// Standard notes / certification text
// ────────────────────────────────────────────────────────────

function buildStandardNotes(args: {
  basisOfBearings: string;
  floodZone:       string | null;
  floodPanel:      string | null;
}): SurveyNote[] {
  const out: SurveyNote[] = [];
  out.push({
    id: generateId(),
    category: 'BASIS_OF_BEARINGS',
    text: args.basisOfBearings
      ? `Basis of bearings: ${args.basisOfBearings}.`
      : 'Basis of bearings: GPS observations relative to NAD83 (2011) Texas State Plane Central Zone.',
  });
  out.push({
    id: generateId(),
    category: 'DATUM',
    text:
      'All distances are horizontal ground distances expressed in U.S. Survey Feet.',
  });
  if (args.floodZone) {
    const panelClause = args.floodPanel
      ? ` per FEMA Flood Insurance Rate Map Panel ${args.floodPanel}`
      : '';
    out.push({
      id: generateId(),
      category: 'FLOOD',
      text: `Subject tract lies within FEMA Flood Zone ${args.floodZone}${panelClause}.`,
    });
  } else {
    out.push({
      id: generateId(),
      category: 'FLOOD',
      text:
        'Flood-zone determination not provided; consult current FEMA Flood Insurance Rate Map ' +
        'before relying on this drawing for flood-related decisions.',
    });
  }
  out.push({
    id: generateId(),
    category: 'DISCLAIMER',
    text:
      'This survey was prepared without the benefit of a current title commitment; ' +
      'easements or encumbrances of record may exist that are not depicted hereon.',
  });
  return out;
}

function buildCertificationText(
  tb: DrawingDocument['settings']['titleBlock'],
  doc: DrawingDocument
): string {
  const surveyor = tb.surveyorName?.trim() || doc.author?.trim() || 'Surveyor';
  const license = tb.surveyorLicense?.trim() || '____';
  const firm = tb.firmName?.trim();
  const date = tb.surveyDate?.trim() || todayUSDate();
  const firmClause = firm ? ` of ${firm}` : '';
  return (
    `I, ${surveyor}, Registered Professional Land Surveyor No. ${license}` +
    `${firmClause}, do hereby certify that this survey was made on the ground ` +
    `under my supervision on ${date}, and that the boundaries, dimensions, and ` +
    'monuments shown hereon are true and correct to the best of my professional ' +
    'knowledge and belief.'
  );
}

// ────────────────────────────────────────────────────────────
// Title-block sniffers
// ────────────────────────────────────────────────────────────

function pickBasisOfBearings(notes: string): string {
  const m = notes.match(
    /basis\s+of\s+bearings?\s*[:\-]?\s*([^\n.]+)\.?/i
  );
  return m ? m[1].trim() : '';
}

function pickFloodNote(notes: string):
  | { zone: string; panel: string | null; panelDate: string | null }
  | null {
  const zoneMatch = notes.match(/flood(?:\s+zone)?\s*[:\-]?\s*([A-Z]{1,3}|X)/i);
  if (!zoneMatch) return null;
  const panelMatch = notes.match(/panel\s*(?:no\.?)?\s*[:\-]?\s*([0-9A-Z]+)/i);
  const dateMatch = notes.match(
    /(?:panel\s+)?(?:effective|dated)?\s*([01]?\d\/[0-3]?\d\/(?:\d{4}|\d{2}))/i
  );
  return {
    zone: zoneMatch[1].toUpperCase(),
    panel: panelMatch ? panelMatch[1] : null,
    panelDate: dateMatch ? dateMatch[1] : null,
  };
}

function pickCounty(notes: string): string | null {
  const m = notes.match(/county\s*[:\-]?\s*([A-Za-z]+)/i);
  return m ? m[1] : null;
}

function pickKeyValue(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m ? m[1].trim() : null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function todayUSDate(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
