// lib/dnd/grounding.ts — system-scoped, anti-hallucination grounding for the AI character builder.
// Produces a strict instruction + a retrieved rules block for the character's chosen system so the
// agent uses ONLY that system's rules (never another system, never invented) and FLAGS anything it
// can't ground instead of guessing. For a system-ambiguous character it forbids assuming a ruleset.
import { searchSystemEntries } from './system-store';
import { SYSTEM_AMBIGUOUS, systemLabel } from './systems';
import { systemRulesBlock } from './system-rules';
import { glossaryFor, type GlossaryEntry } from './glossary';
import { FEATS_2024 } from './feats/dnd5e-2024';
import { igAllFeats } from './systems/intuitive-games/feats';
import { IG_POWERS } from './systems/intuitive-games/content';

/** Lenient glossary retrieval for GROUNDING: score each article by how many of the query keywords
 *  appear (term > alias > body), require at least one, and take the top matches. Unlike the library
 *  search (which AND-matches every word), this reliably surfaces the right article for a natural
 *  question — "how many hit points does a fighter get" pulls the Fighter article on the "fighter" hit
 *  even though the article never says the words "how many". Scoped to `system` — never leaks. */
function retrieveGlossary(system: string, keywords: string, limit: number): GlossaryEntry[] {
  const words = keywords.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return glossaryFor(system)
    .map((e) => {
      const term = e.term.toLowerCase();
      const aliases = (e.aliases ?? []).map((a) => a.toLowerCase());
      const body = `${e.short} ${e.body}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (term.includes(w)) score += 5;
        else if (aliases.some((a) => a.includes(w))) score += 4;
        else if (body.includes(w)) score += 1;
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.term.localeCompare(b.e.term))
    .slice(0, limit)
    .map((x) => x.e);
}

/** The minimal shape the feat grounding block needs — name, a display category, and the full benefit
 *  text. Both the 2024 `Feat` registry and IG's `IGFeat` (effect → benefit) map onto this, so a system
 *  with its own feat corpus can be grounded without forcing it into another system's feat type. */
interface GroundableFeat { name: string; category: string; benefit: string }

/** Feats a full registry can ground the AI on, system-scoped. 2024 has a structured registry; IG has
 *  its 151-feat catalog (`igAllFeats`, effect text per feat). Other systems have no feat corpus yet.
 *  Why this matters: the always-on IG rules block lists feats by NAME only (151 full effects would bloat
 *  every prompt), so the ONLY path that puts an IG feat's EFFECT text in front of the AI is this
 *  query-scoped retrieval — without it, "how does the IG Toughness feat work?" grounds on nothing. */
function groundingFeats(system: string): GroundableFeat[] {
  if (system === 'dnd5e-2024') return FEATS_2024;
  if (system === 'intuitive-games') {
    return igAllFeats().map((f) => ({ name: f.name, category: f.category, benefit: f.effect }));
  }
  return [];
}

/** The feats whose NAME matches a keyword in the query — so "what does tavern brawler do" grounds on
 *  the real Tavern Brawler text. Name-only match keeps it precise (a feat body mentions many words). */
function matchFeats(system: string, keywords: string, limit: number): GroundableFeat[] {
  const words = keywords.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return groundingFeats(system)
    .filter((f) => { const n = f.name.toLowerCase(); return words.some((w) => n.includes(w)); })
    .slice(0, limit);
}

/** The IG powers/spells whose NAME matches a keyword — the power counterpart of matchFeats. The always-on
 *  IG rules block lists power NAMES only (full effects would bloat every prompt), so — exactly like feats —
 *  this query-scoped retrieval is the ONLY path that puts an IG power's EFFECT text in front of the AI;
 *  without it "how does Elemental Blast work?" grounds on nothing. Only IG has an effect-bearing power
 *  corpus (`IG_POWERS`); a power still awaiting Brendan's text simply isn't here (never invented). */
function matchPowers(system: string, keywords: string, limit: number): { name: string; school: string; effect: string }[] {
  if (system !== 'intuitive-games') return [];
  const words = keywords.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return IG_POWERS
    .filter((p) => {
      if (!p.effect) return false; // a power still awaiting Brendan's text grounds on nothing (never invented)
      const n = p.name.toLowerCase();
      return words.some((w) => n.includes(w));
    })
    .slice(0, limit)
    .map((p) => ({ name: p.name, school: p.category ?? 'Power', effect: p.effect as string }));
}

export interface SystemGrounding {
  /** Appended to the agent's system prompt. */
  instruction: string;
  /** A user-content block of retrieved rules (may be empty). */
  block: string;
  /** How many scoped entries were retrieved. */
  matched: number;
}

// Common English stopwords + rules-question filler that carry no retrieval signal. Stripping these
// lets a natural-language question retrieve the right glossary article (the search AND-matches words).
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'how', 'what', 'when',
  'where', 'why', 'who', 'which', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'and', 'or', 'but',
  'if', 'then', 'than', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'me', 'my', 'we',
  'us', 'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must', 'have', 'has', 'had',
  'get', 'got', 'work', 'works', 'use', 'used', 'about', 'from', 'into', 'up', 'out', 'so', 'just', 'like',
  'want', 'need', 'know', 'tell', 'explain', 'mean', 'means', 'rule', 'rules',
]);

/** Reduce a question to its content words for glossary retrieval (empty string if nothing meaningful). */
export function groundingKeywords(query: string): string {
  return (query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .slice(0, 6)
    .join(' ');
}

export async function systemGroundingBlock(system: string | null | undefined, query: string): Promise<SystemGrounding> {
  const sys = system || SYSTEM_AMBIGUOUS;
  const label = systemLabel(sys);
  // The DETERMINISTIC authoritative rules block — always present, no embeddings/DB needed. This is
  // the core guarantee that the correct system's real mechanics/numbers are always in the prompt.
  const rulesBlock = systemRulesBlock(sys);

  if (!system || system === SYSTEM_AMBIGUOUS) {
    return {
      instruction:
        'This character is SYSTEM-AMBIGUOUS: do not assume any specific ruleset. Use only generic, ' +
        'edition-neutral mechanics; never import rules, feats, spells or numbers unique to a particular ' +
        'game system. If a value depends on a system, put it in `unmapped` (ask the user) rather than guessing.',
      block: rulesBlock,
      matched: 0,
    };
  }

  // Deterministic GLOSSARY retrieval — the fully-written, authoritative articles for this system that
  // best match the query (no embeddings key needed). This is where the AI gets the real rules text and
  // numbers for conditions, actions, classes, ancestries, mechanics — so it answers from the library
  // rather than from recall. Scoped to `system`, so it can never surface another system's article.
  // We strip stopwords first: the glossary search requires every word to match, so a natural-language
  // question ("what does the disengage action do") would otherwise fail on its filler words.
  const keywords = groundingKeywords(query);
  const glossaryHits = keywords ? retrieveGlossary(system, keywords, 6) : [];
  const glossaryBlock = glossaryHits.length
    ? `\n\nRELEVANT ${label} GLOSSARY ARTICLES (authoritative rules text — quote these numbers exactly):\n` +
      glossaryHits.map((g) => `## ${g.term} (${g.kind})\n${g.body}`).join('\n\n')
    : '';

  // Full feat text for the feats named in the query — so "explain Tavern Brawler" or "build a
  // character with Alert" grounds on the real 2024 benefit, not recall (2024 feats differ from 2014).
  const featHits = keywords ? matchFeats(system, keywords, 4) : [];
  const featBlock = featHits.length
    ? `\n\nRELEVANT ${label} FEATS (authoritative benefit text — use exactly):\n` +
      featHits.map((f) => `## ${f.name} (${f.category} feat)\n${f.benefit}`).join('\n\n')
    : '';

  // Full effect text for the IG powers/spells named in the query — the power counterpart of featBlock,
  // so "how does Elemental Blast work?" grounds on the real IG effect, not recall or a bare name.
  const powerHits = keywords ? matchPowers(system, keywords, 4) : [];
  const powerBlock = powerHits.length
    ? `\n\nRELEVANT ${label} POWERS (authoritative effect text — use exactly):\n` +
      powerHits.map((p) => `## ${p.name} (${p.school})\n${p.effect}`).join('\n\n')
    : '';

  // Optional semantic enhancement: scoped RAG hits (only when an embeddings key is configured). These
  // augment — never replace — the deterministic rules block above.
  const entries = await searchSystemEntries(system, query, { matchCount: 10, minSimilarity: 0.3 }).catch(() => []);
  const ragBlock = entries.length
    ? `\n\nRETRIEVED ${label} REFERENCE ENTRIES (use alongside the authoritative rules above):\n` +
      entries.map((e) => `- [${e.kind}] ${e.name}${e.source ? ` (${e.source})` : ''}: ${e.body}`).join('\n')
    : '';

  return {
    instruction:
      `This character is built for ${label}. Use ONLY ${label} rules, feats, spells, actions, weapons and ` +
      `numbers as stated in the AUTHORITATIVE RULES block. NEVER borrow mechanics from another game system, ` +
      `and NEVER invent rules or numbers. When the sources are ambiguous, missing, or conflict with ${label}, ` +
      `put the issue in \`unmapped\` (so the user is asked) rather than guessing.`,
    block: rulesBlock + glossaryBlock + featBlock + powerBlock + ragBlock,
    matched: entries.length + glossaryHits.length + featHits.length + powerHits.length,
  };
}
