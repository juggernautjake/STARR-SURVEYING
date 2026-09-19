// lib/jobs/file-thumbnails.ts — the rules for a generated preview, with no browser and no storage.
//
// Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
// frames for videos."
//
// Schema and the argument for it: seeds/644_job_file_thumbnails.sql. In short — the deployment has
// no PDF renderer and no video decoder, and every browser that opens the file panel already has
// both, so the first browser to need a preview makes it and posts it here. This module is the part
// of that exchange that can be reasoned about without either: what may be generated, what a
// generated image is allowed to look like, where it is stored, and when it is worth trying again.
//
// Pure. Tested in __tests__/jobs/file-thumbnails.test.ts.
import type { MediaKind } from './property-map';

export type ThumbState = 'pending' | 'ok' | 'failed' | 'unsupported';

/** 400 px on the long edge. Big enough to recognise a plat or a face on a 2× screen tile, small
 *  enough that a hundred of them is a few megabytes rather than a few hundred. */
export const THUMB_MAX_PX = 400;

/** WebP at 0.8 — about a third of the JPEG for the same eye, and every browser that can generate
 *  one of these can display one. */
export const THUMB_MIME = 'image/webp';
export const THUMB_QUALITY = 0.8;

/** A 400 px WebP is 20–60 KB; base64 adds a third. Anything past this is not a thumbnail, and the
 *  cap is what stops a bug (or a bored person with curl) writing megabytes into the bucket one
 *  "preview" at a time. */
export const THUMB_MAX_BYTES = 400 * 1024;

/** How big an image may be before it stops being allowed to serve as its own tile.
 *
 *  Owner, 2026-09-19: "All of the images seem to kind of load in at once, and the whole site is
 *  kind of frozen."
 *
 *  That was this. An image used to be handed to the panel as its own preview — the reasoning was
 *  that it is signed either way, so pointing the tile at the original "costs nothing". Signing it
 *  costs nothing. LOADING it costs everything: a tile is 104 px wide, a phone photograph is 4–12 MB
 *  and 4032 px, and a job with two hundred of them asked the browser to pull and decode well over a
 *  gigabyte to paint a contact sheet. The decode is the worse half — that happens on the main
 *  thread, which is the freeze.
 *
 *  So an image is its own thumbnail only when it is genuinely small. Past this it goes through the
 *  same queue as a PDF or a video: two at a time, and the 400 px WebP that comes out is kept for
 *  everybody afterwards. 200 KB is set where it is because the generated preview it would be
 *  replaced by is 20–60 KB — below roughly this size, generating one saves less than the round trip
 *  to fetch it costs, and above it the saving is immediate and large. */
export const IMAGE_OWN_THUMB_MAX_BYTES = 200 * 1024;

/** May this image stand in as its own tile, or does it need a real preview made?
 *
 *  Unknown size is treated as too big. The sizes come from the storage row and a null there means
 *  nobody recorded one; assuming "small" would restore exactly the bug this exists to fix, and the
 *  cost of being wrong the other way is one 400 px WebP that did not need to be made. */
export function imageIsItsOwnThumb(kind: MediaKind, sizeBytes: number | null | undefined): boolean {
  if (kind !== 'image') return false;
  const n = Number(sizeBytes);
  return Number.isFinite(n) && n > 0 && n <= IMAGE_OWN_THUMB_MAX_BYTES;
}

/** Which kinds a browser can actually make a preview of.
 *
 *  Audio has no frame to grab — a waveform would have to be invented, and an icon that says "voice
 *  note" is more honest than a picture of one. Documents are PDFs here; a .docx or a .dwg has no
 *  renderer in the browser either, so those are decided by MIME rather than by kind. */
export function canGenerateThumb(kind: MediaKind, mime: string | null | undefined, name?: string | null): boolean {
  if (kind === 'image' || kind === 'video') return true;
  if (kind === 'audio') return false;
  const m = (mime ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();
  return m === 'application/pdf' || n.endsWith('.pdf');
}

/** The state a file that can never have a preview should be parked in, so the queue stops asking. */
export function initialThumbState(kind: MediaKind, mime: string | null | undefined, name?: string | null): ThumbState {
  return canGenerateThumb(kind, mime, name) ? 'pending' : 'unsupported';
}

/** Is it worth a browser's time to try this one? */
export function needsThumb(state: string | null | undefined, kind: MediaKind, mime: string | null | undefined, name?: string | null): boolean {
  if (!canGenerateThumb(kind, mime, name)) return false;
  return (state ?? 'pending') === 'pending';
}

/** Where a preview lives: beside the files it previews, under a prefix nothing else writes to, keyed
 *  by the file's own id so one file can only ever have one. */
export function thumbStoragePath(fileId: string): string {
  const safe = (fileId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (safe.length < 8) throw new Error('A thumbnail needs the file id it belongs to.');
  return `thumbs/${safe}.webp`;
}

export interface DecodedThumb {
  bytes: Uint8Array;
  contentType: string;
}

/** Take the `data:` URL a canvas produced and turn it into bytes, refusing anything that is not a
 *  small raster image.
 *
 *  This is the untrusted edge of the feature: the browser is asked for a picture and could send
 *  anything at all. So the type is checked against a list rather than trusted, the size is capped
 *  before the decode rather than after, and an SVG — which is a document that can fetch and script,
 *  not an image — is refused outright even though a canvas would never produce one. */
export function decodeThumbDataUrl(dataUrl: string | null | undefined, maxBytes = THUMB_MAX_BYTES): DecodedThumb | { error: string } {
  const raw = (dataUrl ?? '').trim();
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!m) return { error: 'A thumbnail must be a base64 data URL.' };
  const contentType = m[1]!.toLowerCase();
  if (!['image/webp', 'image/jpeg', 'image/png'].includes(contentType)) {
    return { error: 'A thumbnail must be a WebP, JPEG or PNG image.' };
  }
  const base64 = m[2]!.replace(/\s+/g, '');
  // 4 base64 characters carry 3 bytes; checked before decoding so an enormous payload is refused
  // without ever being held in memory as bytes.
  if (Math.floor((base64.length * 3) / 4) > maxBytes) {
    return { error: `A thumbnail must be under ${Math.round(maxBytes / 1024)} KB.` };
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    if (bytes.byteLength === 0) return { error: 'That thumbnail was empty.' };
    if (bytes.byteLength > maxBytes) return { error: `A thumbnail must be under ${Math.round(maxBytes / 1024)} KB.` };
    return { bytes, contentType };
  } catch {
    return { error: 'That thumbnail could not be decoded.' };
  }
}

/** The size a canvas should be scaled to: the long edge at THUMB_MAX_PX, never scaled UP — a 120 px
 *  scan blown up to 400 is a blurrier file for no more information. */
export function thumbSize(width: number, height: number, max = THUMB_MAX_PX): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Where in a video to grab the poster from.
 *
 *  Not frame zero: the first frame of a phone video is very often the lens still adjusting, a black
 *  frame, or somebody's boot. A little way in is almost always a picture of the thing they were
 *  filming — but never past the end of a very short clip. */
export function posterTime(durationSeconds: number | null | undefined): number {
  const d = Number(durationSeconds);
  if (!Number.isFinite(d) || d <= 0) return 0.1;
  if (d < 1) return Math.max(0, d / 2);
  return Math.min(1.5, d * 0.1);
}
