// lib/dnd/systems/intuitive-games/eligibility.ts — can THIS IG character take THIS content?
//
// The IG half of the vanilla-rules work (docs/planning/in-progress/IG_VANILLA_RULES_ENFORCEMENT).
// A vanilla character may only hold what its class and level grant; a custom one may hold
// anything and is flagged. This is the pure decision both the AI edit path and the builder
// consume, so they cannot disagree about what is legal.
//
// SCOPE IS DELIBERATELY NARROW. IG's content model supports two honest checks and no more:
//   · powers — `IG_CLASS_DETAILS[].powers` is a real per-subclass list.
//   · specializations — the site states they begin at level 4 (greater ones at 8).
// Everything else is NOT gated, on purpose, and each omission is a finding rather than an
// oversight:
//   · STANCES are not class-locked. A level-1 trait may be taken as "a new stance", so a
//     character legitimately holds stances beyond their class's grantedStance. Gating them would
//     refuse a choice the rules grant.
//   · FEAT PREREQUISITES are free English prose in feats.ts, unparseable without inventing
//     structure the source doesn't have.
//   · The PER-LEVEL power schedule is summarised on the site, never published as a table.
//
// FAILS OPEN, unlike its 5e sibling. A 5e class list is complete, so a missing class means bad
// input and refusing is right. IG's parent classes (Fighter, Conduit) genuinely carry no `powers`
// list — the site documents specifics on the subclasses — so absence of data here means "cannot
// judge", never "refuse". Failing closed would block every power for anyone who hasn't picked a
// subclass yet, which is worse than the permissiveness this exists to remove.
import { IG_CLASS_DETAILS, findIGClassDetail } from './content';

export interface IGEligibilityContext {
  /** The character's class (may be a parent class like Fighter, or empty). */
  className: string;
  /** The chosen subclass, where the real power list usually lives. */
  subclass?: string;
  level: number;
  /** Specializations the character already holds — `Dabbler` widens the legal power set. */
  specializations?: string[];
  /** Powers already on the sheet: whatever granted them was legitimate, so they must not start
   *  reading as illegal on the next look. */
  knownPowers?: string[];
}

export interface IGEligibility {
  ok: boolean;
  reason?: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Specializations are stored with a prose gloss — "Dabbler (gain subclass powers from other
 *  classes)". The name is everything before the parenthetical. */
export function specializationName(entry: string): string {
  const i = entry.indexOf('(');
  return (i === -1 ? entry : entry.slice(0, i)).trim();
}

/** The class detail for a character: the SUBCLASS's entry when it has one (that is where the real
 *  power lists live), else the parent class's. */
function detailsFor(ctx: IGEligibilityContext): { own?: ReturnType<typeof findIGClassDetail>; parent?: ReturnType<typeof findIGClassDetail> } {
  const own = findIGClassDetail(ctx.subclass) ?? findIGClassDetail(ctx.className);
  // "subclass of Fighter" → Fighter. A subclass inherits its parent's starting power (the site
  // says so explicitly: "Elemental Blast (inherited from Wizard)").
  const parentName = own?.classification?.replace(/^subclass of\s+/i, '');
  const parent = parentName && norm(parentName) !== norm(own?.name) ? findIGClassDetail(parentName) : undefined;
  return { own, parent };
}

/** Does the character hold Dabbler — the Freebooter specialization that reads, verbatim, "gain
 *  subclass powers from other classes"? That is a RULE, not a loophole: a Dabbler with off-list
 *  powers is playing correctly, and a gate that refused them would be wrong. */
export function hasDabbler(ctx: IGEligibilityContext): boolean {
  return (ctx.specializations ?? []).some((s) => norm(specializationName(s)) === 'dabbler');
}

/** The power names a character may legitimately take. */
function legalPowers(ctx: IGEligibilityContext): Set<string> | null {
  const { own, parent } = detailsFor(ctx);
  const names: string[] = [];
  for (const d of [own, parent]) {
    if (!d) continue;
    names.push(...(d.powers ?? []));
    // The starting power is granted by the class even though it isn't in `powers`. It is stored
    // as prose ("Elemental Blast — a 2-action ranged attack…"), so take the part before the dash.
    if (d.startingPower) names.push(d.startingPower.split('—')[0].split('(')[0].trim());
  }
  // No list anywhere → cannot judge (see the fail-open note at the top).
  if (names.length === 0) return null;

  // Dabbler widens the set to every class's powers rather than removing the check entirely, so a
  // Dabbler still can't hold something that is not a class power at all.
  if (hasDabbler(ctx)) {
    for (const d of IG_CLASS_DETAILS) names.push(...(d.powers ?? []));
  }
  return new Set(names.map(norm));
}

/** May this character take this class power? */
export function igPowerEligibility(power: string, ctx: IGEligibilityContext): IGEligibility {
  const name = norm(power);
  if (!name) return { ok: false, reason: 'No power named.' };

  // Already held — whatever granted it was legitimate.
  if ((ctx.knownPowers ?? []).some((p) => norm(p) === name)) return { ok: true };

  const legal = legalPowers(ctx);
  if (legal === null) return { ok: true }; // no data to judge against

  if (!legal.has(name)) {
    const who = ctx.subclass?.trim() || ctx.className?.trim() || 'this character';
    return { ok: false, reason: `${power} is not a ${who} power.` };
  }
  return { ok: true };
}

/** May this character take this specialization? Two conditions: it belongs to their class, and
 *  they are level 4 (IG_PROGRESSION_NOTE: "Specializations begin at Level 4"). */
export function igSpecializationEligibility(spec: string, ctx: IGEligibilityContext): IGEligibility {
  const name = norm(specializationName(spec));
  if (!name) return { ok: false, reason: 'No specialization named.' };

  if (ctx.level < 4) {
    return { ok: false, reason: `Specializations begin at level 4; this character is level ${ctx.level}.` };
  }

  const { own, parent } = detailsFor(ctx);
  const list = [...(own?.specializations ?? []), ...(parent?.specializations ?? [])];
  if (list.length === 0) return { ok: true }; // no data to judge against

  const legal = new Set(list.map((s) => norm(specializationName(s))));
  if (!legal.has(name)) {
    const who = ctx.subclass?.trim() || ctx.className?.trim() || 'this character';
    return { ok: false, reason: `${specializationName(spec)} is not a ${who} specialization.` };
  }
  return { ok: true };
}
