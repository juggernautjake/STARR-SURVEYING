// lib/dnd/systems/intuitive-games/builder-choices.ts — the IG Foundations builder's picks, bounded by the
// scraped level schedule and recorded in the SAME ledger `igPlanLevelUp` reads (`data.igBuild.choices`).
//
// The IG half of the owner's report ("we shouldn't be able to give 10 different feats to a character at
// level 2"), and IG was the worst of the three: `IGCharacterBuilder` renders flat `Chips` multi-selects over
// the ENTIRE catalog — every stance, every power, every feat, every weapon type — with an unbounded
// `toggle()` and no notion of level at all. Meanwhile `IG_LEVEL_SCHEDULE`, scraped verbatim from Brendan's
// site, says exactly what each level grants: one feat per level (general on even, combat on odd), a
// subclass power at 3/5/7/9, a unique power at 6, specialization at 4, greater specialization at 8.
//
// WHAT IS AND ISN'T DERIVABLE HERE — this matters, because Ground Rule 3 says omit a number rather than
// guess one:
//
//   · POWERS are exact. The site states "Subclass — choose one at level 1, granting a single class power of
//     your choice" (content.ts), and the schedule carries every later power gain. So the budget is
//     1 + (power gains at levels 2..N).
//   · FEATS are exact from level 2 up (one per level), but the schedule starts at 2 — level 1 is the base
//     build, and `levelup.ts` describes it as including "starting feats" WITHOUT saying how many. Our scrape
//     does not quantify it. So the feat budget allows exactly ONE level-1 feat on top of the schedule, and
//     that single allowance is the only unverified number in this file. It errs PERMISSIVE on purpose: a cap
//     that is one too generous still turns "unlimited" into a bounded list, while a cap one too tight blocks
//     a legal build, and blocking a legal pick is the worse failure. Confirming the real number with the
//     owner is tracked in the slot plan (S5's open question).
import { igLevelBreakdown, type IGGainKind, type IGRecordedChoice } from './levelup';
import type { SlotException } from '../../slots/entitlement';
import { normName, exceptionIndex, mergeOnRebuild } from '../../slots/rebuild';


/** One choice the schedule owes: the level that grants it and what kind of thing it is. */
export interface IGSlot {
  level: number;
  kind: IGGainKind;
}

const FEAT_KINDS: IGGainKind[] = ['feat-general', 'feat-combat'];
const POWER_KINDS: IGGainKind[] = ['subclass-power', 'unique-power'];

/** Every PLAYER-CHOICE slot the schedule grants by `level` (automatic gains are not choices). */
export function igSlots(subclass: string | undefined, level: number): IGSlot[] {
  if (!subclass) return [];
  return igLevelBreakdown(subclass, level)
    .flatMap((row) => row.gains.filter((g) => g.choose).map((g) => ({ level: row.level, kind: g.kind })));
}

/**
 * How many feats the character may hold by `level`.
 *
 * **The level-1 allowance is TWO, and it is now source-verified** (intuitivegames.net/character-building,
 * read 2026-07-27): *"Each character begins with one Combat Feat and one General Feat of their choice."*
 *
 * It was `+ 1` — a deliberate guess that erred permissive because the schedule the scraper captured covers
 * levels 2–10 and describes level 1 only as including "starting feats" without a number. That made it the
 * one number in the whole slot plan that was not source-verified (recorded as Q6). Reading the guide's own
 * Feats section answers it: a level-1 IG character holds two feats, one of each kind.
 */
export function igFeatBudget(subclass: string | undefined, level: number): number {
  return igSlots(subclass, level).filter((s) => FEAT_KINDS.includes(s.kind)).length + 2;
}

/** How many powers the character may hold by `level` — 1 at level 1 (site-stated) plus later gains. */
export function igPowerBudget(subclass: string | undefined, level: number): number {
  return igSlots(subclass, level).filter((s) => POWER_KINDS.includes(s.kind)).length + 1;
}

export interface IGBuilderChoiceInput {
  subclass?: string;
  level: number;
  feats?: string[];
  powers?: string[];
  specialization?: string;
  /** Picks taken through the escape hatch (slot plan S6c), stamped onto the slot each one occupies. */
  exceptions?: SlotException[];
}

/**
 * The ledger entries implied by an IG Foundations build.
 *
 * Feats and powers fill their own kinds' slots earliest-first — the same argument as the 5e and PF2
 * modules: the builder never asks which level a pick belongs to, so this is the only mapping consistent
 * with what the player was shown, and it discards nothing.
 *
 * The level-1 pick has no schedule slot to attribute it to (the schedule starts at 2), so it is left
 * unrecorded rather than being filed against level 2 — which would tell the walker a level-2 choice was
 * made when it wasn't.
 */
export function igBuilderChoicesFor(input: IGBuilderChoiceInput): IGRecordedChoice[] {
  const level = Math.max(1, Math.min(10, Math.round(input.level || 1)));
  const slots = igSlots(input.subclass, level);
  const out: IGRecordedChoice[] = [];

  const byName = exceptionIndex(input.exceptions);
  const stamped = new Set<string>();
  const stamp = (value: string) => {
    const e = byName.get(normName(value));
    if (!e) return {};
    stamped.add(normName(value));
    return { exception: e };
  };

  const fill = (kinds: IGGainKind[], picks: string[] | undefined) => {
    const values = (picks ?? []).map((p) => (p ?? '').trim()).filter(Boolean);
    if (values.length < 2) return; // only the level-1 pick, which has no slot — see below
    const mine = slots.filter((s) => kinds.includes(s.kind));
    // The FIRST pick is always the level-1 one, and level 1 has no schedule row (the schedule starts at 2).
    // It is therefore left unrecorded rather than filed against level 2 — doing that would tell the walker a
    // level-2 choice had been made when it hadn't, and the player would silently lose that prompt. Getting
    // this wrong in my first cut is exactly what the "leaves the level-1 pick UNRECORDED" test now pins.
    const forSchedule = values.slice(1);
    mine.slice(0, forSchedule.length).forEach((s, i) => {
      out.push({ level: s.level, kind: s.kind, value: forSchedule[i], ...stamp(forSchedule[i]) });
    });
  };

  fill(FEAT_KINDS, input.feats);
  fill(POWER_KINDS, input.powers);

  const spec = (input.specialization ?? '').trim();
  if (spec) {
    const slot = slots.find((s) => s.kind === 'specialization');
    if (slot) out.push({ level: slot.level, kind: 'specialization', value: spec, ...stamp(spec) });
  }

  // Every exception that found no slot, recorded so the character cannot hold off-rules content and still
  // read "Vanilla". This path is the COMMON case in IG rather than an edge, because the level-1 picks have
  // no schedule row at all (the scraped schedule starts at level 2) and are deliberately left unrecorded
  // above — so an exception taken at level 1 would otherwise vanish entirely.
  for (const [key, e] of byName) {
    if (!stamped.has(key)) out.push({ level: e.level ?? level, kind: 'other', value: e.name, exception: e });
  }

  return out.sort((a, b) => a.level - b.level);
}

/** Fold a Foundations build's choices into the ledger — same rule as the 5e and PF2 modules. */
export function mergeIgBuilderChoices(
  existing: IGRecordedChoice[] | undefined,
  builder: IGRecordedChoice[],
  builtLevel: number,
): IGRecordedChoice[] {
  // The rebuild rule now lives in `lib/dnd/slots/rebuild.ts` — it was byte-identical in all three
  // systems, which is the evidence S3 was waiting for. What each system still owns is its own slot MODEL;
  // only the mechanical rebuild filter is shared.
  return mergeOnRebuild(existing, builder, builtLevel);
}
