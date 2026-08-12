// lib/files/kinds.ts — file-type classification for the format filter. F3.
//
// ── WHY THIS IS ITS OWN FILE, AND IT IS NOT TIDINESS ────────────────────────────────────────────
//
// `kindOf` and `FILE_KINDS` were first written in `lib/files/server.ts` beside the search that uses
// them. The explorer is a client component and needs both — to render the filter chips and to apply
// the filter while browsing — and importing them from `server.ts` would have dragged
// `supabaseAdmin` into the client graph. That module holds the SERVICE-ROLE key.
//
// Next would very likely have failed the build rather than shipping the key, and this repo has been
// caught by exactly that shape before (a client importing `@/lib/auth` and pulling in
// `node:async_hooks`, green on tsc and tests, broken on `npm run build`). But "the bundler probably
// catches it" is not the standard to hold a credential to.
//
// So the pure half lives here with NO imports at all, and both sides use it.

export type FileKind =
  | 'image' | 'pdf' | 'document' | 'spreadsheet' | 'cad' | 'video' | 'audio' | 'other';

/**
 * Classify a file for the format filter.
 *
 * Mime FIRST, extension as the fallback — mounted rows often carry an inferred mime or none at all,
 * and a filter that silently drops everything it cannot classify is worse than one that honestly
 * calls it "other".
 */
/** This product's own drawing format, as a media type.
 *
 *  Mounted CAD drawings need it because their DISPLAY name carries no extension — they render as
 *  "26075 (408 features, 6 layers)", so the extension fallback below lands on "layers)" and
 *  classifies a drawing as "other". Found by filtering a real search for `kind=cad` and getting
 *  zero hits over three drawings that were plainly there.
 *
 *  Only the listing uses it; the download still serves `application/json`, which is what the bytes
 *  actually are. */
export const STARR_DRAWING_MIME = 'application/vnd.starr.drawing+json';

export function kindOf(mime: string | null, name: string): FileKind {
  const m = (mime ?? '').toLowerCase();
  if (m === STARR_DRAWING_MIME) return 'cad';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';

  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['m4a', 'mp3', 'wav', 'ogg', 'aac'].includes(ext)) return 'audio';
  // `.starr` is this product's own drawing format (see lib/files/mounts.ts), grouped with the CAD
  // interchange formats a surveyor would expect to find alongside it.
  if (['starr', 'dwg', 'dxf', 'dgn', 'shp', 'kml', 'kmz', 'las', 'laz'].includes(ext)) return 'cad';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'spreadsheet';
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'md'].includes(ext)) return 'document';
  return 'other';
}

/** The filter chips, in the order they are shown. Ordered by how often a surveying firm reaches for
 *  them rather than alphabetically. */
export const FILE_KINDS: Array<{ id: FileKind; label: string }> = [
  { id: 'image', label: 'Images' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'cad', label: 'Drawings & CAD' },
  { id: 'document', label: 'Documents' },
  { id: 'spreadsheet', label: 'Spreadsheets' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'other', label: 'Other' },
];
