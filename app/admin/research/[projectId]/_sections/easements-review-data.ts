// app/admin/research/[projectId]/_sections/easements-review-data.ts — B1a, the last Review-tab cast.
//
// The Review → Easements tab reads **twenty-seven keys** out of `analysis_metadata.result`, across
// four nested structures — FEMA, TxDOT, the clerk's recorded easements, and two lists the plat
// analyser hangs off `boundary`. All of them declared by hand here and built by hand in the worker.
// Held together by `review-reads-what-the-worker-writes.test.ts`, like every other worker-fed panel.
//
// ── AND THE TAB SAID "NO DATA" WHILE SHOWING DATA ───────────────────────────────────────────────
//
// `hasData = fema || txdot || easements.length > 0 || covenants.length > 0`.
//
// `rowWidths` and `platEasements` are not in it. Both come from the plat analyser rather than from
// the clerk, so a run that read the plats and found nothing at the courthouse rendered the
// right-of-way widths, rendered the plat easements, and then printed
//
//     "No easement or encumbrance data found. Run the full research pipeline to populate this
//      section."
//
// underneath them. Not a hidden section this time — a contradiction, in the section whose whole job
// is to tell a surveyor what encumbers the tract. `hasData` now counts every list it renders, and
// the test enumerates them so a sixth source cannot be added without being counted.

/** What this tab renders out of one research run. */
export interface FemaDetail {
  floodZone?: string;
  zoneSubtype?: string | null;
  inSFHA?: boolean;
  firmPanel?: string | null;
  effectiveDate?: string | null;
  sourceUrl?: string;
}

export interface TxdotDetail {
  rowWidth?: number | null;
  csjNumber?: string | null;
  highwayName?: string | null;
  highwayClass?: string | null;
  district?: string | null;
  acquisitionDate?: string | null;
  sourceUrl?: string;
}

export interface RecordedEasement {
  type: string;
  description: string;
  instrumentNumber: string | null;
  width?: string | null;
  location?: string | null;
  sourceUrl: string | null;
  source: string;
}

export interface EasementsReviewData {
  summary: string;
  fema: FemaDetail | null;
  txdot: TxdotDetail | null;
  easements: RecordedEasement[];
  covenants: string[];
  rowWidths: string[];
  platEasements: string[];
  /**
   * Whether ANY of the six sources produced something.
   *
   * Six, not four. See the note at the top of this file — the two plat-derived lists were rendered
   * and then contradicted.
   */
  hasData: boolean;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** `null` for anything that is not a populated object — an empty `{}` is not a FEMA reading. */
function objOrNull<T>(v: unknown): T | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return Object.keys(v as object).length > 0 ? (v as T) : null;
}

export function easementsReviewData(metadata: unknown): EasementsReviewData {
  const meta = (metadata ?? null) as Record<string, unknown> | null;
  const result = (meta && typeof meta === 'object' ? meta.result : null) as
    Record<string, unknown> | null;
  const r = result && typeof result === 'object' && !Array.isArray(result) ? result : null;

  const boundary = (r?.boundary ?? null) as Record<string, unknown> | null;

  const fema = objOrNull<FemaDetail>(r?.fema);
  const txdot = objOrNull<TxdotDetail>(r?.txdot);
  const easements = arr<RecordedEasement>(r?.easements);
  const covenants = arr<string>(r?.restrictiveCovenants);
  const rowWidths = arr<string>(boundary?.rowWidths);
  const platEasements = arr<string>(boundary?.platEasements);

  return {
    summary: str(r?.easementSummary),
    fema,
    txdot,
    easements,
    covenants,
    rowWidths,
    platEasements,
    hasData: Boolean(
      fema || txdot
      || easements.length > 0 || covenants.length > 0
      || rowWidths.length > 0 || platEasements.length > 0,
    ),
  };
}

/**
 * Every source `hasData` is required to count, by the name it has on the shaped object.
 *
 * The point of listing them is that adding a seventh section to the tab without adding it here
 * fails the test rather than quietly re-opening the contradiction above.
 */
export const EASEMENT_DATA_SOURCES = [
  'fema', 'txdot', 'easements', 'covenants', 'rowWidths', 'platEasements',
] as const;

/**
 * Every key this tab reads off `analysis_metadata.result`, for the worker contract test.
 *
 * Nested keys are written `parent.child`; the check resolves the leaf, because the worker builds
 * these objects in the scrapers and merges them in `index.ts`.
 */
export const EASEMENT_RESULT_KEYS = [
  'easementSummary', 'fema', 'txdot', 'easements', 'restrictiveCovenants',
  'fema.floodZone', 'fema.zoneSubtype', 'fema.inSFHA', 'fema.firmPanel', 'fema.effectiveDate',
  'fema.sourceUrl',
  'txdot.rowWidth', 'txdot.csjNumber', 'txdot.highwayName', 'txdot.highwayClass', 'txdot.district',
  'txdot.acquisitionDate', 'txdot.sourceUrl',
  'easements.type', 'easements.description', 'easements.instrumentNumber', 'easements.width',
  'easements.location', 'easements.sourceUrl', 'easements.source',
  'boundary.rowWidths', 'boundary.platEasements',
] as const;
