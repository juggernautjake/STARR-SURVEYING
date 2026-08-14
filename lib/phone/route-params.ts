// lib/phone/route-params.ts — supporting the phone admin routes.
//
// `withErrorHandler` wraps a single-argument handler, so a dynamic route cannot receive Next's
// `ctx.params`. The repo's established answer — see app/api/admin/receipts/[id]/route.ts — is to
// read the segment out of the URL, which also sidesteps Next 15 making `params` a Promise.
//
// This exists so the "which segment is the id" arithmetic is written once. Counting from the end by
// hand at four call sites is how one of them ends up off by one, and an off-by-one here means a
// route that looks up the literal string "transcribe" as a UUID and reports "not found" for every
// call.

/**
 * The `[id]` segment of a phone admin route.
 *
 * `trailing` is how many fixed segments follow the id — 0 for `/calls/<id>`, 1 for
 * `/calls/<id>/transcribe`.
 *
 * Returns null rather than a wrong guess when the path is too short, so a malformed URL becomes a
 * 400 instead of a lookup against `undefined`.
 */
export function idFromPath(url: string, trailing = 0): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split('/').filter(Boolean);
  const index = segments.length - 1 - trailing;
  if (index < 0) return null;
  const value = segments[index];
  // A UUID is what every caller expects here. Refusing anything else stops a stray path from
  // reaching the database as a filter it will silently match nothing against.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
