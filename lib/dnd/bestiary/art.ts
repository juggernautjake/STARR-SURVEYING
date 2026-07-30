// lib/dnd/bestiary/art.ts — deciding what picture a creature may have (B2-3).
//
// Owner, 2026-07-29: *"You are welcome to use any artwork that is representative of the creature for their
// statblock and thumbnail."* Read as: it need not be the canonical illustration — anything that clearly
// depicts the creature is fine. Which is what makes this tractable, because the canonical illustrations
// are exactly the ones nobody can license.
//
// ── THE BOUNDARY, AND WHY IT IS IN CODE RATHER THAN IN A COMMENT ─────────────────────────────────────
//
// `/dnd` is publicly reachable by direct link, so anything shown there is published, not personal use. The
// stat blocks are CC-BY SRD text; the ILLUSTRATIONS in the published books are not licensed at all and
// there is no version of "just use them" that is not republishing someone else's art.
//
// Note the shortcut this closes: the SRD JSON carries an `image` path for all 334 creatures and those files
// serve fine. But the SRD contains no artwork — the publishing project states its CODE is MIT and the
// UNDERLYING MATERIAL is OGL 1.0a, and neither covers those PNGs. A licence we cannot state is one we
// cannot use, so `isAcceptableLicence` decides in one place instead of at each call site.
//
// What IS available is deep: public-domain natural history illustration (bears, wolves, serpents, spiders,
// raptors), public-domain mythological engraving (dragons, hydras, demons, giants), and CC-licensed
// photography — all on Wikimedia Commons with the licence attached as structured data.
//
// PURE. The fetcher lives in `scripts/fetch-creature-art.mjs`; this module decides *what to search for* and
// *what may be kept*, which are the two judgements worth arguing with and the two a test can pin.

/** What Commons tells us about a file, reduced to what the decision needs. */
export interface CandidateImage {
  title: string;
  url: string;
  descriptionUrl: string;
  /** Commons' short licence name: 'cc-by-sa-4.0', 'pd-old-100', 'cc0'. */
  licenceShortName: string | null;
  artist: string | null;
  width: number;
  height: number;
  mime: string;
}

export interface AcceptedImage {
  url: string;
  licence: string;
  attribution: string;
  sourceUrl: string;
}

// ── licences ────────────────────────────────────────────────────────────────────────────────────────
//
// ALLOWLIST, NOT A BLOCKLIST. A blocklist says yes to everything nobody thought of, which for licensing is
// the wrong default: the failure mode is publishing someone's work without permission, and the cost of a
// false negative is one creature falling back to a generated sigil.

const ACCEPTABLE = [
  /^cc0/,
  /^cc-by(-sa)?(-\d|$)/,       // cc-by-4.0, cc-by-sa-3.0, cc-by
  /^pd(-|$)/,                  // pd-old-100, pd-us, pd-art
  /^public-domain/,
  /^attribution$/,             // Commons' plain "Attribution" template
];

/** NC and ND are not acceptable: this is a public site (a commercial reading is at least arguable), and ND
 *  forbids the thumbnailing every listing does. "Fair use" and "non-free" are self-evidently out. GFDL is
 *  excluded because its attribution burden does not suit a thumbnail grid. */
const REFUSED = [/(^|-)nc(-|$)/, /(^|-)nd(-|$)/, /noncommercial/, /no-deriv/, /fair/, /non-free/, /gfdl/];

/**
 * Commons writes licence names for HUMANS, not for matching: the API returns `"CC BY-SA 4.0"`,
 * `"Public domain"`, `"CC BY 3.0"` — spaces, mixed case, inconsistent hyphenation. Matching the SPDX-style
 * `cc-by-sa-4.0` against those refuses two out of every three legitimate images, which was the state of
 * this file until a real query was run against it.
 *
 * So normalise first: lowercase, and every run of spaces/underscores becomes a single hyphen.
 */
function normaliseLicence(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

export function isAcceptableLicence(shortName: string | null | undefined): boolean {
  const s = (shortName ?? '').trim();
  if (!s) return false;                       // unstated is not permissive — it is unknown
  const n = normaliseLicence(s);
  if (REFUSED.some((r) => r.test(n))) return false;
  return ACCEPTABLE.some((r) => r.test(n));
}

/**
 * The credit line to store.
 *
 * CC-BY requires the author where one is known; public-domain files often have none, and inventing
 * "Unknown" reads as though we did not look. The Commons page is always cited, because that is where a
 * reader verifies the claim.
 */
export function attributionFor(c: CandidateImage): string {
  const licence = (c.licenceShortName ?? 'unknown').toUpperCase();
  const who = c.artist?.replace(/<[^>]*>/g, '').trim();
  return who
    ? `${who} — ${licence}, via Wikimedia Commons (${c.descriptionUrl})`
    : `${licence}, via Wikimedia Commons (${c.descriptionUrl})`;
}

/** Accept a candidate, or say why not. Returning the reason rather than a boolean is what lets the run
 *  report honest coverage (G6) instead of a silent count. */
export function acceptImage(c: CandidateImage): { ok: true; image: AcceptedImage } | { ok: false; why: string } {
  if (!/^image\/(jpeg|png|webp)$/i.test(c.mime)) return { ok: false, why: `unusable format ${c.mime}` };
  // Below this a thumbnail looks worse than the generated sigil it would replace.
  if (c.width < 200 || c.height < 200) return { ok: false, why: `too small (${c.width}×${c.height})` };
  if (!isAcceptableLicence(c.licenceShortName)) {
    return { ok: false, why: `licence not usable: ${c.licenceShortName ?? 'unstated'}` };
  }
  return {
    ok: true,
    image: {
      url: c.url,
      licence: (c.licenceShortName ?? '').toUpperCase(),
      attribution: attributionFor(c),
      sourceUrl: c.descriptionUrl,
    },
  };
}

// ── what to search for ──────────────────────────────────────────────────────────────────────────────
//
// A creature's NAME is often the wrong query. "Goblin" on Commons returns folklore illustration, which is
// fine; "Commoner" returns nothing useful at all; "Adult Red Dragon" returns nothing, while "dragon" and
// "European dragon" return engravings. And several D&D names are real animals wearing a qualifier —
// "Giant Poisonous Snake" is a snake.

/** Words that describe SIZE or AGE rather than the creature, and only get in the way of a search. */
const QUALIFIERS = /\b(adult|ancient|young|giant|greater|lesser|dire|swarm of|awakened|half|elder)\b/gi;

/**
 * Search terms for one creature, best first.
 *
 * Several are tried because Commons is uneven: the specific term is best when it hits, and the generic
 * fallback is what stops a whole type rendering as sigils. A creature with no usable hit is not a failure —
 * `sigilFor` covers it, and that is why the fallback exists.
 */
export function searchTermsFor(name: string, type?: string | null): string[] {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const stripped = clean.replace(QUALIFIERS, '').replace(/\s+/g, ' ').trim();
  const terms: string[] = [];

  const push = (t: string | undefined | null) => {
    const v = (t ?? '').trim();
    if (v && v.length > 2 && !terms.some((x) => x.toLowerCase() === v.toLowerCase())) terms.push(v);
  };

  push(clean);
  push(stripped);
  // The last word is usually the noun: "Giant Poisonous Snake" → "Snake", "Adult Red Dragon" → "Dragon".
  const head = stripped.split(/\s+/).pop();
  if (head && head.toLowerCase() !== stripped.toLowerCase()) push(head);
  // The type is the widest net, and the one that keeps a whole category from being empty.
  push(type ?? undefined);
  return terms;
}
