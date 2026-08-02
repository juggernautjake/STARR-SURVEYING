// lib/voice/upload-rules.ts — what a client is allowed to attach to an inquiry.
//
// Pure functions, in lib/ rather than in the route, for the reason recorded in lib/voice/slug.ts: a
// Next route file may export ONLY its HTTP handlers and a fixed set of segment-config values, and
// `npm run build` fails on any other export with a type error the dev server never surfaces.
//
// They also belong here on their own merits — these are the rules that decide whether a stranger's
// file is accepted, so they are worth being able to unit-test without spinning up a request.

/** Scripts and reference audio only.
 *
 *  Deliberately short. No images (there is no reason to send a photograph with a voice-over brief, and
 *  image parsers are a classic exploit surface) and no archives (a zip is a way to smuggle anything
 *  past an extension check). */
export const ALLOWED_UPLOADS: { ext: string; mimes: string[] }[] = [
  { ext: 'pdf', mimes: ['application/pdf'] },
  { ext: 'txt', mimes: ['text/plain'] },
  { ext: 'rtf', mimes: ['application/rtf', 'text/rtf'] },
  { ext: 'doc', mimes: ['application/msword'] },
  { ext: 'docx', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { ext: 'odt', mimes: ['application/vnd.oasis.opendocument.text'] },
  { ext: 'md', mimes: ['text/markdown', 'text/plain'] },
  { ext: 'csv', mimes: ['text/csv', 'text/plain'] },
  // "Here is the read we liked" — common, and genuinely useful to have with a brief.
  { ext: 'mp3', mimes: ['audio/mpeg', 'audio/mp3'] },
  { ext: 'wav', mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'] },
  { ext: 'm4a', mimes: ['audio/mp4', 'audio/x-m4a'] },
];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * The extension AND the declared MIME type must both be allowlisted, and must agree.
 *
 * Neither is trustworthy alone — a browser will send `script.pdf` as `application/octet-stream`, and a
 * script can claim any MIME it likes with any name — but requiring both to line up narrows what an
 * attacker can express to almost nothing.
 *
 * An EMPTY type is accepted, because some browsers send nothing for less common extensions and the
 * extension has already had to match. Rejecting those would bounce legitimate .rtf files.
 */
export function fileTypeAllowed(name: string, mime: string): boolean {
  const entry = ALLOWED_UPLOADS.find((a) => a.ext === extensionOf(name));
  if (!entry) return false;
  if (!mime) return true;
  return entry.mimes.includes(mime.toLowerCase());
}

/**
 * A storage-safe filename.
 *
 * The ORIGINAL name is kept in the database record; this only decides the path. Directory traversal
 * (`../../`), leading dots and anything outside a conservative character set are removed — a filename
 * is attacker-controlled input and it is being used to build a path.
 */
export function safeStorageName(original: string): string {
  const ext = extensionOf(original);
  const stem =
    original
      .slice(0, original.length - (ext ? ext.length + 1 : 0))
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/^[.-]+/, '')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'file';
  return ext ? `${stem}.${ext}` : stem;
}

/** The list of accepted extensions, for a file input's `accept` attribute. */
export const UPLOAD_ACCEPT = ALLOWED_UPLOADS.map((a) => `.${a.ext}`).join(',');
