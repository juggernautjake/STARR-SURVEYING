// lib/voice/slug.ts — turning a title into a URL segment.
//
// ── WHY THIS IS NOT IN THE ROUTE FILE ───────────────────────────────────────────────────────────
//
// It was, and `npm run build` refused to compile:
//
//     Type error: Type 'OmitWithTag<typeof import(".../app/api/voice/pages/route"), "GET" | "POST" | …>'
//     does not satisfy the constraint '{ [x: string]: never; }'.
//       Property 'slugify' is incompatible with index signature.
//
// A route file may export ONLY the HTTP handlers and a fixed set of segment-config values. Next
// generates a type that asserts every other export is `never`, so one exported helper fails the whole
// build. `npm run dev` never checks it, which is exactly why this class of bug reaches CI: the dev
// server compiles per-route on demand and skips the generated route-type check entirely.
//
// The general rule for this repo, learned the same way more than once: if two route files need the
// same helper, the helper goes in lib/. Never export it from one route and import it into the other.

/**
 * A lowercase, hyphenated URL segment.
 *
 * Generated from the title so Andrew never has to think about URLs, and overridable because
 * occasionally he will want to. Diacritics are decomposed and stripped rather than dropped, so
 * "Peña" becomes "pena" and not "pea".
 */
export function slugify(input: string): string {
  return (
    String(input ?? '')
      .toLowerCase()
      // NFKD splits "é" into "e" + a combining accent, which the next line removes.
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled'
  );
}
