// mobile/lib/mediaPath.ts — pure file-path helpers for the field upload queue.
//
// Kept free of Expo/FileSystem imports so it's unit-testable off-device (like queueOrder /
// uploadFailureChoices). The upload queue persists a captured file to documentDirectory under a name
// ending in this extension so the OS associates the right MIME type when the drainer reads it back —
// a missing extension can leave the re-read guessing.

const KNOWN: Record<string, string> = {
  jpg: '.jpg', jpeg: '.jpg', png: '.png', heic: '.heic', webp: '.webp',
  mp4: '.mp4', mov: '.mov', m4a: '.m4a', mp3: '.mp3',
};

/** The normalized file extension for a media URI, or '' when unknown. Strips any query string or
 *  fragment FIRST — a content/remote URI can arrive as "photo.jpg?token=…" or "…#frag", and the old
 *  `endsWith('.jpg')` check missed those, dropping the extension entirely. Matches on the last dot so a
 *  dotted directory ("/my.pics/photo") doesn't fool it. Case-insensitive; jpeg normalizes to .jpg. */
export function guessExtension(uri: string): string {
  const clean = (uri ?? '').split(/[?#]/)[0].toLowerCase();
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return '';
  // Reject a dot that's actually in a directory segment (no extension on the final name).
  if (clean.indexOf('/', dot) !== -1) return '';
  return KNOWN[clean.slice(dot + 1)] ?? '';
}

/** Sanitize a user-typed filename into a single safe storage-path SEGMENT. Strips path separators (so
 *  it can never inject a `/` into the object key — no traversal), replaces any other unusual character
 *  with `_`, collapses whitespace, caps the length, and falls back to 'file' when nothing survives. The
 *  caller composes the full key as `${userId}/${tag}-${id}-${name}${ext}`; because the result holds no
 *  slash, `name` is always one segment. */
export function sanitiseName(raw: string): string {
  const cleaned = (raw ?? '')
    .replace(/[/\\]+/g, '_')
    .replace(/[^A-Za-z0-9._\- ]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return cleaned || 'file';
}
