import { businessJsonLd } from '@/lib/seo/business';

/**
 * The site's JSON-LD structured data.
 *
 * ── WHY THIS IS WORTH HAVING ────────────────────────────────────────────────────────────────────
 *
 * Before this component the site emitted NO structured data at all — audited 2026-08-25, zero
 * `application/ld+json` anywhere. Every fact about the business (that it is a surveying practice, in
 * Belton, licensed, reachable on this number, covering these counties) existed only as prose inside
 * React components, which a crawler has to infer rather than read.
 *
 * For a local trade whose customers search "land surveyor near me", that inference is the whole game.
 * This block states the facts outright, in the form Google's entity pipeline consumes: the knowledge
 * panel, the "provides these services" understanding, and the tie between this site and the Google
 * Business Profile for the same name, address and phone number.
 *
 * ── SERVER COMPONENT, DELIBERATELY ──────────────────────────────────────────────────────────────
 *
 * No `'use client'`. The markup must exist in the HTML that the crawler is served, not be inserted
 * afterwards by a script — the whole point is to be readable without executing anything.
 *
 * ── WHY IT IS IN THE ROOT LAYOUT ────────────────────────────────────────────────────────────────
 *
 * The same business node on every page, under one stable `@id`. That is not duplication: repeating a
 * node with a consistent `@id` is exactly how JSON-LD says "this is the same entity again", and it
 * means the business is described on whichever page a searcher actually lands on — which for paid
 * traffic is rarely the homepage.
 */
export default function StructuredData(): React.ReactElement {
  const json = JSON.stringify(businessJsonLd());

  return (
    <script
      type="application/ld+json"
      // `<` is escaped to its JSON unicode form. Every value in the graph is a compile-time constant
      // today, so nothing here is attacker-controlled — but this is the one place in the app where a
      // string is written into a script element, and the escape is what keeps that true if a value
      // ever starts coming from the database instead.
      dangerouslySetInnerHTML={{ __html: json.replace(/</g, '\\u003c') }}
    />
  );
}
