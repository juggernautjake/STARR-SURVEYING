// worker/src/research/run-order.ts — the order the owner asked for, and the hook that makes it real.
//
// ── THE REQUEST ─────────────────────────────────────────────────────────────────────────────────
//
// > "getting a drawing of the property or its corresponding subdivision layout is very important…
// >  the order should be, drawings/plats, then the overhead views, then the rest of the documents"
//
// ── WHAT THE RUN ACTUALLY DID ───────────────────────────────────────────────────────────────────
//
// The exact inverse. Imagery capture and the drawing hunt were the LAST two things a run did,
// after every deed had been searched, downloaded and analysed — and they ran in `index.ts` after
// `runCountyResearch` had already returned, because they were written as a post-processing step.
//
// On 2026-09-03 that ordering cost the owner the whole run. Bell CAD was unreachable, so the run
// had no coordinates; it then spent 163 minutes and $29.19 grinding owner-name searches at the
// clerk, and reached the imagery stage only at the very end, where it printed:
//
//     [1377s] Direct map screenshots skipped — no property ID or coordinates
//
// Twenty-three minutes of wall clock into a twenty-five minute budget before anything visual was
// even attempted. Under the requested order the run would have known within the first minute that
// it had nothing to photograph, which is a different and much more useful failure.
//
// ── WHY A HOOK AND NOT A REORDERED FUNCTION BODY ────────────────────────────────────────────────
//
// The visual work cannot simply move to the top: an aerial needs coordinates and a plat needs a
// subdivision name, and both come from identifying the property. The order is therefore not
// "visuals first" but "visuals first among the things that can be done once the parcel is known".
//
// Both research paths already have that moment — Bell's "Phase 1 complete" and the generic
// pipeline's Stage 1/Stage 2 boundary — and neither had any way to tell a caller about it. That is
// the whole change: a callback fired at the identification boundary, awaited, so the visual work
// happens BEFORE the document grind rather than after it.
//
// Awaited on purpose. Fire-and-forget would let the deeds start immediately and restore the old
// ordering in everything but name, and the ceiling that bounds the run bounds this too — a capture
// step that runs long is subject to the same deadline as any other step.

/** What a run knows about the parcel once it has identified it. */
export interface IdentifiedProperty {
  /** The county's account number, when the CAD gave one. */
  propertyId: string | null;
  /** Parcel location. Null means the visual stage has nothing to point a camera at, and says so. */
  latitude: number | null;
  longitude: number | null;
  acreage: number | null;
  legalDescription: string | null;
  /** Drives the free plat repository lookup — the cheapest route to a drawing. */
  subdivisionName: string | null;
  situsAddress: string | null;
  /** The most recent controlling deed date, when known, so imagery can be framed in time. */
  controllingDeedDate: string | null;
  /** Neighbours with coordinates, for the adjoiner aerials. */
  neighbours: Array<{ label: string; lat: number; lon: number }>;
}

/**
 * Called the moment a run knows which parcel it is researching.
 *
 * Awaited by the caller. Must never throw: the research is the point, and losing a run because a
 * map server was slow would be a bad trade. Implementations swallow and report.
 */
export type OnPropertyIdentified = (property: IdentifiedProperty) => Promise<void>;

/** The order, as data, so the log and the tests read the same list the code follows. */
export const RUN_ORDER = [
  {
    step: 'identify',
    label: 'Identify the parcel',
    why: 'A plat needs a subdivision name and an aerial needs coordinates. Nothing visual is '
      + 'possible before this, so it leads by necessity rather than by preference.',
  },
  {
    step: 'drawings',
    label: 'Drawings and plats',
    why: 'The owner\'s first priority. A recorded plat or a map of survey is the visual the rest '
      + 'of the research is read against, and the free county plat repository is the cheapest '
      + 'route to one.',
  },
  {
    step: 'imagery',
    label: 'Overhead views',
    why: 'Satellite at three zooms, the county CAD GIS map, obliques where licensed. Second '
      + 'because it is fast, bounded and needs only coordinates.',
  },
  {
    step: 'documents',
    label: 'Everything else',
    why: 'Deeds, easements, affidavits, tax and flood records. Last because it is the open-ended '
      + 'part: on 2026-09-03 it consumed 163 minutes and every dollar of a $2 ceiling, and under '
      + 'the old ordering it consumed them BEFORE anything visual was attempted.',
  },
] as const;

export type RunOrderStep = (typeof RUN_ORDER)[number]['step'];

/** One line per step, for the run log the operator is watching. */
export function describeRunOrder(): string[] {
  return RUN_ORDER.map((s, i) => `${i + 1}. ${s.label}`);
}

/**
 * Whether this parcel can be photographed at all.
 *
 * Split out because "no coordinates" and "no plat" are different gaps with different fixes, and a
 * stage that reports "skipped" without saying which one leaves an operator with nowhere to go.
 */
export function visualReadiness(p: IdentifiedProperty): {
  canPhotograph: boolean;
  canFindPlat: boolean;
  statement: string;
} {
  const canPhotograph = Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && p.latitude !== null && p.longitude !== null;
  const canFindPlat = Boolean(p.subdivisionName?.trim());

  if (canPhotograph && canFindPlat) {
    return {
      canPhotograph, canFindPlat,
      statement: `Parcel located and named — overhead views and the plat for `
        + `"${p.subdivisionName!.trim()}" can both be attempted.`,
    };
  }
  if (canPhotograph) {
    return {
      canPhotograph, canFindPlat,
      statement: 'Parcel located, so overhead views can be taken. No subdivision name yet, so the '
        + 'free plat repository has nothing to search — this is a metes-and-bounds parcel, or the '
        + 'legal description has not been read yet.',
    };
  }
  if (canFindPlat) {
    return {
      canPhotograph, canFindPlat,
      statement: `No coordinates, so nothing can be photographed. The subdivision name `
        + `"${p.subdivisionName!.trim()}" is known, so the plat can still be looked for.`,
    };
  }
  return {
    canPhotograph, canFindPlat,
    statement: 'The parcel has neither coordinates nor a subdivision name, so there is nothing to '
      + 'photograph and nothing to look a plat up by. This is a gap in what the run could identify, '
      + 'not a finding that the property has no plat or no imagery.',
  };
}
