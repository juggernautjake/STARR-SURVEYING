// lib/cad/delivery/completeness-checker.ts
//
// Phase 7 §6 — drawing-completeness checker.
//
// Synchronous, pure function that walks the active document +
// annotations + AI review queue and returns a structured
// checklist the UI renders. The checklist drives the "Mark
// Ready for RPLS Review" gate (Phase 7 §7).
//
// Each check returns:
//   * `passed`  — boolean. ERROR + WARNING checks contribute
//     to the "ready" signal; INFO checks are advisory only.
//   * `details` — short human-readable explanation when
//     `passed` is false (or null when nothing to add).
//
// Out of scope this slice:
//   * Bearing-distance label coverage detection — needs the
//     §5 label-coverage scan that walks each boundary segment
//     and looks up its dim annotation; lands in a follow-up.
//   * Legal-description check — depends on the §5 description
//     generator type (`SurveyDescription`); stub returns INFO
//     until that ships.
//   * Auto-fix shortcuts — UI surfaces a "Fix" button per row
//     in a follow-up slice once the checker is consumed by
//     a panel.

import type {
  DrawingDocument,
  Feature,
  FeatureType,
} from '../types';
import type { AnnotationBase } from '../labels/annotation-types';
import type { AIReviewQueue } from '../ai-engine/types';

export type CompletenessSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface CompletenessCheck {
  id:       string;
  label:    string;
  severity: CompletenessSeverity;
  passed:   boolean;
  /** Short explanation surfaced when `passed` is false. */
  details:  string | null;
  /** Optional UI hint; the panel maps these to a "Fix" CTA
   *  that opens the right dialog. Unknown / null = no hint. */
  fixHint?: 'TITLE_BLOCK' | 'REVIEW_QUEUE' | 'LAYERS' | null;
}

export interface CompletenessInputs {
  doc:         DrawingDocument;
  annotations: Record<string, AnnotationBase>;
  queue:       AIReviewQueue | null;
  /** Stub — populated once the §5 description generator lands.
   *  When undefined, the legal-desc check downgrades to INFO. */
  hasLegalDescription?: boolean;
}

export interface CompletenessSummary {
  errors:   number;
  warnings: number;
  infos:    number;
  /** True when zero ERROR-severity checks failed. The "Mark
   *  Ready for RPLS Review" button should gate on this flag. */
  ready:    boolean;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function checkDrawingCompleteness(
  inputs: CompletenessInputs
): CompletenessCheck[] {
  const { doc, annotations, queue, hasLegalDescription } = inputs;
  const featureList = Object.values(doc.features);
  const annotationList = Object.values(annotations);
  const tb = doc.settings.titleBlock;

  return [
    // ── Boundary geometry ───────────────────────────────────
    {
      id: 'boundary_closed',
      label: 'Boundary polygon closed',
      severity: 'ERROR',
      ...checkBoundaryClosed(featureList),
    },
    {
      id: 'boundary_annotated',
      label: 'All boundary lines have bearing/distance labels',
      severity: 'WARNING',
      ...checkBoundaryAnnotated(featureList, annotationList),
    },
    {
      id: 'monuments_labeled',
      label: 'All boundary monuments labeled',
      severity: 'WARNING',
      ...checkMonumentsLabeled(featureList, annotationList),
    },

    // ── Annotations / paper ────────────────────────────────
    {
      id: 'area_label',
      label: 'Area label present',
      severity: 'WARNING',
      ...checkAnnotationKind(annotationList, 'AREA_LABEL'),
    },
    {
      id: 'north_arrow',
      label: 'North arrow placed',
      severity: 'ERROR',
      fixHint: 'TITLE_BLOCK',
      ...checkNorthArrow(tb),
    },
    {
      id: 'scale_bar',
      label: 'Scale bar placed',
      severity: 'WARNING',
      fixHint: 'TITLE_BLOCK',
      ...checkScaleBar(tb),
    },
    {
      id: 'title_block',
      label: 'Title block fully filled',
      severity: 'ERROR',
      fixHint: 'TITLE_BLOCK',
      ...checkTitleBlock(tb),
    },
    {
      id: 'basis_of_bearings',
      label: 'Basis of bearings note present',
      severity: 'WARNING',
      fixHint: 'TITLE_BLOCK',
      ...checkBasisOfBearingsNote(tb),
    },
    {
      id: 'flood_zone_note',
      label: 'Flood zone note present',
      severity: 'INFO',
      fixHint: 'TITLE_BLOCK',
      ...checkFloodNote(tb),
    },
    {
      id: 'certification',
      label: 'Certification block present',
      severity: 'ERROR',
      fixHint: 'TITLE_BLOCK',
      ...checkCertification(tb),
    },

    // ── Description ────────────────────────────────────────
    {
      id: 'legal_desc',
      label: 'Legal description generated',
      severity: hasLegalDescription === undefined ? 'INFO' : 'ERROR',
      ...checkLegalDescription(hasLegalDescription),
    },
    {
      id: 'title_block_county',
      label: 'County field filled',
      severity: 'WARNING',
      fixHint: 'TITLE_BLOCK',
      ...checkTitleField(tb.notes, /\bCounty\b/i, 'county'),
    },
    {
      id: 'title_block_acreage',
      label: 'Acreage field filled',
      severity: 'WARNING',
      fixHint: 'TITLE_BLOCK',
      ...checkTitleField(tb.notes, /\b(acres|acreage)\b/i, 'acreage'),
    },

    // ── AI review queue ────────────────────────────────────
    {
      id: 'no_blocking_pending',
      label: 'No blocking review items pending',
      severity: 'ERROR',
      fixHint: 'REVIEW_QUEUE',
      ...checkNoPendingBlocking(queue),
    },
    {
      id: 'tier1_resolved',
      label: 'Tier-1 (unplaced) items resolved',
      severity: 'WARNING',
      fixHint: 'REVIEW_QUEUE',
      ...checkTier1Resolved(queue),
    },

    // ── Layers ─────────────────────────────────────────────
    {
      id: 'no_features_layer0',
      label: 'No features on Layer 0',
      severity: 'WARNING',
      fixHint: 'LAYERS',
      ...checkNoLayer0Features(featureList),
    },
  ];
}

export function summarizeCompleteness(
  checks: CompletenessCheck[]
): CompletenessSummary {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const c of checks) {
    if (c.passed) continue;
    if (c.severity === 'ERROR') errors += 1;
    else if (c.severity === 'WARNING') warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos, ready: errors === 0 };
}

// ────────────────────────────────────────────────────────────
// Individual check helpers — each returns the partial shape
// {passed, details} so the caller stitches in id+label+severity.
// ────────────────────────────────────────────────────────────

type CheckResult = { passed: boolean; details: string | null };

function checkBoundaryClosed(features: Feature[]): CheckResult {
  const polygons = features.filter((f) => f.type === 'POLYGON');
  if (polygons.length === 0) {
    return {
      passed: false,
      details: 'No closed boundary polygon found in the drawing.',
    };
  }
  return { passed: true, details: null };
}

function checkBoundaryAnnotated(
  features: Feature[],
  annotations: AnnotationBase[]
): CheckResult {
  // Crude proxy: at least one BEARING_DISTANCE annotation per
  // closed boundary polygon. The §5 per-segment scan lands in
  // a follow-up slice.
  const polygons = features.filter((f) => f.type === 'POLYGON');
  if (polygons.length === 0) {
    return { passed: true, details: null };
  }
  const dimCount = annotations.filter(
    (a) => a.type === 'BEARING_DISTANCE'
  ).length;
  if (dimCount === 0) {
    return {
      passed: false,
      details:
        'No bearing/distance annotations exist; expected at least one ' +
        'per boundary leg.',
    };
  }
  return { passed: true, details: null };
}

function checkMonumentsLabeled(
  features: Feature[],
  annotations: AnnotationBase[]
): CheckResult {
  const monumentCount = features.filter((f) =>
    isLikelyMonumentFeature(f)
  ).length;
  if (monumentCount === 0) {
    return { passed: true, details: null };
  }
  const labelCount = annotations.filter(
    (a) => a.type === 'MONUMENT_LABEL'
  ).length;
  if (labelCount < monumentCount) {
    return {
      passed: false,
      details:
        `${monumentCount} monument feature${monumentCount === 1 ? '' : 's'} ` +
        `present but only ${labelCount} monument label${labelCount === 1 ? '' : 's'} found.`,
    };
  }
  return { passed: true, details: null };
}

function checkAnnotationKind(
  annotations: AnnotationBase[],
  kind: AnnotationBase['type']
): CheckResult {
  const found = annotations.some((a) => a.type === kind);
  if (!found) {
    return {
      passed: false,
      details: `No ${kind.toLowerCase().replace(/_/g, ' ')} annotation found.`,
    };
  }
  return { passed: true, details: null };
}

function checkNorthArrow(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (!tb.visible) {
    return {
      passed: false,
      details: 'Title block is hidden; the north arrow lives inside it.',
    };
  }
  if (!Number.isFinite(tb.northArrowSizeIn) || tb.northArrowSizeIn <= 0) {
    return {
      passed: false,
      details: 'North-arrow size is zero — the symbol will not render.',
    };
  }
  return { passed: true, details: null };
}

function checkScaleBar(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (tb.scaleBarVisible === false) {
    return {
      passed: false,
      details: 'Scale bar is hidden in title-block settings.',
    };
  }
  if (
    tb.scaleBarLengthIn !== undefined &&
    !(tb.scaleBarLengthIn > 0)
  ) {
    return {
      passed: false,
      details: 'Scale-bar length is zero — bar will not render.',
    };
  }
  return { passed: true, details: null };
}

const REQUIRED_TITLE_FIELDS: ReadonlyArray<{
  key: keyof DrawingDocument['settings']['titleBlock'];
  label: string;
}> = [
  { key: 'firmName', label: 'Firm name' },
  { key: 'surveyorName', label: 'Surveyor name' },
  { key: 'projectName', label: 'Project name' },
  { key: 'projectNumber', label: 'Project / job number' },
  { key: 'clientName', label: 'Client name' },
  { key: 'surveyDate', label: 'Survey date' },
];

function checkTitleBlock(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (!tb.visible) {
    return { passed: false, details: 'Title block is hidden.' };
  }
  const missing: string[] = [];
  for (const { key, label } of REQUIRED_TITLE_FIELDS) {
    const value = tb[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      missing.push(label);
    }
  }
  if (missing.length > 0) {
    return {
      passed: false,
      details: `Missing: ${missing.join(', ')}.`,
    };
  }
  return { passed: true, details: null };
}

function checkBasisOfBearingsNote(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (/basis\s+of\s+bearings?/i.test(tb.notes ?? '')) {
    return { passed: true, details: null };
  }
  return {
    passed: false,
    details: '"Basis of bearings" note not detected in the title-block notes.',
  };
}

function checkFloodNote(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (/flood/i.test(tb.notes ?? '')) {
    return { passed: true, details: null };
  }
  return {
    passed: false,
    details: 'No flood-zone reference found in the title-block notes.',
  };
}

function checkCertification(
  tb: DrawingDocument['settings']['titleBlock']
): CheckResult {
  if (
    !tb.surveyorLicense ||
    tb.surveyorLicense.trim().length === 0
  ) {
    return {
      passed: false,
      details: 'Surveyor license number missing — certification cannot be sealed.',
    };
  }
  if (!tb.surveyorName || tb.surveyorName.trim().length === 0) {
    return {
      passed: false,
      details: 'Surveyor name missing on the certification block.',
    };
  }
  return { passed: true, details: null };
}

function checkLegalDescription(
  hasLegalDescription: boolean | undefined
): CheckResult {
  if (hasLegalDescription === true) {
    return { passed: true, details: null };
  }
  if (hasLegalDescription === false) {
    return {
      passed: false,
      details: 'No legal description has been generated yet.',
    };
  }
  return {
    passed: false,
    details:
      'Legal-description generator (Phase 7 §5) has not landed yet — ' +
      'check is advisory until the generator ships.',
  };
}

function checkTitleField(
  notes: string,
  keywordPattern: RegExp,
  human: string
): CheckResult {
  if (keywordPattern.test(notes ?? '')) {
    return { passed: true, details: null };
  }
  return {
    passed: false,
    details: `Title-block notes don't mention ${human}.`,
  };
}

function checkNoPendingBlocking(
  queue: AIReviewQueue | null
): CheckResult {
  if (!queue) return { passed: true, details: null };
  const blocking = queue.tiers[1].concat(queue.tiers[2]);
  const stillPending = blocking.filter(
    (it) => it.status === 'PENDING'
  ).length;
  if (stillPending > 0) {
    return {
      passed: false,
      details: `${stillPending} tier-1/2 review item${stillPending === 1 ? '' : 's'} still PENDING.`,
    };
  }
  return { passed: true, details: null };
}

function checkTier1Resolved(queue: AIReviewQueue | null): CheckResult {
  if (!queue) return { passed: true, details: null };
  const tier1 = queue.tiers[1];
  if (tier1.length === 0) return { passed: true, details: null };
  const unresolved = tier1.filter(
    (it) => it.status === 'PENDING' || it.status === 'MODIFIED'
  ).length;
  if (unresolved > 0) {
    return {
      passed: false,
      details: `${unresolved} tier-1 item${unresolved === 1 ? '' : 's'} unresolved.`,
    };
  }
  return { passed: true, details: null };
}

function checkNoLayer0Features(features: Feature[]): CheckResult {
  const offenders = features.filter((f) =>
    f.layerId === '0' || f.layerId === 'Layer 0' || f.layerId === 'layer-0'
  );
  if (offenders.length > 0) {
    return {
      passed: false,
      details:
        `${offenders.length} feature${offenders.length === 1 ? '' : 's'} live on Layer 0; ` +
        'reassign to a named layer.',
    };
  }
  return { passed: true, details: null };
}

// ────────────────────────────────────────────────────────────
// Heuristics
// ────────────────────────────────────────────────────────────

const MONUMENT_TYPE_HINTS: ReadonlyArray<FeatureType> = ['POINT'];

function isLikelyMonumentFeature(f: Feature): boolean {
  if (!MONUMENT_TYPE_HINTS.includes(f.type)) return false;
  const code = String(f.properties?.rawCode ?? '').toUpperCase();
  // BC = boundary control, MN = monument, IR = iron rod, IP = iron pipe.
  return /^BC\b|^MN\b|^IR\b|^IP\b/.test(code);
}
