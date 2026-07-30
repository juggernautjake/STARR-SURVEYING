// lib/dnd/conditions/annotate.ts — find the conditions named in a piece of rules prose.
//
// OWNER, 2026-07-30: *"On all character sheets and spells and feats and abilities and weapons and all
// beast/creature stat blocks, please make sure that whenever there is a condition mentioned … it is bold
// and in a slightly different colour so that the user can hover over it and a tooltip will give him the
// information about that condition. Like, if a spell makes enemies sick 1, then it should have a tooltip
// that says exactly what sickness 1 does, and same for sickness 2."*
//
// ── PURE, AND SYSTEM-SCOPED ──────────────────────────────────────────────────────────────────────────
//
// The matching is the part with bugs in it, so it lives here with no DOM and no React: given prose and a
// system, return the segments. The renderer is then a loop.
//
// SYSTEM-SCOPED is not a detail. "Frightened" is a −2 to everything in Pathfinder, disadvantage while the
// source is in sight in 5e, and a flat −2 in Intuitive Games. A tooltip that answered with the wrong
// system's rule would be worse than no tooltip, because a reader would act on it — this is Ground Rule 1
// (no cross-system bleed) applied to explanation rather than to mechanics.
//
// ── VALUED CONDITIONS ARE THE POINT ──────────────────────────────────────────────────────────────────
//
// Pathfinder's conditions carry a number — *sickened 1*, *frightened 3* — and the owner asked for those
// specifically. So a match captures its value, and the tooltip states what THAT value does rather than
// what the condition does in general. An annotator that highlighted the word and dropped the number would
// answer the easy half of the question.
import { CONDITION_MECHANICS_5E } from './dnd5e';
import { PF2_CONDITION_MECHANICS } from './pathfinder2e';
import { IG_CONDITIONS } from '../systems/intuitive-games/content';

export interface ConditionInfo {
  /** As printed, e.g. `Frightened`. */
  name: string;
  /** The rules text a reader needs. */
  note: string;
  /** True when the condition takes a numeric value (Pathfinder's status conditions). */
  valued: boolean;
  /** A worked example, where the system's data carries one (5e does). */
  example?: string;
}

/**
 * Every condition a system names, with its rules text.
 *
 * Built from the SAME data the sheets already fold into rolls — `CONDITION_MECHANICS_5E`,
 * `PF2_CONDITION_MECHANICS`, `IG_CONDITIONS` — rather than a prose copy written for tooltips. A second
 * copy would drift, and the drift would be invisible: the tooltip would keep explaining a rule the sheet
 * had stopped applying.
 */
export function conditionGlossaryFor(system: string | null | undefined): ConditionInfo[] {
  switch (system) {
    case 'dnd5e-2014':
    case 'dnd5e-2024':
      return CONDITION_MECHANICS_5E.map((c) => ({
        name: c.name, note: c.note, valued: false, example: c.example,
      }));
    case 'pathfinder2e':
      return PF2_CONDITION_MECHANICS.map((c) => ({ name: c.name, note: c.note, valued: c.valued }));
    case 'intuitive-games':
      return IG_CONDITIONS.map((c) => ({ name: c.name, note: c.effect ?? '', valued: false }));
    default:
      return [];
  }
}

export interface ConditionMatch {
  /** The exact text matched, as it appeared — so the rendered word keeps the author's capitalisation. */
  text: string;
  info: ConditionInfo;
  /** The number that followed a valued condition, when there was one. */
  value?: number;
}

export type Segment = { text: string } | ({ text: string } & ConditionMatch);

export const isMatch = (s: Segment): s is { text: string } & ConditionMatch => 'info' in s;

/** Regex-escape, since condition names contain a hyphen (`Off-Guard`). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split prose into plain and condition-bearing segments.
 *
 * LONGEST NAME FIRST. `Off-Guard` must win over any shorter name it contains, and in general a two-word
 * condition has to be tried before a one-word one — otherwise the first half matches, the second half is
 * left as plain text, and the tooltip explains the wrong rule.
 *
 * WORD-BOUNDED, so `Prone` does not fire inside `Pronetown` and — the one that actually matters —
 * `Blinded` does not fire inside `Blindedness`. The trailing boundary is checked after the optional value
 * so `sickened 12` is read as the number 12 rather than as a 1 with a stray 2.
 */
export function annotateConditions(text: string, system: string | null | undefined): Segment[] {
  const glossary = conditionGlossaryFor(system);
  if (!text || !glossary.length) return text ? [{ text }] : [];

  const byLength = [...glossary].sort((a, b) => b.name.length - a.name.length);
  // One alternation over every name, so the scan is a single pass rather than one pass per condition —
  // a stat block entry can be a paragraph and a creature page renders dozens of them.
  const pattern = new RegExp(
    `\\b(${byLength.map((c) => esc(c.name)).join('|')})\\b(?:\\s+(\\d+)\\b)?`,
    'gi',
  );
  const lookup = new Map(glossary.map((c) => [c.name.toLowerCase(), c]));

  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const info = lookup.get(m[1].toLowerCase());
    if (!info) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });

    // The value belongs to the match ONLY when the condition takes one. "Blinded 3 creatures" is a count
    // of creatures, not a Blinded 3 — reading it as a value would both mis-explain the rule and eat the
    // number out of the sentence.
    const value = info.valued && m[2] ? Number(m[2]) : undefined;
    const matched = value !== undefined ? `${m[1]} ${m[2]}` : m[1];
    out.push({ text: matched, info, ...(value !== undefined ? { value } : {}) });
    last = at + matched.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * The tooltip body for one match.
 *
 * States what THIS value does when the condition is valued, because that is what was asked for: a reader
 * looking at *sickened 2* wants the −2, not a sentence containing the phrase "equal to its value".
 */
export function conditionTooltip(m: ConditionMatch): string {
  const head = m.value !== undefined ? `${m.info.name} ${m.value}` : m.info.name;
  const valueLine = m.value !== undefined
    ? ` At ${m.value}, that is a penalty of −${m.value}.`
    : '';
  return `${head} — ${m.info.note}${valueLine}${m.info.example ? `\n\nExample: ${m.info.example}` : ''}`;
}
