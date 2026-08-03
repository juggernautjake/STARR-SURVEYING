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
/**
 * Slugs a custom page must never take, because a static route owns that address and that route does
 * not read `va_pages`.
 *
 * `/AndrewAsh/<slug>` is served by a dynamic segment and Next resolves STATIC routes first. A page
 * slugged `studio` would save cleanly, appear in the studio with a link, publish without complaint —
 * and forever render the studio instead. Nothing errors anywhere in that sequence. The only symptom
 * is Andrew insisting he made a page that isn't there.
 *
 * ── WHY THE BUILT-IN PAGE SLUGS ARE *NOT* ON THIS LIST ──────────────────────────────────────────
 *
 * `about`, `coaching`, `contact`, `voice-over` and `home` also have static routes — but those routes
 * are `SystemPage`, which looks the slug up in `va_pages` and prefers Andrew's row over the built-in
 * default. That is exactly how "adopting" a built-in page works. Blocking them would break the
 * feature this list is meant to protect, so the test is not "does a route exist" but "does that route
 * read the table".
 */
export const SHADOWED_SLUGS: readonly string[] = [
  'studio',
  'login',
  'logout',
  'client',
  'invoice',
  'contract',
  'api',
  // Specified as a page prefix in an earlier draft of the plan. Costs nothing to keep clear.
  'p',
];

// `work` is deliberately absent, and the test that lists every DEFAULT_PAGES slug is what caught it
// being here. /AndrewAsh/work looks like a hardcoded project index but is a SystemPage like any
// other, so it reads this table and Andrew can adopt and rewrite it. Projects live one level deeper
// at /work/<slug>, which a page row at `work` does not touch.

/** True when a page at this slug would be shadowed by a route that never consults `va_pages`. */
export function isShadowedSlug(slug: string): boolean {
  return SHADOWED_SLUGS.includes(slug);
}

/**
 * A slug that is safe to publish at: `slugify`, then stepped past anything a static route swallows.
 *
 * Suffixes rather than rejects, because "Studio" is a reasonable thing to call a page about his
 * recording space, and refusing it outright makes Andrew guess at what the machine will accept.
 * `-page` reads as deliberate in a URL in a way that `-2` does not.
 */
export function safeSlug(input: string): string {
  const base = slugify(input);
  return isShadowedSlug(base) ? `${base}-page` : base;
}

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
