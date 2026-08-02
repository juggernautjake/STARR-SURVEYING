// worker/src/services/imagery-plan.ts — framing a parcel, and imagery that counts as evidence (R16).
//
// ── WHAT EXISTED ────────────────────────────────────────────────────────────────────────────────
//
// One Google Static Maps call inside `lot-correlator.ts`, at **zoom 19, fixed**, centred on a
// geocoded point, base64'd straight into an AI prompt. Two problems, and the first is arithmetic:
//
//   Zoom 19 is about 0.26 m/pixel at Texas latitudes, so a 1280 px frame covers roughly 330 m —
//   fine for a quarter-acre lot in town, and roughly a third of the width of a 200-acre tract, which
//   is about 900 m square. The AI was being asked to identify a parcel from a picture of a ninth of
//   it. For the RURAL work this firm does, the fixed zoom was wrong nearly every time.
//
// The second is provenance. The image had no capture date, no scale, no source and no licence
// recorded, so it could illustrate a packet but could never support a conclusion in one. "The aerial
// shows the fence inside the deed line" means nothing without knowing when the aerial was flown.
//
// ── WHAT THIS MODULE DOES ───────────────────────────────────────────────────────────────────────
//
// It plans the captures and records what each one must carry to be evidence. It deliberately does
// NOT fetch: the fetchers need provider credentials and licensing decisions that are the owner's
// (plan §4.3), and every one of those decisions is easier to make against an explicit list of what
// the packet needs than against a code path that quietly produces nothing when a key is missing.

// ── Framing ─────────────────────────────────────────────────────────────────────────────────────

/** Web-Mercator ground resolution at zoom 0, metres per pixel at the equator. */
const EQUATOR_M_PER_PX = 156_543.03392;
const SQ_M_PER_ACRE = 4046.8564224;

/** Metres per pixel for a Web-Mercator tile zoom at a given latitude. Every raster provider worth
 *  using — Google, Esri, Bing — shares this scheme, so the framing maths is provider-independent. */
export function metresPerPixel(zoom: number, latitude: number, scale = 1): number {
  return (EQUATOR_M_PER_PX * Math.cos((latitude * Math.PI) / 180)) / (2 ** zoom * scale);
}

export interface FramingRequest {
  acreage: number | null;
  latitude: number;
  /** Pixels. Google Static Maps caps at 640 (×2 with `scale=2`); Esri export allows more. */
  imageWidthPx: number;
  /** Fraction of the frame the parcel should occupy. 0.75 leaves visible context — the adjoiner's
   *  fence and the road are usually the point of looking at all. */
  fill?: number;
  scale?: number;
}

export interface Framing {
  zoom: number;
  metresPerPixel: number;
  /** How wide the frame is on the ground. */
  groundWidthM: number;
  /** Estimated parcel width, assuming square. Stated as an assumption, not a measurement. */
  parcelWidthM: number | null;
  reason: string;
}

/** The zoom that actually frames this parcel.
 *
 *  Assumes a square parcel, which is wrong for the long narrow tracts this work is full of — a
 *  10-acre strip 100 ft wide and half a mile long needs a far wider frame than sqrt(area) suggests.
 *  That is why the result reports `parcelWidthM` as an assumption and why the caller should prefer a
 *  real bounding box when one exists. Erring wide is the safe direction: a parcel too small in the
 *  frame is still identifiable, one cropped in half is not. */
export function frameParcel(req: FramingRequest): Framing {
  const fill = req.fill ?? 0.75;
  const scale = req.scale ?? 1;

  if (!req.acreage || req.acreage <= 0) {
    // No acreage is not a reason to guess. Zoom 17 (~1.2 m/px, ~750 m across) shows a town lot in
    // context and at least most of a small rural tract, and the reason says it was a fallback.
    const z = 17;
    return {
      zoom: z,
      metresPerPixel: metresPerPixel(z, req.latitude, scale),
      groundWidthM: metresPerPixel(z, req.latitude, scale) * req.imageWidthPx,
      parcelWidthM: null,
      reason: 'No acreage known, so the frame is a default rather than a fit. Re-frame once the parcel size is established.',
    };
  }

  const parcelWidthM = Math.sqrt(req.acreage * SQ_M_PER_ACRE);
  const neededGroundM = parcelWidthM / fill;

  // Walk down from the tightest zoom until the parcel fits. Integer zooms only — tile providers do
  // not serve fractional ones, and asking for 18.4 silently gets you 18 with the wrong scale bar.
  let zoom = 21;
  while (zoom > 1 && metresPerPixel(zoom, req.latitude, scale) * req.imageWidthPx < neededGroundM) {
    zoom--;
  }

  const mpp = metresPerPixel(zoom, req.latitude, scale);
  return {
    zoom,
    metresPerPixel: mpp,
    groundWidthM: mpp * req.imageWidthPx,
    parcelWidthM,
    reason:
      `${req.acreage} acres is about ${Math.round(parcelWidthM)} m across if square; zoom ${zoom} ` +
      `frames ${Math.round(mpp * req.imageWidthPx)} m. Assumes a square parcel — prefer a bounding box when known.`,
  };
}

// ── Provenance ──────────────────────────────────────────────────────────────────────────────────

export type ImagerySource =
  | 'google_satellite' | 'google_streetview'
  | 'esri_world_imagery' | 'naip'
  | 'historical_usgs' | 'historical_tnris'
  | 'oblique_birdseye';

/** What an image must carry to support a conclusion rather than decorate a page.
 *
 *  `capturedAt` is the field that matters and the one providers make hardest to get: Google Static
 *  Maps does not return it at all. An unknown capture date is recorded as null and stated, because
 *  "the aerial shows the fence inside the deed line" is worthless without knowing when it was flown
 *  — and a packet that implies a current date it never verified is worse than one that admits it. */
export interface ImageryProvenance {
  source: ImagerySource;
  requestedAt: string;
  /** When the imagery was actually flown/captured. Null when the provider does not say. */
  capturedAt: string | null;
  metresPerPixel: number | null;
  centre: { lat: number; lon: number } | null;
  /** Attribution string that must appear on any page reproducing this image. */
  attribution: string;
  /** Whether this firm may put the image in a deliverable it hands a client. */
  redistribution: 'permitted' | 'attribution_required' | 'check_licence';
  sourceUrl: string | null;
}

/** Licence posture per source. `check_licence` is a refusal to guess, in the same spirit as the
 *  captcha posture in R12: nobody should discover a licensing problem from a client's lawyer. */
export const SOURCE_LICENCE: Record<ImagerySource, Pick<ImageryProvenance, 'attribution' | 'redistribution'>> = {
  google_satellite:   { attribution: 'Imagery ©Google', redistribution: 'check_licence' },
  google_streetview:  { attribution: 'Image ©Google', redistribution: 'check_licence' },
  esri_world_imagery: { attribution: 'Esri, Maxar, Earthstar Geographics', redistribution: 'attribution_required' },
  naip:               { attribution: 'USDA NAIP (public domain)', redistribution: 'permitted' },
  historical_usgs:    { attribution: 'USGS EarthExplorer (public domain)', redistribution: 'permitted' },
  historical_tnris:   { attribution: 'Texas Natural Resources Information System', redistribution: 'attribution_required' },
  oblique_birdseye:   { attribution: 'Provider-dependent', redistribution: 'check_licence' },
};

// ── The plan ────────────────────────────────────────────────────────────────────────────────────

export interface RoadFrontage {
  name: string;
  /** A point on the frontage to aim Street View at. */
  lat: number;
  lon: number;
  /** Street View exists only on public roads. A private drive or a tract with no frontage is a
   *  legitimate "no", and the packet should say so rather than silently omit the capture. */
  isPublic: boolean;
}

export interface ImageryTarget {
  acreage: number | null;
  latitude: number;
  longitude: number;
  /** Date of the deed whose boundary is being retraced. Historical aerials are chosen near it —
   *  an aerial from 2024 says nothing about where a fence stood when a 1968 deed was written. */
  controllingDeedDate?: string | null;
  frontages?: RoadFrontage[];
  imageWidthPx?: number;
}

export interface PlannedCapture {
  source: ImagerySource;
  purpose: string;
  zoom?: number;
  metresPerPixel?: number;
  centre: { lat: number; lon: number };
  /** For historical aerials: the year to aim for, and the window we will accept. */
  targetYear?: number;
  acceptableYearRange?: [number, number];
  label: string;
}

export interface SkippedCapture {
  source: ImagerySource;
  /** The acceptance criterion's own escape clause: "or a stated reason why not". */
  reason: string;
}

export interface ImageryPlan {
  captures: PlannedCapture[];
  skipped: SkippedCapture[];
  framing: Framing;
  /** True when the plan satisfies R16's acceptance: a current aerial, a historical aerial within ten
   *  years of the controlling deed, and Street View at every public frontage. */
  meetsPacketStandard: boolean;
  shortfalls: string[];
}

/** How far from the deed date a historical aerial is still worth having. Ten years is the plan's own
 *  figure; beyond it the photo predates or postdates the occupation it was meant to evidence. */
export const HISTORICAL_WINDOW_YEARS = 10;

export function planImagery(target: ImageryTarget): ImageryPlan {
  const widthPx = target.imageWidthPx ?? 1280;
  const framing = frameParcel({
    acreage: target.acreage,
    latitude: target.latitude,
    imageWidthPx: widthPx,
  });

  const centre = { lat: target.latitude, lon: target.longitude };
  const captures: PlannedCapture[] = [];
  const skipped: SkippedCapture[] = [];
  const shortfalls: string[] = [];

  // Current aerial. Esri World Imagery is listed first because it publishes a capture date and NAIP
  // is public domain — both matter more for evidence than Google's slightly newer tiles.
  captures.push({
    source: 'esri_world_imagery',
    purpose: 'Current aerial, parcel-framed',
    zoom: framing.zoom,
    metresPerPixel: framing.metresPerPixel,
    centre,
    label: `Current aerial @ z${framing.zoom} (${Math.round(framing.groundWidthM)} m wide)`,
  });

  // Historical aerial near the controlling deed.
  const deedYear = target.controllingDeedDate ? new Date(target.controllingDeedDate).getFullYear() : NaN;
  if (Number.isFinite(deedYear)) {
    captures.push({
      source: deedYear >= 1955 ? 'historical_usgs' : 'historical_tnris',
      purpose: 'Historical aerial near the controlling deed date, to show occupation as it then stood',
      centre,
      targetYear: deedYear,
      acceptableYearRange: [deedYear - HISTORICAL_WINDOW_YEARS, deedYear + HISTORICAL_WINDOW_YEARS],
      label: `Historical aerial ~${deedYear} (±${HISTORICAL_WINDOW_YEARS} yr)`,
    });
  } else {
    skipped.push({
      source: 'historical_usgs',
      reason:
        'No controlling deed date is known, so there is no year to aim a historical aerial at. ' +
        'Establish the deed being retraced first — a historical aerial chosen at random evidences nothing.',
    });
    shortfalls.push('no historical aerial (controlling deed date unknown)');
  }

  // Street View at each PUBLIC frontage.
  const frontages = target.frontages ?? [];
  const publicFrontages = frontages.filter((f) => f.isPublic);
  for (const f of publicFrontages) {
    captures.push({
      source: 'google_streetview',
      purpose: `Street-level view along ${f.name} — fences, gates, occupation lines and access`,
      centre: { lat: f.lat, lon: f.lon },
      label: `Street View: ${f.name}`,
    });
  }
  for (const f of frontages.filter((x) => !x.isPublic)) {
    skipped.push({
      source: 'google_streetview',
      reason: `${f.name} is not a public road — Street View does not cover it. Field photography is the substitute.`,
    });
  }
  if (frontages.length === 0) {
    skipped.push({
      source: 'google_streetview',
      reason:
        'No road frontages have been identified for this parcel. This is an unanswered question, ' +
        'not a finding that the parcel is landlocked — access is a title matter worth resolving.',
    });
    shortfalls.push('no Street View (road frontages not identified)');
  }

  if (!target.acreage) {
    shortfalls.push('aerial framing is a default, not a fit (parcel acreage unknown)');
  }

  return {
    captures,
    skipped,
    framing,
    meetsPacketStandard: shortfalls.length === 0,
    shortfalls,
  };
}

/** Build the provenance record for a capture that came back. Separate from the plan because a
 *  delivered image can differ from the requested one — providers substitute a nearby year, or return
 *  a coarser tile — and the packet must record what ARRIVED, not what was asked for. */
export function provenanceFor(
  source: ImagerySource,
  opts: {
    requestedAt: string;
    capturedAt?: string | null;
    metresPerPixel?: number | null;
    centre?: { lat: number; lon: number } | null;
    sourceUrl?: string | null;
  },
): ImageryProvenance {
  return {
    source,
    requestedAt: opts.requestedAt,
    capturedAt: opts.capturedAt ?? null,
    metresPerPixel: opts.metresPerPixel ?? null,
    centre: opts.centre ?? null,
    sourceUrl: opts.sourceUrl ?? null,
    ...SOURCE_LICENCE[source],
  };
}

/** One line for the packet, under the image. An image with no stated date must say so — a caption
 *  that omits it reads as "current". */
export function captionFor(p: ImageryProvenance): string {
  const when = p.capturedAt
    ? `flown ${p.capturedAt.slice(0, 10)}`
    : 'capture date not published by the provider';
  const scale = p.metresPerPixel ? `, ${p.metresPerPixel.toFixed(2)} m/pixel` : '';
  return `${p.attribution} — ${when}${scale}. Retrieved ${p.requestedAt.slice(0, 10)}.`;
}
