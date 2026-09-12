// lib/server/range.ts — HTTP byte ranges for media we buffer and serve ourselves.
//
// A browser's <audio> seek bar only knows the length of a file when the response says so. The
// Twilio recording proxy used to stream the upstream body through with no Content-Length and no
// Accept-Ranges, so the player guessed the duration as bytes trickled in and the slider crept along
// at whatever rate the download did. Serving a known length, and honouring Range requests so the
// browser can seek and probe the end of the file, is what makes the slider track real time.

export interface ByteRange {
  start: number;
  end: number; // inclusive
}

/** Parse a single `bytes=a-b` / `bytes=a-` / `bytes=-n` header against a known total size.
 *  Returns null for a missing or malformed header (serve the whole file), and 'unsatisfiable'
 *  when the range lies outside the file (answer 416). Multi-range requests are treated as
 *  malformed and served whole, which every browser accepts. */
export function parseByteRange(header: string | null | undefined, total: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (total <= 0) return 'unsatisfiable';
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix range: the last n bytes.
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total || start > end) return 'unsatisfiable';
  return { start, end };
}

/** A 200 or 206 response for `bytes`, with the headers a seekable player needs. */
export function rangeResponse(bytes: Uint8Array, rangeHeader: string | null | undefined, headers: Record<string, string>): Response {
  const total = bytes.byteLength;
  const base = { ...headers, 'accept-ranges': 'bytes' };
  const range = parseByteRange(rangeHeader, total);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${total}` } });
  }
  if (!range) {
    return new Response(bytes, { status: 200, headers: { ...base, 'content-length': String(total) } });
  }
  const slice = bytes.subarray(range.start, range.end + 1);
  return new Response(slice, {
    status: 206,
    headers: { ...base, 'content-length': String(slice.byteLength), 'content-range': `bytes ${range.start}-${range.end}/${total}` },
  });
}
