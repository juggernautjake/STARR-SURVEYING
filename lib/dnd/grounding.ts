// lib/dnd/grounding.ts — system-scoped, anti-hallucination grounding for the AI character builder.
// Produces a strict instruction + a retrieved rules block for the character's chosen system so the
// agent uses ONLY that system's rules (never another system, never invented) and FLAGS anything it
// can't ground instead of guessing. For a system-ambiguous character it forbids assuming a ruleset.
import { searchSystemEntries } from './system-store';
import { SYSTEM_AMBIGUOUS, systemLabel, normalizeSystem } from './systems';
import { systemRulesBlock } from './system-rules';
import { glossaryFor, type GlossaryEntry } from './glossary';
import { FEATS_2024 } from './feats/dnd5e-2024';
import { FEATS_2014 } from './feats/dnd5e-2014';
import { igAllFeats } from './systems/intuitive-games/feats';
import { IG_POWERS, IG_DEFENSIVE_POWERS, IG_CLASS_POWER_EFFECTS } from './systems/intuitive-games/content';
import { igSpellTiers } from './systems/intuitive-games/spell-tiers';
import { homebrewGrounding } from './homebrew/projection';
import { HOMEBREW_SEEDS } from './homebrew/seeds';
import { IG_CLASS_TAXONOMY } from './systems/intuitive-games/taxonomy';
import { spellsForSystem, type SpellDef } from './spells';
import { tagsForSpell } from './library-tags';
import { spellMechanicsFor, type SpellMechanic } from './spells/mechanics';
import { COMPANION_RULE_SETS, type CompanionRuleSet } from './companions/dnd5e-2024';
import { CONDITION_MECHANICS_5E, type ConditionMechanics } from './conditions/dnd5e';

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
  // 2014 feats are a DIFFERENT shape (Feat2014) — they have no origin/general/fighting-style
  // tracks, because those are a 2024 structure. Adapted here rather than widening either type,
  // which is what would let a 2024 concept leak into a 2014 answer (Ground Rule 1/2).
  //
  // `category` is reported as the single legal 2014 slot, so the AI grounding says something TRUE
  // about how a 2014 character actually gains a feat: instead of an Ability Score Improvement.
  if (system === 'dnd5e-2014') {
    return FEATS_2014.map((f) => ({
      name: f.name,
      category: 'taken instead of an Ability Score Improvement',
      benefit: f.benefit,
    }));
  }
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

/** The 5e spells whose NAME matches a keyword in the query. Goes through the spell DISPATCHER, so a
 *  2014 sheet retrieves nothing rather than 2024 data — several spells changed materially between
 *  editions, and answering a 2014 question with 2024 numbers is the quiet-wrongness this scoping exists
 *  to prevent. Name-only match, like matchFeats: a spell summary mentions many incidental words. */
function matchSpells(system: string, keywords: string, limit: number): SpellDef[] {
  const words = keywords.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return spellsForSystem(system)
    .filter((s) => nameMatchesWords(s.name, words))
    .slice(0, limit);
}

/** Whether a query word matches a WORD of the name — not a substring of it.
 *
 *  Plain `name.includes(word)` looks fine until "who is the king of the realm" retrieves
 *  Shoc-KING Grasp, and the AI is handed a spell nobody asked about. Matching on word
 *  boundaries (with a prefix allowance so "hunters" still finds "Hunter's Mark") keeps the
 *  retrieval precise, which matters more here than recall: a spurious spell in the prompt is
 *  an invitation to answer the wrong question confidently. */
function nameMatchesWords(name: string, words: string[]): boolean {
  const nameWords = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((w) =>
    nameWords.some((n) => n === w || (w.length >= 4 && n.startsWith(w)) || (n.length >= 4 && w.startsWith(n))),
  );
}

/** The spellcasting-machinery explainers relevant to the query. Unlike spells this matches on the
 *  TITLE AND the topic, because the question is phrased as a concept ("how does concentration work",
 *  "what's my save DC") rather than as a proper noun.
 *
 *  Both 5e editions are served, each from its OWN explainer set via `spellMechanicsFor` — a 2014
 *  sheet gets 2014's five area shapes and its per-class ritual rules, never 2024's. Any other
 *  system gets an empty list from the dispatcher, so the guard that used to live here as an
 *  explicit `system !== 'dnd5e-2024'` check is now the dispatcher's default arm. */
function matchSpellMechanics(system: string, keywords: string, limit: number): SpellMechanic[] {
  const words = keywords.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return spellMechanicsFor(system)
    .map((m) => {
      const hay = `${m.title} ${m.topic} ${m.key.replace(/-/g, ' ')}`.toLowerCase();
      return { m, score: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

/** Familiar / steed / companion rule sets matching the query. 5e 2024 only. */
function matchCompanions(system: string, keywords: string, limit: number): CompanionRuleSet[] {
  if (system !== 'dnd5e-2024') return [];
  const words = keywords.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return COMPANION_RULE_SETS
    .filter((c) => {
      const hay = `${c.name} ${c.grantedBy} ${c.kind.replace(/-/g, ' ')}`.toLowerCase();
      return words.some((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/** Conditions named in the query, carrying their worked example. Both 5e editions share the
 *  condition list, and the modelled disadvantage/advantage parts are identical across them. */
function matchConditionExamples(system: string, keywords: string, limit: number): ConditionMechanics[] {
  if (system !== 'dnd5e-2024' && system !== 'dnd5e-2014') return [];
  const words = keywords.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return CONDITION_MECHANICS_5E
    .filter((c) => nameMatchesWords(c.name, words))
    .slice(0, limit);
}

/** The IG powers/spells whose NAME matches a keyword — the power counterpart of matchFeats. The always-on
 *  IG rules block lists power NAMES only (full effects would bloat every prompt), so — exactly like feats —
 *  this query-scoped retrieval is the ONLY path that puts an IG power's EFFECT text in front of the AI;
 *  without it "how does Elemental Blast work?" grounds on nothing. Covers BOTH the school powers/spells
 *  (`IG_POWERS`) and the 6 defensive powers (`IG_DEFENSIVE_POWERS`) — a defensive power is a reaction the AI
 *  must equally be able to explain ("how does my Sidestep work?"), and it too is name-only in the block.
 *  Only IG has an effect-bearing power corpus; a power still awaiting Brendan's text isn't here (never invented). */
function matchPowers(system: string, keywords: string, limit: number): { name: string; school: string; effect: string }[] {
  if (system !== 'intuitive-games') return [];
  const words = keywords.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const corpus = [
    ...IG_POWERS.map((p) => {
      // Append the scraped Advanced/Expert tiers (A19) so "how does <spell> work at expert?" grounds on the
      // full progression, not just the base Description. A power without captured tiers is unchanged.
      const tiers = igSpellTiers(p.name);
      const effect = tiers
        ? `${p.effect}${tiers.advanced ? ` Advanced: ${tiers.advanced}` : ''}${tiers.expert ? ` Expert: ${tiers.expert}` : ''}`
        : p.effect;
      return { name: p.name, school: p.category ?? 'Power', effect };
    }),
    ...IG_DEFENSIVE_POWERS.map((p) => ({ name: p.name, school: 'Defensive Power', effect: p.effect })),
    // Class powers/specializations (Surge, Challenge, Aspect, Magical Healing, …) — so "how does my Surge
    // work?" grounds on the scraped effect text, not nothing. Name-only class powers never reach here.
    ...Object.entries(IG_CLASS_POWER_EFFECTS).map(([name, effect]) => ({ name, school: 'Class Power', effect })),
  ];
  return corpus
    .filter((p) => {
      if (!p.effect) return false; // a power still awaiting Brendan's text grounds on nothing (never invented)
      const n = p.name.toLowerCase();
      return words.some((w) => n.includes(w));
    })
    .slice(0, limit)
    .map((p) => ({ name: p.name, school: p.school, effect: p.effect as string }));
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
  // Normalize to an exact catalog key up front (callers pass `row.system` straight from the DB). A non-canonical
  // value — a typo, a migrated/legacy string — must resolve to AMBIGUOUS, not be trusted as a real system: else
  // the AI is told "you are <raw string>" and grounds on lookups scoped to a key nothing matches (empty rules,
  // false confidence). Every scoped lookup below uses `sys`, so a real system is unchanged and a bad one goes safe.
  const sys = normalizeSystem(system);
  const label = systemLabel(sys);
  // The DETERMINISTIC authoritative rules block — always present, no embeddings/DB needed. This is
  // the core guarantee that the correct system's real mechanics/numbers are always in the prompt.
  const rulesBlock = systemRulesBlock(sys);

  if (sys === SYSTEM_AMBIGUOUS) {
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
  const glossaryHits = keywords ? retrieveGlossary(sys, keywords, 6) : [];
  const glossaryBlock = glossaryHits.length
    ? `\n\nRELEVANT ${label} GLOSSARY ARTICLES (authoritative rules text — quote these numbers exactly):\n` +
      glossaryHits.map((g) => `## ${g.term} (${g.kind})\n${g.body}`).join('\n\n')
    : '';

  // Full feat text for the feats named in the query — so "explain Tavern Brawler" or "build a
  // character with Alert" grounds on the real 2024 benefit, not recall (2024 feats differ from 2014).
  const featHits = keywords ? matchFeats(sys, keywords, 4) : [];
  const featBlock = featHits.length
    ? `\n\nRELEVANT ${label} FEATS (authoritative benefit text — use exactly):\n` +
      featHits.map((f) => `## ${f.name} (${f.category} feat)\n${f.benefit}`).join('\n\n')
    : '';

  // Full effect text for the IG powers/spells named in the query — the power counterpart of featBlock,
  // so "how does Elemental Blast work?" grounds on the real IG effect, not recall or a bare name.
  const powerHits = keywords ? matchPowers(sys, keywords, 4) : [];
  const powerBlock = powerHits.length
    ? `\n\nRELEVANT ${label} POWERS (authoritative effect text — use exactly):\n` +
      powerHits.map((p) => `## ${p.name} (${p.school})\n${p.effect}`).join('\n\n')
    : '';

  // Full mechanical detail for 5e spells named in the query — so "how does Fireball work" or
  // "what's the range on Misty Step" answers from the catalog rather than recall. Scoped through
  // the spell dispatcher, so a 2014 sheet gets nothing here rather than 2024 data (owner 2026-07-19).
  const spellHits = keywords ? matchSpells(sys, keywords, 4) : [];
  const spellBlock = spellHits.length
    ? `\n\nRELEVANT ${label} SPELLS (authoritative mechanical detail — use exactly):\n` +
      spellHits.map((s) => {
        const tags = [s.concentration ? 'Concentration' : '', s.ritual ? 'Ritual' : ''].filter(Boolean).join(', ');
        // The derived tag keys, so the AI can answer "which of these are concentration" or
        // "show me the healing ones" by reading the same vocabulary the filters use (S9).
        const tagKeys = tagsForSpell(s).map((t) => t.key).join(' ');
        return `## ${s.name} (${s.level === 0 ? 'cantrip' : `level ${s.level}`} ${s.school})\n` +
          `Casting time: ${s.castTime} · Range: ${s.range} · Components: ${s.components}` +
          `${s.material ? ` (${s.material})` : ''} · Duration: ${s.duration}${tags ? ` · ${tags}` : ''}\n` +
          `Classes: ${s.classes.join(', ')}\n${s.summary}` +
          // `detail` carries the mechanics the 320-character summary cap could not hold (per-layer
          // destruction conditions, per-glyph save abilities). The librarian is exactly who gets
          // asked "which layer does cold destroy" — sending only the summary would have it answer
          // from a text that provably lacks the answer, which is how a confident wrong ruling gets
          // made. Only ~14 spells carry it, so the prompt cost is bounded.
          `${s.detail ? `\nFull mechanics: ${s.detail}` : ''}` +
          `${s.higher ? `\nAt higher levels: ${s.higher}` : ''}` +
          `${s.editionNote ? `\n2024 vs 2014: ${s.editionNote}` : ''}` +
          `\nTags: ${tagKeys}`;
      }).join('\n\n')
    : '';

  // How the spellcasting MACHINERY works — concentration, upcasting vs cantrip scaling, save DCs,
  // components. These are the "how does X work" questions the catalog itself can't answer, and each
  // carries a worked example so the AI can teach rather than recite.
  const mechanicHits = keywords ? matchSpellMechanics(sys, keywords, 3) : [];
  const mechanicBlock = mechanicHits.length
    ? `\n\nRELEVANT ${label} SPELLCASTING RULES (explain using these, including the example):\n` +
      mechanicHits.map((m) => `## ${m.title}\n${m.rule}\nEXAMPLE: ${m.example}` +
        `${m.gotchas?.length ? `\nWatch out: ${m.gotchas.join(' ')}` : ''}`).join('\n\n')
    : '';

  // Familiar / steed / companion rules, for "what can my familiar do" questions.
  const companionHits = keywords ? matchCompanions(sys, keywords, 2) : [];
  const companionBlock = companionHits.length
    ? `\n\nRELEVANT ${label} COMPANION RULES (authoritative — use exactly):\n` +
      companionHits.map((c) => `## ${c.name} (from ${c.grantedBy})\n${c.rules.map((r) => `- ${r}`).join('\n')}` +
        `${c.editionNote ? `\n2024 vs 2014: ${c.editionNote}` : ''}`).join('\n\n')
    : '';

  // Worked examples for any CONDITION named in the query — the note states the rule, the example
  // shows it resolving, which is what "can I still attack while Frightened?" actually needs.
  const conditionHits = keywords ? matchConditionExamples(sys, keywords, 3) : [];
  const conditionBlock = conditionHits.length
    ? `\n\nRELEVANT ${label} CONDITIONS (rule + worked example — use both):\n` +
      conditionHits.map((c) => `## ${c.name}\n${c.note}${c.example ? `\nEXAMPLE: ${c.example}` : ''}`).join('\n\n')
    : '';

  // IG class taxonomy (Area T1) — the site organises classes as 4 parents × subclasses, so the AI must build
  // an IG character as a parent class + one of ITS subclasses (never a subclass under the wrong parent).
  const taxonomyBlock = sys === 'intuitive-games'
    ? `\n\nINTUITIVE GAMES CLASS TAXONOMY (build a character as a PARENT class + one of ITS subclasses only):\n` +
      IG_CLASS_TAXONOMY.map((t) => `- ${t.parent}: ${t.subclasses.join(', ')}`).join('\n')
    : '';

  // Homebrew content available for this system (Area H2) — so the AI knows a system's community/homebrew
  // pieces exist and what they do (it may only USE them when the DM has allowed them, which the block states).
  const homebrewText = homebrewGrounding(HOMEBREW_SEEDS, sys);
  const homebrewBlock = homebrewText ? `\n\n${homebrewText}` : '';

  // Optional semantic enhancement: scoped RAG hits (only when an embeddings key is configured). These
  // augment — never replace — the deterministic rules block above.
  const entries = await searchSystemEntries(sys, query, { matchCount: 10, minSimilarity: 0.3 }).catch(() => []);
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
    block:
      rulesBlock + glossaryBlock + featBlock + powerBlock +
      spellBlock + mechanicBlock + companionBlock + conditionBlock +
      taxonomyBlock + homebrewBlock + ragBlock,
    matched:
      entries.length + glossaryHits.length + featHits.length + powerHits.length +
      spellHits.length + mechanicHits.length + companionHits.length + conditionHits.length,
  };
}
