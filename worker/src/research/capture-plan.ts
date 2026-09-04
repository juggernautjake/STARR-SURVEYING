// worker/src/research/capture-plan.ts — what to photograph for a property, and why (plan F1–F4).
//
// ── THE OWNER'S REQUEST ─────────────────────────────────────────────────────────────────────────
//
// "We need to work especially hard on finding drawings and cad work for properties that we
//  research, and we need to make sure we are collecting and saving screenshots of satellite and
//  eagle eye views of properties and their surrounding properties if possible, as well as
//  screenshots of the relevant CAD GIS maps that show the land."
//
// ── WHAT WAS ACTUALLY THERE ─────────────────────────────────────────────────────────────────────
//
// Three things, each real, and none of them joined up:
//
//   `imagery-plan.ts`      — `planImagery()` decides what a packet needs and at what zoom. Its only
//                            callers are its own tests. Its header says so: "It deliberately does
//                            NOT fetch." `frameParcel()` has exactly one caller, in a Bell-county
//                            analyzer, for static maps.
//   `map-screenshot-capture.ts` (840 lines) and `gis-viewer-capture.ts` (1,665 lines) — real
//                            Playwright capture that works, hardcoded to Bell County and invoked
//                            only from `counties/bell/orchestrator.ts`. Google satellite is taken
//                            at a FIXED zoom 20 — the very defect `frameParcel` exists to fix.
//   `BIS_CONFIGS`          — carries `gisBaseUrl` for **19 counties**. It is used to QUERY GIS
//                            features and never to photograph the viewer.
//
// So: a planner nothing calls, a capturer that ignores the planner, and nineteen counties' worth of
// GIS viewer URLs used for everything except the thing the owner asked for.
//
// This module is the join. It is PURE — it decides, it does not fetch — so the decision can be
// tested without a browser, and so the runner has one list to execute instead of four call sites
// each deciding for themselves.
//
// ── WHY EVERY CAPTURE CARRIES PROVENANCE, AND WHY A SKIP IS A RECORD ────────────────────────────
//
// An aerial with no capture date can illustrate a packet. It cannot support a conclusion in one:
// "the fence sits inside the deed line" is worthless without knowing when the photo was flown, and
// a packet that implies a current date it never verified is worse than one that admits it does not
// know. `ImageryProvenance` already models this; nothing was producing it.
//
// And a capture that does not happen is recorded with a reason, never omitted. A packet missing an
// oblique view because the county has no oblique coverage and a packet missing one because nobody
// looked are indistinguishable at the point of use — and only one of them is a fact about the
// property.

import {
  frameParcel,
  SOURCE_LICENCE,
  type Framing,
  type ImagerySource,
  type ImageryProvenance,
  type RoadFrontage,
} from '../services/imagery-plan.js';

/** What a capture is FOR. Kept separate from `ImagerySource`, which is where it comes from —
 *  a neighbour aerial and the subject aerial come from the same source and answer different
 *  questions, and filing them under one name is how "surrounding properties" got lost. */
export type CaptureKind =
  /** The parcel and its surroundings — roads, neighbours, how it sits in the block. */
  | 'aerial_wide'
  /** The parcel itself, framed so the whole tract fits. */
  | 'aerial_subject'
  /** Close on the improvements — structures, drives, fence lines, encroachments. */
  | 'aerial_close'
  /** The adjoiners. The neighbour's fence and the road are usually the point of looking. */
  | 'aerial_neighbours'
  /** An aerial near the controlling deed's date. A 2024 photo says nothing about a 1968 deed. */
  | 'aerial_historical'
  /** Oblique / bird's-eye. Shows vertical structure a nadir aerial flattens away. */
  | 'oblique'
  /** Street View at a public frontage. */
  | 'streetview'
  /** The county appraisal district's own GIS viewer, showing the parcel as the county draws it. */
  | 'cad_gis'
  /** A recorded plat, survey or CAD drawing published by the county. */
  | 'drawing';

export interface PlannedCaptureItem {
  /** Stable across runs for the same subject, so a re-run can recognise its own previous capture
   *  instead of filing a second copy. This is what stops re-taken screenshots being 19 of the 53
   *  duplicate document groups measured in production. */
  key: string;
  kind: CaptureKind;
  source: ImagerySource | 'cad_gis' | 'county_records';
  /** Human label, used as the document label when this is filed. */
  label: string;
  /** Why this capture is worth taking. Goes into the packet, not just the log. */
  purpose: string;
  /** Where to point a browser, when the capture is Playwright-driven. */
  url?: string;
  centre?: { lat: number; lon: number };
  zoom?: number;
  metresPerPixel?: number;
  /** For a historical aerial. */
  targetYear?: number;
  /** True when the capture should be OCR'd after it is taken — a legend, a scale bar or a lot
   *  number inside a map image is text, and leaving it as pixels makes it unsearchable. A capture
   *  that supplies its own text (a rendered parcel map) is not OCR'd even when this is true. */
  ocr: boolean;
  /** For `cad_gis`: the parcel layer to render from, and the parcel to frame on. */
  parcelLayerUrl?: string;
  parcelId?: string | null;
  acreage?: number | null;
}

export interface SkippedCaptureItem {
  kind: CaptureKind;
  /** Never "unavailable". What was missing, and whether it is a fact about the property or about
   *  our configuration — those are different answers and only one is about the land. */
  reason: string;
}

export interface CapturePlan {
  captures: PlannedCaptureItem[];
  skipped: SkippedCaptureItem[];
  framing: Framing | null;
  /** One sentence for the run log and the report. */
  summary: string;
}

export interface CapturePlanInput {
  projectId: string;
  county: string;
  /** Parcel centroid. Without it almost nothing can be planned, and that is stated rather than
   *  silently producing an empty plan. */
  latitude?: number | null;
  longitude?: number | null;
  acreage?: number | null;
  parcelId?: string | null;
  /** The county's GIS viewer, from `BIS_CONFIGS[county].gisBaseUrl`. 19 counties have one. */
  gisBaseUrl?: string | null;
  /** The county's parcel FeatureServer layer, from `BIS_CONFIGS[county].gisParcelLayerUrls[0]`.
   *  When present the CAD map is RENDERED from it (see research/parcel-map-render.ts) rather than
   *  screenshotted from the viewer — no popup, no captcha, no selector, and the labels are ours. */
  parcelLayerUrl?: string | null;
  /** Date of the deed being retraced, for choosing a historical aerial. */
  controllingDeedDate?: string | null;
  frontages?: RoadFrontage[];
  /** Adjoining parcels' centroids, when the adjoiner register found them. */
  neighbours?: Array<{ label: string; lat: number; lon: number }>;
  /** Is an oblique provider configured? Bird's-eye is licensed, not free, and claiming coverage we
   *  do not have is worse than recording that we do not have it. */
  obliqueProvider?: string | null;
  /** Re-capture imagery even when the library already holds it (the run setting). */
  refreshImagery?: boolean;
  /** Capture keys the project library already holds, so an unchanged screenshot is not retaken. */
  alreadyHeldKeys?: string[];
  imageWidthPx?: number;
}

/** How many adjoining parcels are worth photographing.
 *
 *  Not unbounded: a tract can have a dozen adjoiners, each capture costs a browser page-load, and
 *  the fourth-nearest neighbour rarely decides a boundary question. Six is enough to cover a normal
 *  city lot on all sides plus two, and the plan says when it truncated rather than silently
 *  dropping the rest. */
export const MAX_NEIGHBOUR_CAPTURES = 6;

/**
 * Three satellite passes over the subject, at the owner's request: "a zoomed out view, a medium
 * zoom view, and then a closer up zoom view… for every run we do".
 *
 * ── WHY THREE, AND WHY THEY ARE OFFSETS ───────────────────────────────────────────────────────
 *
 * One aerial cannot answer the questions a surveyor actually asks of one. The framed view shows
 * the tract and settles "is this the right parcel". It cannot show the road it takes access from,
 * and it cannot resolve a fence three feet inside the line. Those are different pictures.
 *
 * They are OFFSETS from the framed zoom rather than fixed numbers, because the framed zoom is
 * computed from acreage — a quarter-acre lot and a 200-acre tract need different absolute zooms
 * for the same job. Fixed numbers are what made the old capture take everything at zoom 20.
 *
 * Clamped to Google's usable range: below 14 a rural parcel disappears into terrain, above 21
 * the imagery stops resolving and simply blurs.
 */
export const ZOOM_BANDS = [
  {
    kind: 'aerial_wide' as const,
    label: 'Aerial — wide, parcel in context',
    offset: -3,
    purpose:
      'The parcel in its surroundings: the road it takes access from, the neighbouring tracts, and how it sits in the block. A framed view of the tract alone cannot show any of that.',
  },
  {
    kind: 'aerial_subject' as const,
    label: 'Aerial — subject parcel',
    offset: 0,
    purpose:
      'Framed to the whole tract, at the zoom its acreage calls for. This is the view that settles whether the right parcel was identified.',
  },
  {
    kind: 'aerial_close' as const,
    label: 'Aerial — close on the improvements',
    offset: 2,
    purpose:
      'Close enough to read structures, drives and fence lines. A fence sitting three feet inside the deed line is invisible at a framing zoom and obvious at this one.',
  },
];

/** Google resolves usable satellite imagery over roughly this range. */
export const MIN_ZOOM = 14;
export const MAX_ZOOM = 21;

/** A band's absolute zoom, from the framed zoom the acreage produced. */
export function zoomForBand(framedZoom: number, offset: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, framedZoom + offset));
}

/** Google's satellite view, at a given centre and zoom, as a URL Playwright can open.
 *
 *  Matches the form `map-screenshot-capture.ts` already drives for Bell, so this is the same road
 *  that is known to work — with the zoom computed rather than fixed at 20. */
export function googleSatelliteUrl(lat: number, lon: number, zoom: number): string {
  return `https://www.google.com/maps/@${lat},${lon},${zoom}z/data=!3m1!1e3`;
}

/** Google's oblique / bird's-eye tilt at a centre.
 *
 *  Separate from the satellite URL because the tilt parameter is what makes it oblique, and the two
 *  answer different questions: a nadir aerial flattens vertical structure, which is exactly what a
 *  retaining wall, a bank or a two-storey encroachment consists of. */
export function googleObliqueUrl(lat: number, lon: number, zoom: number): string {
  return `https://www.google.com/maps/@${lat},${lon},${zoom}a,0y,45t/data=!3m1!1e3`;
}

/**
 * The plan.
 *
 * Ordered by what a packet needs first, so a run that stops on its ceiling has taken the most
 * valuable captures rather than an arbitrary prefix.
 */
export function planCaptures(input: CapturePlanInput): CapturePlan {
  const captures: PlannedCaptureItem[] = [];
  const skipped: SkippedCaptureItem[] = [];
  const held = new Set(input.alreadyHeldKeys ?? []);
  const refresh = input.refreshImagery === true;

  const lat = numberOrNull(input.latitude);
  const lon = numberOrNull(input.longitude);

  // ── Nothing can be aimed without a centroid ──────────────────────────────────────────────────
  //
  // Stated once, as a fact about what we know rather than as seven separate "unavailable" lines.
  if (lat === null || lon === null) {
    for (const kind of ['aerial_subject', 'aerial_neighbours', 'aerial_historical', 'oblique', 'streetview'] as CaptureKind[]) {
      skipped.push({
        kind,
        reason:
          'No parcel centroid was resolved for this property, so there is nowhere to point a ' +
          'camera. This is a gap in what the run identified, not a fact about the land.',
      });
    }
    // The CAD GIS viewer is still worth opening: it is addressed by parcel id, not by coordinates.
    const gis = planCadGis(input, held, refresh);
    if (gis.capture) captures.push(gis.capture); else if (gis.skip) skipped.push(gis.skip);
    return {
      captures,
      skipped,
      framing: null,
      summary: summarise(captures, skipped),
    };
  }

  const framing = frameParcel({
    acreage: input.acreage ?? null,
    latitude: lat,
    imageWidthPx: input.imageWidthPx ?? 1280,
  });

  // ── 1. The parcel, at THREE zooms ────────────────────────────────────────────────────────────
  //
  // Wide, framed, close — every run. The framed zoom comes from the acreage and the other two are
  // offsets from it; Bell's capture used a fixed zoom 20 for everything, which photographs the
  // middle of anything larger than a house lot and calls it the parcel.
  for (const band of ZOOM_BANDS) {
    const zoom = zoomForBand(framing.zoom, band.offset);
    // Metres per pixel doubles for every zoom level down, so the scale has to be recomputed per
    // band. Reporting the framed scale on all three would put a wrong number on two of them, and
    // a scale is the one thing that makes an aerial measurable rather than decorative.
    const mpp = framing.metresPerPixel * Math.pow(2, framing.zoom - zoom);
    addCapture(captures, skipped, held, refresh, {
      key: captureKey(input.projectId, band.kind, input.parcelId ?? `${lat},${lon}`),
      kind: band.kind,
      source: 'google_satellite',
      label: band.label,
      purpose: `${band.purpose} Zoom ${zoom}, ${mpp.toFixed(2)} m/px.`,
      url: googleSatelliteUrl(lat, lon, zoom),
      centre: { lat, lon },
      zoom,
      metresPerPixel: mpp,
      // Google overlays road and place labels that place the image — cheap to read, and it makes
      // the capture searchable. Worth most on the wide view, where the road names are.
      ocr: band.kind === 'aerial_wide',
    });
  }

  // ── 2. The county's own GIS view ─────────────────────────────────────────────────────────────
  const gis = planCadGis(input, held, refresh);
  if (gis.capture) captures.push(gis.capture); else if (gis.skip) skipped.push(gis.skip);

  // ── 3. The neighbours ────────────────────────────────────────────────────────────────────────
  const neighbours = input.neighbours ?? [];
  if (neighbours.length === 0) {
    skipped.push({
      kind: 'aerial_neighbours',
      reason:
        'No adjoining parcels were identified for this property, so none could be photographed. ' +
        'The adjoiner register is what supplies them; an empty register means they were not found, ' +
        'not that the tract has no neighbours.',
    });
  } else {
    for (const n of neighbours.slice(0, MAX_NEIGHBOUR_CAPTURES)) {
      addCapture(captures, skipped, held, refresh, {
        key: captureKey(input.projectId, 'aerial_neighbours', n.label),
        kind: 'aerial_neighbours',
        source: 'google_satellite',
        label: `Aerial — adjoiner: ${n.label}`,
        purpose:
          'The adjoining tract, at the same scale as the subject. The neighbour\'s fence, drive ' +
          'and outbuildings are usually what a boundary question actually turns on.',
        url: googleSatelliteUrl(n.lat, n.lon, framing.zoom),
        centre: { lat: n.lat, lon: n.lon },
        zoom: framing.zoom,
        metresPerPixel: framing.metresPerPixel,
        ocr: false,
      });
    }
    if (neighbours.length > MAX_NEIGHBOUR_CAPTURES) {
      skipped.push({
        kind: 'aerial_neighbours',
        reason:
          `${neighbours.length - MAX_NEIGHBOUR_CAPTURES} further adjoining parcel(s) were not ` +
          `photographed — the plan captures the nearest ${MAX_NEIGHBOUR_CAPTURES}. They are named ` +
          'in the adjoiner register and can be captured on request.',
      });
    }
  }

  // ── 4. Oblique / bird's-eye ──────────────────────────────────────────────────────────────────
  //
  // Gated on a configured provider. Recorded as a configuration gap, in those words, because
  // "no oblique imagery" reads as a fact about the county when it is a fact about our account.
  if (input.obliqueProvider) {
    addCapture(captures, skipped, held, refresh, {
      key: captureKey(input.projectId, 'oblique', input.parcelId ?? `${lat},${lon}`),
      kind: 'oblique',
      source: 'oblique_birdseye',
      label: 'Oblique / bird\'s-eye — subject parcel',
      purpose:
        'A tilted view. A nadir aerial flattens vertical structure away, and a retaining wall, a ' +
        'bank or a two-storey encroachment is vertical structure.',
      url: googleObliqueUrl(lat, lon, Math.min(framing.zoom, 19)),
      centre: { lat, lon },
      zoom: Math.min(framing.zoom, 19),
      ocr: false,
    });
  } else {
    skipped.push({
      kind: 'oblique',
      reason:
        'No oblique / bird\'s-eye provider is configured for this worker, so no tilted view was ' +
        'captured. That is a gap in this firm\'s imagery accounts — it says nothing about whether ' +
        'oblique coverage exists for this property.',
    });
  }

  // ── 5. Street View at each public frontage ───────────────────────────────────────────────────
  const frontages = input.frontages ?? [];
  const publicFrontages = frontages.filter((f) => f.isPublic);
  if (publicFrontages.length === 0) {
    skipped.push({
      kind: 'streetview',
      reason: frontages.length === 0
        ? 'No road frontage was identified, so no Street View position could be chosen.'
        : 'Every identified frontage is a private drive. Street View covers public roads only, so ' +
          'the absence of a ground-level image here is a fact about access, not an omission.',
    });
  } else {
    for (const f of publicFrontages) {
      addCapture(captures, skipped, held, refresh, {
        key: captureKey(input.projectId, 'streetview', f.name),
        kind: 'streetview',
        source: 'google_streetview',
        label: `Street View — ${f.name}`,
        purpose: 'Ground-level view of the frontage: fences, gates, monuments and visible occupation.',
        centre: { lat: f.lat, lon: f.lon },
        ocr: false,
      });
    }
  }

  // ── 6. A historical aerial near the controlling deed ─────────────────────────────────────────
  const deedYear = yearOf(input.controllingDeedDate);
  if (deedYear === null) {
    skipped.push({
      kind: 'aerial_historical',
      reason:
        'No controlling deed date is known, so there is no year to aim a historical aerial at. A ' +
        'historical photo chosen at random evidences nothing.',
    });
  } else {
    addCapture(captures, skipped, held, refresh, {
      key: captureKey(input.projectId, 'aerial_historical', String(deedYear)),
      kind: 'aerial_historical',
      source: 'historical_usgs',
      label: `Historical aerial — near ${deedYear}`,
      purpose:
        `An aerial from near ${deedYear}, the date of the controlling instrument. A current photo ` +
        'says nothing about where a fence stood when the deed was written.',
      centre: { lat, lon },
      targetYear: deedYear,
      ocr: false,
    });
  }

  return { captures, skipped, framing, summary: summarise(captures, skipped) };
}

// ── CAD GIS ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The county appraisal district's own GIS viewer.
 *
 * This is the map the county draws the parcel on, and it is the one a reviewer will check against.
 * `BIS_CONFIGS` has carried `gisBaseUrl` for 19 counties since it was written and used it only to
 * query features — never to photograph the viewer, which is what the owner asked for.
 */
function planCadGis(
  input: CapturePlanInput,
  held: Set<string>,
  refresh: boolean,
): { capture?: PlannedCaptureItem; skip?: SkippedCaptureItem } {
  const base = (input.gisBaseUrl ?? '').trim();
  const layer = (input.parcelLayerUrl ?? '').trim();
  if (!base && !layer) {
    return {
      skip: {
        kind: 'cad_gis',
        reason:
          `No GIS viewer URL or parcel layer is registered for ${input.county || 'this county'}, so its CAD map ` +
          'was not captured. 19 counties carry a viewer in BIS_CONFIGS; adding this county there is all ' +
          'that is required. This is a coverage gap in our registry, not a county without a map.',
      },
    };
  }

  const key = captureKey(input.projectId, 'cad_gis', input.parcelId ?? input.county);
  if (held.has(key) && !refresh) {
    return {
      skip: {
        kind: 'cad_gis',
        reason:
          'The project library already holds this county GIS capture and the run was not asked to ' +
          're-capture imagery. The existing image is unchanged and still attributed.',
      },
    };
  }

  return {
    capture: {
      key,
      kind: 'cad_gis',
      source: 'cad_gis',
      label: `County GIS map — ${input.county} CAD`,
      purpose:
        'The parcel as the appraisal district itself draws it, with its lot lines, dimensions and ' +
        'labels. This is the map a reviewer compares a survey against.',
      // The viewer takes a property id in its query string; without one it still opens on the
      // county, which is worth having and is stated as such rather than skipped. Absent when the
      // county has a parcel layer but no viewer — the map is rendered, not photographed.
      url: base
        ? (input.parcelId
          ? `${stripTrailingSlash(base)}/?PropertyID=${encodeURIComponent(input.parcelId)}`
          : stripTrailingSlash(base))
        : undefined,
      // The whole point of this capture is the text on it — lot numbers, dimensions, a scale bar.
      // Leaving that as pixels makes the one searchable thing in the packet unsearchable.
      ocr: true,
      // What the renderer needs. The runner tries the render first and falls back to the viewer.
      parcelLayerUrl: layer || undefined,
      parcelId: input.parcelId ?? null,
      acreage: input.acreage ?? null,
      centre: Number.isFinite(Number(input.latitude)) && Number.isFinite(Number(input.longitude))
        ? { lat: Number(input.latitude), lon: Number(input.longitude) }
        : undefined,
    },
  };
}

// ── Provenance ──────────────────────────────────────────────────────────────────────────────────

/**
 * The provenance record for a capture that has just been taken.
 *
 * `capturedAt` is the field providers make hardest to get and the only one that makes an aerial
 * evidence rather than decoration. Google does not return it, so it is null and SAID to be null —
 * a packet that implies a date it never verified is worse than one that admits it does not know.
 */
export function provenanceForCapture(
  item: PlannedCaptureItem,
  requestedAt = new Date().toISOString(),
): ImageryProvenance {
  const source: ImagerySource = item.source === 'cad_gis' || item.source === 'county_records'
    ? 'esri_world_imagery'
    : item.source;
  const licence = SOURCE_LICENCE[source];
  return {
    source,
    requestedAt,
    capturedAt: null,
    metresPerPixel: item.metresPerPixel ?? null,
    centre: item.centre ?? null,
    attribution: item.source === 'cad_gis'
      ? 'County Appraisal District GIS'
      : licence.attribution,
    redistribution: item.source === 'cad_gis' ? 'check_licence' : licence.redistribution,
    sourceUrl: item.url ?? null,
  };
}

/** The caption an image must carry wherever it is reproduced. */
export function captionForCapture(item: PlannedCaptureItem, p: ImageryProvenance): string {
  const when = p.capturedAt
    ? `flown ${p.capturedAt.slice(0, 10)}`
    : 'capture date not published by the provider';
  const scale = p.metresPerPixel ? `, ${p.metresPerPixel.toFixed(2)} m/px` : '';
  return `${item.label} — ${p.attribution}, retrieved ${p.requestedAt.slice(0, 10)} (${when}${scale}).`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

/** A capture's identity, stable across runs.
 *
 *  This is what lets a re-run recognise "the same screenshot of the same thing" and decline to file
 *  a second copy. 19 of the 53 duplicate document groups measured in production on 2026-09-01 were
 *  exactly that: one screenshot, retaken every run. */
export function captureKey(projectId: string, kind: CaptureKind, subject: string): string {
  const slug = subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${projectId}:${kind}:${slug || 'subject'}`;
}

function addCapture(
  captures: PlannedCaptureItem[],
  skipped: SkippedCaptureItem[],
  held: Set<string>,
  refresh: boolean,
  item: PlannedCaptureItem,
): void {
  if (held.has(item.key) && !refresh) {
    skipped.push({
      kind: item.kind,
      reason:
        `Already held: "${item.label}" was captured by an earlier run and the run was not asked to ` +
        're-capture imagery. The existing image stands, with its original capture date.',
    });
    return;
  }
  captures.push(item);
}

function numberOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return new Date(t).getUTCFullYear();
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function summarise(captures: PlannedCaptureItem[], skipped: SkippedCaptureItem[]): string {
  if (captures.length === 0) {
    return `No imagery could be planned. ${skipped.length} capture(s) were skipped, each with a stated reason.`;
  }
  const byKind = new Map<CaptureKind, number>();
  for (const c of captures) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
  const parts = [...byKind.entries()].map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`);
  return `${captures.length} capture(s) planned: ${parts.join(', ')}.` +
    (skipped.length > 0 ? ` ${skipped.length} skipped, each with a stated reason.` : '');
}
