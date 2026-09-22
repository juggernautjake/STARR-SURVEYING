// lib/jobs/exif-capture-server.ts — reading a photograph's GPS after it lands, and filing it.
//
// Owner, 2026-09-21: "Yes, read EXIF on upload."
//
// ── WHY THIS IS A SECOND FILE ───────────────────────────────────────────────────────────────────
//
// `./exif-capture.ts` is pure: bytes and tag objects in, an `ExifCapture` out. Every branch in it
// is testable without a database, a bucket or a session, which is why its test file is 200 lines of
// real EXIF cases and no mocks. This file is the half that touches the world — storage, the
// `job_file_captures` table, and the decision not to clobber somebody's correction.
//
// Keeping them apart is not tidiness. `readExifTags` has to handle a GPSLatitude that arrives as a
// string, as a rational triple, as a number, and as the literal 0/0 a stripped file carries; that
// belongs under a microscope, not behind a Supabase mock.
//
// ── WHY IT RUNS AFTER THE ROW, NOT DURING THE UPLOAD ────────────────────────────────────────────
//
// The bytes never pass through the API. `files/upload` hands out a signed URL and the browser PUTs
// straight to the bucket — that three-step is what makes a 90 MB drawing possible at all. So the
// first moment the server can see the file is after `POST /api/admin/jobs/files` has created the
// row, and the read is a download back out of storage.
//
// That download is why this is fire-and-forget. A photograph with no GPS is completely ordinary
// (every screenshot, every scan, everything a messaging app has stripped) and a bucket that is slow
// for a moment is not a reason to fail an upload the user has already waited for. If the read does
// not happen, the file is still filed and still openable; it simply has no position, which is the
// same state every job file was in before this existed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mightCarryExif, readCapture, asTrack } from './exif-capture';

/** What the caller knows about the object that was just filed. */
export interface CapturableFile {
  jobFileId: string;
  bucket: string;
  storagePath: string;
  mimeType?: string | null;
  fileName?: string | null;
}

/** Bigger than any photograph, smaller than the drawings and videos this must not download.
 *
 *  EXIF lives in the first few kilobytes, so in principle a ranged read would do — but Supabase's
 *  storage client has no range API, and a 60 MB RAW file is still cheap next to the 500 MB video
 *  this number actually exists to refuse. */
const MAX_READ_BYTES = 80 * 1024 * 1024;

/**
 * Read the file's own metadata and record where it says it was taken.
 *
 * Returns what it wrote, or null when there was nothing to write — no GPS in the file, a kind not
 * worth opening, an object that could not be read, or a position a person has already placed by
 * hand. None of those are errors and none of them are logged as such.
 */
export async function captureFromExif(
  client: SupabaseClient,
  file: CapturableFile,
): Promise<{ lat: number; lng: number } | null> {
  if (!mightCarryExif(file.mimeType, file.fileName)) return null;

  // ── A PERSON'S PLACEMENT WINS, ALWAYS (seeds/653) ─────────────────────────────────────────────
  //
  // `source` distinguishes 'exif' from 'manual' precisely so re-filing a photograph cannot undo a
  // correction: the camera was wrong about where it was, the surveyor was not. Checked BEFORE the
  // download, so the common case of a re-upload over a corrected pin costs nothing at all.
  const { data: existing } = await client
    .from('job_file_captures')
    .select('source')
    .eq('job_file_id', file.jobFileId)
    .maybeSingle();
  if (existing && existing.source === 'manual') return null;

  const { data: blob, error } = await client.storage.from(file.bucket).download(file.storagePath);
  if (error || !blob) return null;
  if (blob.size > MAX_READ_BYTES) return null;

  const capture = await readCapture(new Uint8Array(await blob.arrayBuffer()));
  if (!capture) return null;

  // `asTrack` so a still photograph and a walked video take the same path through the placement
  // code: `trackShape` reads a one-sample track as a `point`, which is what a photograph is.
  const { error: writeError } = await client.from('job_file_captures').upsert({
    job_file_id: file.jobFileId,
    lat: capture.lat,
    lng: capture.lng,
    accuracy_m: capture.accuracyM,
    altitude_m: capture.altitudeM,
    heading_deg: capture.headingDeg,
    captured_at: capture.capturedAt,
    device: capture.device,
    track: asTrack(capture),
    source: 'exif',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'job_file_id' });
  if (writeError) return null;

  return { lat: capture.lat, lng: capture.lng };
}
