// lib/field/structured-note.ts — reading a field note's structured payload.
//
// C44z of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── WHY THIS IS ONE FUNCTION AND NOT TWO INLINE BLOCKS ──────────────────────────────────────────
//
// Both routes that read `fieldbook_notes.structured_data` — the per-job manifest and the per-point
// viewer — carried the same eight lines, and both were wrong in the same way. Seed 596 adds the
// column as **JSONB**, so PostgREST hands back an object that is already parsed. The code was:
//
//     if (n.structured_data) {
//       try {
//         const parsed = JSON.parse(n.structured_data);
//         …
//       } catch { /* malformed JSON — body still renders */ }
//     }
//
// `JSON.parse` stringifies its argument first, so an object becomes the literal `"[object Object]"`
// and throws. On EVERY row. The catch then swallows it, the payload comes back null, and every
// structured note in the product renders as free text with its structured table missing — which is
// indistinguishable from nobody having filed a structured note yet.
//
// The bug was unreachable until the column existed, so it would have shipped the day the migration
// landed and looked like the feature simply not being used. Two copies of it would have been fixed
// once and rediscovered later, which is the argument for the file.

/**
 * A note's structured payload, whatever form it arrives in.
 *
 * The object arm is the live case (JSONB). The string arm is kept for a row whose payload was
 * stored as text — the mobile app's local SQLite mirror has no JSON type and encodes it as a string
 * before syncing, so a row that arrives mid-migration can legitimately be either.
 *
 * A malformed payload yields `null` rather than throwing. A note whose structure cannot be read is
 * far better shown as its own free text than as an error: the text is what the surveyor typed and
 * is the part that ends up in a deliverable.
 */
export function parseStructuredNote(
  raw: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  // Arrays are objects too, and a structured payload is a record. An array here means the writer
  // sent the wrong shape, and returning it would hand the renderer numeric keys.
  if (typeof raw === 'object') return Array.isArray(raw) ? null : raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
