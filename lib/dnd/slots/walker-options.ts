// lib/dnd/slots/walker-options.ts — what a level walker's picker OFFERS, split from what the rules ALLOW.
//
// Slot plan S6g. The escape hatch (S6a–d) only appears once the server refuses a pick, so a picker that
// silently drops the picks the server would refuse makes its own hatch unreachable. S6f found that on the
// 5e walker; the same shape was then measured on PF2 and IG, where it was worse — in both cases the picker
// offered *exactly* the set the gate accepts, so the gate could never fire from the walker at all.
//
// The rule this module encodes:
//
//   A picker decides what a player may SEE and ASK FOR. It never decides what is legal.
//   The server decides what is legal, and its refusal is what raises the hatch.
//
// So an out-of-scope pick is OFFERED, GROUPED under the one reason it is out of scope, and left
// SELECTABLE. `disabled` would be the subtle wrong answer: it explains the pick correctly and still leaves
// the hatch unreachable, which was the entire defect.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO:
//
//  1. It does not judge prerequisites, attributes, skills or held feats. A walker component knows a class
//     name and a level; the eligibility cores need the whole character. Judging with a thinner context than
//     the server is the War Caster bug from S6f — the 5e picker omitted the spellcasting flag and would
//     have printed a confident, wrong "you can't take this" on a Wizard's legal feat. A prereq failure
//     still surfaces honestly: the server refuses it and returns its own sentence.
//
//  2. It does not widen an UNBOUNDED set. PF2 carries ~500 class feats, so offering every other class's as
//     "you can't have this" would be a 500-row dropdown of refusals — S6b already ruled on that for the
//     PF2 content picker ("the hatch offers what the SEARCH surfaced, not the whole catalog"). Bounded sets
//     are widened and shown; unbounded ones stay filtered. That asymmetry is the design, not an oversight.
import { PF2_ALL_FEATS } from '@/lib/dnd/systems/pathfinder2e/data';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';
import { specializationName } from '@/lib/dnd/systems/intuitive-games/eligibility';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** A pick the picker offers but the rules do not currently allow, with the level that puts it out of reach. */
export interface OutOfReachFeat {
  name: string;
  level: number;
}

export interface PF2WalkerFeatOptions {
  /** Feats this character may take at this slot right now. */
  legal: string[];
  /** Feats of the same track/class whose LEVEL is above the character's — offered, marked, selectable. */
  higher: OutOfReachFeat[];
  /** How many out-of-reach feats were NOT listed because of `MAX_OUT_OF_REACH`. Zero for every track but
   *  ancestry today. Surfaced in the UI rather than dropped quietly — this codebase's "no silent caps"
   *  habit: a truncated list that says nothing reads as "that's all there is". */
  higherOmitted: number;
}

/** The most out-of-reach feats one group will list.
 *
 *  Measured, not guessed. At this bound the widened group costs a PF2 class slot ~40 extra rows (Fighter
 *  at level 2) and a skill slot ~23 — both comfortable. The ANCESTRY track is the outlier: it carries 121
 *  in-reach and 192 out-of-reach entries, because the walker does not know the character's ancestry and so
 *  cannot scope by it, and a 313-row dropdown is not a picker any more. Capping at the NEAREST levels keeps
 *  the feats a player is plausibly reaching for while staying usable, and `higherOmitted` says what was
 *  left out instead of pretending the list is complete. */
export const MAX_OUT_OF_REACH = 60;

/** The feats a PF2 level walker offers for one feat slot.
 *
 *  `pf2FeatEligibility`'s first refusal is the level floor ("X is a level-4 feat; this character is level
 *  2") and it was unreachable from the walker, because the picker filtered on `f.level <= choice.level`
 *  before the player could ask. Level is now SHOWN rather than enforced.
 *
 *  Class scoping stays a filter — see the unbounded-set note at the top of this file. */
export function pf2WalkerFeatOptions(track: string | undefined, level: number, className: string): PF2WalkerFeatOptions {
  const inScope = PF2_ALL_FEATS.filter(
    (f) => f.track === track && (track !== 'class' || !f.className || norm(f.className) === norm(className)),
  );
  // Feat NAMES repeat across scopes (the catalog-status tests assert only that they are unique WITHIN a
  // scope), so dedupe by name keeping the LOWEST level. That is the permissive reading, and it stops one
  // feat appearing in both groups at once — which would let a player pick the "blocked" copy of a feat
  // they can legally take and file an exception against a legal pick. A wrong flag is worse than no flag.
  const lowest = new Map<string, number>();
  for (const f of inScope) {
    const prev = lowest.get(f.name);
    if (prev == null || f.level < prev) lowest.set(f.name, f.level);
  }
  const all = [...lowest.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Nearest levels first, so a cap keeps what the player is actually reaching for; name breaks the tie so
  // the order is stable rather than dependent on catalog file order.
  const outOfReach = all
    .filter(([, lvl]) => lvl > level)
    .map(([name, lvl]) => ({ name, level: lvl }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return {
    legal: all.filter(([, lvl]) => lvl <= level).map(([name]) => name),
    higher: outOfReach.slice(0, MAX_OUT_OF_REACH),
    higherOmitted: Math.max(0, outOfReach.length - MAX_OUT_OF_REACH),
  };
}

/** The powers / specializations an IG level walker offers BEYOND this subclass's own list.
 *
 *  `/ig-levels` gates exactly two kinds — `subclass-power` and `specialization` — and `igPowerEligibility`
 *  has exactly one refusal for them: *"X is not a <subclass> power"*. The walker handed back the plan's own
 *  scoped list, so the only pick the gate can refuse was the one pick the picker would not offer. S6c built
 *  the hatch for IG's cross-subclass case specifically and nothing could reach it.
 *
 *  Bounded, which is why this may be a dropdown at all: ~100 power entries across every subclass, heavily
 *  overlapping (`Aspect`, `Combat Feat`, `Inspiration` recur), so the deduped set is small.
 *
 *  It states a fact about the LIST, never a verdict on the character. That distinction is load-bearing: a
 *  power the character was legitimately GRANTED is eligible (`igPowerEligibility` returns ok for anything in
 *  `knownPowers`) and a walker does not know what the character holds. Describing the catalog is the most
 *  this can honestly say. */
export function igOtherSubclassOptions(kind: string, myOptions: readonly string[] = []): string[] {
  if (kind !== 'subclass-power' && kind !== 'specialization') return [];
  const mine = new Set<string>();
  for (const o of myOptions) {
    mine.add(norm(o));
    mine.add(norm(specializationName(o)));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of IG_CLASS_DETAILS) {
    for (const p of (kind === 'specialization' ? d.specializations : d.powers) ?? []) {
      // Dedupe on the SAME key the server compares on, so an entry differing only by its parenthetical
      // ("Dabbler (gain subclass powers from other classes)") is not offered as a second, different-looking
      // option that records the same thing.
      const key = norm(specializationName(p));
      if (!key || mine.has(key) || mine.has(norm(p)) || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out.sort();
}
