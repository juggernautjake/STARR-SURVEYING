// lib/research/dom-fingerprint.ts
//
// §9.1 (structural layer) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Produce a stable structural fingerprint of an HTML page that
// ignores cosmetic noise (text content, random class hashes,
// whitespace, comments, scripts/styles) and captures the
// form/anchor/table skeleton + the attributes adapters actually
// depend on (`name`, `id`, `type`, `role`, `data-testid`). When the
// fingerprint diverges from the baseline captured at registration,
// the §9.1 structural layer flags the adapter — even if the
// semantic-layer canary diff (slice 7) hasn't caught up yet.
//
// Pure — no DOM, no Playwright, no deps. Works on HTML strings
// fetched by the adapter or saved snapshots in the health-check
// store.

import { createHash } from 'node:crypto';

/** The set of tags whose presence/order/attributes adapters care
 *  about. Adding a new tag here is a deliberate signal-extending
 *  move (e.g. capturing `<iframe>` for portals that embed a CAD
 *  viewer). */
const STRUCTURAL_TAGS = new Set([
  'form', 'input', 'select', 'option', 'textarea', 'button',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'nav', 'header', 'footer',
  'main', 'section', 'article', 'aside',
  'iframe',
  'label', 'fieldset',
]);

/** Attributes worth preserving — adapters key off these. Everything
 *  else (class hashes from Tailwind/CSS modules, inline styles,
 *  random `data-*` attrs, aria text, etc.) is dropped because it's
 *  too noisy. */
const STABLE_ATTRS = new Set([
  'name', 'id', 'type', 'role', 'href', 'action', 'method',
  'value', 'placeholder',
  'data-testid', 'data-cy', 'data-test', 'data-qa',
]);

export interface DomFingerprint {
  /** Hex SHA-256 of the canonical skeleton string. Stable across
   *  reformatting + class-name churn; changes when structural
   *  elements / stable attributes change. */
  hash: string;
  /** The canonicalized skeleton string itself. Surface this in the
   *  §9.8 dashboard so a reviewer can see what changed when two
   *  hashes diverge. */
  skeleton: string;
  /** How many structural elements we captured. Lets the §9.4 agent
   *  detect "page now has 0 forms" without re-parsing. */
  element_count: number;
}

/** Pure. Build the structural fingerprint of the HTML. */
export function fingerprintHtml(html: string): DomFingerprint {
  const stripped = strip(html);
  const tokens = tokenizeStructure(stripped);
  const skeleton = tokens.join('\n');
  const hash = createHash('sha256').update(skeleton).digest('hex');
  return { hash, skeleton, element_count: tokens.length };
}

export interface FingerprintDiff {
  /** True when the two hashes are identical (byte-for-byte). */
  identical: boolean;
  /** Jaccard similarity (0..1) on the multiset of skeleton tokens.
   *  1 = same structure, 0 = nothing in common. */
  similarity: number;
  /** Tokens that were present in `was` but missing from `now`. */
  removed: string[];
  /** Tokens that were present in `now` but missing from `was`. */
  added: string[];
  /** Same severity bucketing the canary diff uses so the §9.3
   *  health-check writer can stamp one consistent state across
   *  the three layers. */
  severity: 'healthy' | 'degraded' | 'broken';
}

// Severity thresholds tuned so a small portal tweak (a few elements
// added or renamed in a typical form/table-heavy page) trips
// `degraded`, while a complete redesign (or a captcha wall replacing
// the search form) trips `broken`.
const SIMILARITY_BROKEN_BELOW = 0.7;
const SIMILARITY_DEGRADED_BELOW = 0.95;

/** Pure. Compare two fingerprints' skeletons and bucket the
 *  divergence. */
export function diffFingerprints(was: DomFingerprint, now: DomFingerprint): FingerprintDiff {
  if (was.hash === now.hash) {
    return {
      identical: true,
      similarity: 1,
      removed: [],
      added: [],
      severity: 'healthy',
    };
  }

  const wasTokens = was.skeleton ? was.skeleton.split('\n') : [];
  const nowTokens = now.skeleton ? now.skeleton.split('\n') : [];
  const wasCount = countMap(wasTokens);
  const nowCount = countMap(nowTokens);
  const allKeys = new Set([...wasCount.keys(), ...nowCount.keys()]);

  let intersect = 0;
  let union = 0;
  const removed: string[] = [];
  const added: string[] = [];

  for (const k of allKeys) {
    const a = wasCount.get(k) ?? 0;
    const b = nowCount.get(k) ?? 0;
    intersect += Math.min(a, b);
    union += Math.max(a, b);
    if (a > b) removed.push(...Array(a - b).fill(k));
    else if (b > a) added.push(...Array(b - a).fill(k));
  }

  const similarity = union === 0 ? 1 : intersect / union;
  const severity: FingerprintDiff['severity'] =
    similarity < SIMILARITY_BROKEN_BELOW
      ? 'broken'
      : similarity < SIMILARITY_DEGRADED_BELOW
        ? 'degraded'
        : 'healthy';

  return { identical: false, similarity, removed, added, severity };
}

// ── Internals ────────────────────────────────────────────────────

function strip(html: string): string {
  // Drop script + style blocks first (they contain HTML-shaped text
  // that the tokenizer would otherwise pick up).
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** Sweep the HTML for opening tags of structural elements and emit
 *  a deterministic token per element. */
function tokenizeStructure(html: string): string[] {
  const tokens: string[] = [];
  const tagRe = /<\s*([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1]!.toLowerCase();
    if (!STRUCTURAL_TAGS.has(tag)) continue;
    const attrs = extractStableAttrs(m[2] ?? '');
    tokens.push(formatToken(tag, attrs));
  }
  return tokens;
}

/** Pull only the stable attributes out of a tag's attribute string,
 *  sorted alphabetically so order-of-attributes doesn't churn the
 *  hash. Drops empty values. */
function extractStableAttrs(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1]!.toLowerCase();
    if (!STABLE_ATTRS.has(name)) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    out.push([name, normalizeAttrValue(name, value)]);
  }
  out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function normalizeAttrValue(name: string, value: string): string {
  // Trim and collapse whitespace; lowercase keys + role-ish values
  // so cosmetic differences ("Submit" vs "submit") don't churn the
  // hash.
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (name === 'type' || name === 'method' || name === 'role') return trimmed.toLowerCase();
  return trimmed;
}

function formatToken(tag: string, attrs: Array<[string, string]>): string {
  if (attrs.length === 0) return tag;
  return `${tag}[${attrs.map(([k, v]) => `${k}="${v}"`).join(',')}]`;
}

function countMap(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
