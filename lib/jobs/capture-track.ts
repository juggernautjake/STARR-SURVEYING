// lib/jobs/capture-track.ts — deciding whether somebody actually walked.
//
// Owner, 2026-09-20: "we will show the path the user walked for videos, if they walked far enough
// for it to matter at least."
//
// ── THE WHOLE PROBLEM IN ONE PARAGRAPH ──────────────────────────────────────────────────────────
//
// Phone GPS is 3-5 m on a good day and 10 m or worse under canopy — which is where surveyors work.
// "Far enough to matter" was put at 15 ft, about 4.6 m, and that sits AT the noise floor: a phone
// lying still on a tailgate will appear to wander that far and further.
//
// Taken literally, then, a video shot standing at a fence corner would draw a bird's nest of
// invented movement, and the map would show a surveyor pacing a small cage for three minutes. That
// is not a rendering bug anybody would report as one — it looks like data.
//
// So a sample is kept only when it is further than BOTH thresholds:
//
//   · the distance that matters (15 ft), AND
//   · the accuracy the phone itself reported for that fix.
//
// The second half is what makes it honest. A phone claiming ±30 m has not told us it moved 20 ft;
// it has told us it has no idea. Trusting the first threshold alone would turn its confusion into a
// walked path.
//
// The result: "walked twenty feet" becomes a clean two-point segment, and "stood still for three
// minutes" becomes a single point. Which is what was asked for.
//
// This is arithmetic over a list of fixes. It must not need a phone to verify, which is why it
// lives here as pure functions and not inside the upload route.

/** One GPS fix taken while recording. `t` is SECONDS INTO THE CLIP, never a wall clock. */
export interface TrackSample {
  t: number;
  lat: number;
  lng: number;
  /** Reported accuracy in metres. Null when the device did not say — treated as untrustworthy. */
  acc?: number | null;
}

export const FEET_PER_METRE = 3.280839895013123;

/** "Far enough for it to matter" (owner, 2026-09-20), in feet. */
export const MATTERS_FEET = 15;

/**
 * A fix worse than this is dropped outright rather than filtered.
 *
 * 30 m is roughly a hundred feet. A fix that vague is not a position on a property; including it
 * would drag a path across a neighbour's land on the strength of a number the phone already
 * disclaimed.
 */
export const UNUSABLE_ACCURACY_M = 30;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than an equirectangular approximation: the approximation is faster and is fine
 * at these distances, but this same function is used to decide whether two fixes are the same place,
 * and a systematic error in that decision is exactly the kind of quiet wrongness the rest of this
 * module exists to avoid.
 */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8; // IUGG mean Earth radius
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function feetBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return metresBetween(a, b) * FEET_PER_METRE;
}

/** A sample that is structurally usable. Null Island is refused for the reason in seeds/653. */
function usable(s: TrackSample): boolean {
  if (!finite(s?.t) || !finite(s?.lat) || !finite(s?.lng)) return false;
  if (s.lat < -90 || s.lat > 90 || s.lng < -180 || s.lng > 180) return false;
  if (s.lat === 0 && s.lng === 0) return false;
  if (finite(s.acc) && s.acc > UNUSABLE_ACCURACY_M) return false;
  return true;
}

export interface CleanTrackOptions {
  mattersFeet?: number;
  unusableAccuracyM?: number;
}

/**
 * Drop the fixes that are noise, keep the ones that are movement.
 *
 * The first and last usable samples are ALWAYS kept. The first is where the clip starts, which is
 * where the pin goes even for a stationary video; the last is where it ends, and dropping it would
 * shorten every walked path by up to one threshold.
 */
export function cleanTrack(samples: readonly TrackSample[], opts: CleanTrackOptions = {}): TrackSample[] {
  const mattersM = (opts.mattersFeet ?? MATTERS_FEET) / FEET_PER_METRE;
  const worst = opts.unusableAccuracyM ?? UNUSABLE_ACCURACY_M;

  const live = samples
    .filter((s) => usable({ ...s, acc: s.acc }) && (!finite(s.acc) || s.acc <= worst))
    .sort((a, b) => a.t - b.t);

  if (live.length <= 2) return live;

  const kept: TrackSample[] = [live[0]!];
  for (let i = 1; i < live.length - 1; i += 1) {
    const s = live[i]!;
    const last = kept[kept.length - 1]!;
    const moved = metresBetween(last, s);

    // BOTH thresholds. The accuracy half is what stops a vague fix being read as movement — see
    // the header. An unstated accuracy is treated as the "matters" distance rather than as zero,
    // because a device that did not say is not a device that was certain.
    const need = Math.max(mattersM, finite(s.acc) ? s.acc : mattersM);
    if (moved > need) kept.push(s);
  }
  kept.push(live[live.length - 1]!);
  return kept;
}

export type TrackShape =
  | { kind: 'none' }
  | { kind: 'point'; at: { lat: number; lng: number }; startedAt: number }
  | { kind: 'path'; at: { lat: number; lng: number }; vertices: Array<{ lat: number; lng: number }>; lengthFeet: number };

/**
 * What this clip should become on the map: nothing, a single pin, or a walked path.
 *
 * A path needs at least two kept samples AND a total length past the threshold. Both, because two
 * samples either side of a noisy jump can survive the per-sample filter and still describe a walk
 * of four feet — and a four-foot path on satellite imagery is a smudge that reads as a mistake.
 */
export function trackShape(samples: readonly TrackSample[], opts: CleanTrackOptions = {}): TrackShape {
  const kept = cleanTrack(samples, opts);
  if (kept.length === 0) return { kind: 'none' };

  const first = kept[0]!;
  if (kept.length === 1) return { kind: 'point', at: { lat: first.lat, lng: first.lng }, startedAt: first.t };

  let lengthFeet = 0;
  for (let i = 1; i < kept.length; i += 1) lengthFeet += feetBetween(kept[i - 1]!, kept[i]!);

  if (lengthFeet <= (opts.mattersFeet ?? MATTERS_FEET)) {
    // They stood still. One pin where the clip started, which is the useful answer.
    return { kind: 'point', at: { lat: first.lat, lng: first.lng }, startedAt: first.t };
  }

  return {
    kind: 'path',
    at: { lat: first.lat, lng: first.lng },
    // `vertices` on job_map_points is "the bends AFTER the start" — see seeds/642:29-30 — so the
    // first sample is the anchor and is not repeated here.
    vertices: kept.slice(1).map((s) => ({ lat: s.lat, lng: s.lng })),
    lengthFeet,
  };
}

/**
 * Where the marker sits when the video is `seconds` in.
 *
 * Interpolated between the two surrounding samples, and driven by the caller from the <video>
 * element's `currentTime` rather than by a timer running alongside playback. That is the whole
 * reason `t` is stored per sample: rewind, scrub and pause all work for free, because position is a
 * function of playback time instead of something animated next to it.
 */
export function positionAt(samples: readonly TrackSample[], seconds: number): { lat: number; lng: number } | null {
  const live = samples.filter(usable).sort((a, b) => a.t - b.t);
  if (live.length === 0) return null;
  if (!finite(seconds)) return { lat: live[0]!.lat, lng: live[0]!.lng };

  // Before the first fix and after the last, hold at the end rather than extrapolating. A marker
  // that runs off the path during the lead-in is worse than one that waits.
  if (seconds <= live[0]!.t) return { lat: live[0]!.lat, lng: live[0]!.lng };
  const last = live[live.length - 1]!;
  if (seconds >= last.t) return { lat: last.lat, lng: last.lng };

  for (let i = 1; i < live.length; i += 1) {
    const b = live[i]!;
    if (b.t < seconds) continue;
    const a = live[i - 1]!;
    const span = b.t - a.t;
    // Two fixes at the same instant: take the later one rather than dividing by zero.
    const f = span > 0 ? (seconds - a.t) / span : 1;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }
  return { lat: last.lat, lng: last.lng };
}
