// lib/jobs/video-split.ts — when a video is too big for one object, how to cut it up.
//
// Owner, 2026-08-19: *"if it finds a video to be bigger than the limit, it cuts the video up into
// multiple videos that are within the limit automatically. There should be some kind of
// warning/notification that pops up to let the user know that the video can only be stored as
// multiple videos."*
//
// ── THE FACT THAT DICTATES THE WHOLE DESIGN ─────────────────────────────────────────────────────
//
// **You cannot split an MP4 or a MOV by cutting bytes.** The container keeps its index — the `moov`
// atom — in one place, and the samples are interleaved against it. Slice the file at an arbitrary
// offset and part 1 may play; parts 2..N are not videos at all. They upload happily, they appear in
// the gallery, and they fail to open — which is worse than refusing the upload, because the person
// believes the recording is safe.
//
// So a real split has to REMUX: read the container, and write each part as a complete file with its
// own header. That is what `lib/jobs/video-split-run.ts` does with ffmpeg (stream copy — no
// re-encoding, so no quality is lost and it runs at IO speed rather than encode speed).
//
// This module is the part that can be reasoned about without a 30 MB wasm binary: how many pieces,
// how long each one is, and what to call them. Pure, and tested in `__tests__/jobs/video-split.test.ts`.

/** A part to cut, in SECONDS. Time ranges rather than byte ranges, because a remuxer cuts on
 *  keyframes and bytes mean nothing to it. */
export interface SplitPart {
  index: number;
  /** 1-based of `total`, for the name a person reads. */
  total: number;
  startSec: number;
  /** Length of this part. The last one runs to the end, so it may be shorter. */
  durationSec: number;
  /** What the resulting file is called. */
  name: string;
}

export interface SplitPlan {
  needed: boolean;
  parts: SplitPart[];
  /** Roughly how big each part will be, for the warning the person sees before it happens. */
  approxPartBytes: number;
  reason?: string;
}

/**
 * How much of the cap to aim for.
 *
 * Cutting is keyframe-aligned, so a part never lands exactly on the requested duration — it lands
 * on the next keyframe, which can be a second or two later and therefore bigger than planned. Aim
 * at 90% so that overshoot still fits, rather than producing a "split" file that is itself over the
 * limit and refused, which would be an infuriating outcome after a long upload.
 */
export const SPLIT_TARGET_RATIO = 0.9;

/** Below this there is nothing sensible to cut — a 3-second clip is not four 0.75-second clips. */
export const MIN_PART_SECONDS = 2;

/** Add `(part 1 of 3)` before the extension, so the parts sort together and read as one recording. */
export function partName(original: string, index: number, total: number): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot) : '';
  return `${stem} (part ${index} of ${total})${ext}`;
}

/**
 * Plan the cut.
 *
 * `durationSec` comes from the browser (`<video>.duration` on a blob URL) — the only way to know how
 * long a file is without decoding it. When it is unknown or nonsense, no plan is returned rather
 * than one built on a guessed duration: a wrong duration produces parts that are still over the
 * limit, and the person would have waited through the whole thing to find out.
 */
export function planSplit(input: {
  sizeBytes: number;
  durationSec?: number | null;
  capBytes: number;
  name: string;
}): SplitPlan {
  const { sizeBytes, capBytes, name } = input;
  const duration = input.durationSec;

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { needed: false, parts: [], approxPartBytes: 0, reason: 'Unknown file size.' };
  }
  if (sizeBytes <= capBytes) {
    return { needed: false, parts: [], approxPartBytes: sizeBytes };
  }
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return {
      needed: true,
      parts: [],
      approxPartBytes: 0,
      // Named precisely, because "could not split" invites a retry that will fail the same way.
      reason: 'The length of this video could not be read, so it cannot be cut up automatically.',
    };
  }

  // Aim under the cap so keyframe overshoot still fits.
  const target = Math.max(1, Math.floor(capBytes * SPLIT_TARGET_RATIO));
  const parts = Math.ceil(sizeBytes / target);
  const partSeconds = duration / parts;

  if (partSeconds < MIN_PART_SECONDS) {
    return {
      needed: true,
      parts: [],
      approxPartBytes: 0,
      // A very short but enormous file — a high-bitrate drone clip, say. Cutting it into
      // sub-second pieces would produce something useless; saying so is more honest than doing it.
      reason: 'This video is too large to store even as short parts. Please record at a lower resolution.',
    };
  }

  const out: SplitPart[] = [];
  for (let i = 0; i < parts; i += 1) {
    const startSec = +(i * partSeconds).toFixed(3);
    // The last part runs to the end rather than to a computed boundary, so rounding can never drop
    // the final fraction of a second — the bit with the surveyor saying what they just found.
    const durationSec = i === parts - 1 ? +(duration - startSec).toFixed(3) : +partSeconds.toFixed(3);
    out.push({ index: i + 1, total: parts, startSec, durationSec, name: partName(name, i + 1, parts) });
  }

  return { needed: true, parts: out, approxPartBytes: Math.ceil(sizeBytes / parts) };
}

/** The sentence shown before anything happens, so nobody is surprised by three files appearing. */
export function describePlan(plan: SplitPlan, sizeBytes: number, capBytes: number): string {
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
  if (!plan.needed) return '';
  if (plan.parts.length === 0) return plan.reason ?? 'This video cannot be stored.';
  return (
    `This video is ${mb(sizeBytes)}, and the limit for one file is ${mb(capBytes)}. `
    + `It will be saved as ${plan.parts.length} videos of about ${mb(plan.approxPartBytes)} each, `
    + 'cut at the nearest keyframe. Nothing is re-encoded, so the quality is unchanged.'
  );
}
