// __tests__/dnd/pf2-path-to-perfection.test.ts — the Monk's chosen saves (P5-10b).
//
// The last of the two unblocked PF2 rules bugs. All three monk saves start expert and never move, because
// Path to Perfection (7/11/15) raises saves the PLAYER names and the class table therefore cannot say which.
// The repo's answer had been to leave the three tracks empty and record the gap — correct, and as far as it
// could go until the choice was actually collected. This slice collects it.
//
// What makes the feature worth modelling carefully rather than approximating is the THIRD step: at 15 you
// raise one of the two saves you already MASTERED. A picker offering all three lets a player build a monk
// who is legendary in a save they are only expert in — a state the rules cannot reach and the sheet cannot
// depict as wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pf2ApplyChosenSaves, pf2ChosenSaveOptions, pf2ClassProgression, PF2_SAVE_KEYS,
  PF2_CLASS_PROGRESSIONS, type PF2SaveKey,
} from '@/lib/dnd/systems/pathfinder2e/data/classes';
import { pf2PlanLevelUp, pf2SavePicks, pf2BaseSaveRanks } from '@/lib/dnd/systems/pathfinder2e/levelup';
import { assemblePF2VanillaCharacter, pf2ReprojectRanks, pf2RanksAtLevel } from '@/lib/dnd/systems/pathfinder2e/builder';

const MONK = pf2ClassProgression('Monk')!;
const base = () => pf2BaseSaveRanks(MONK);
const pick = (level: number, save: PF2SaveKey) => ({ level, save });

describe('the class table carries the steps, not a `className === "Monk"` branch', () => {
  it('the Monk has three chosen-save steps at 7, 11 and 15', () => {
    expect(MONK.chosenSaves?.map((s) => s.level)).toEqual([7, 11, 15]);
    expect(MONK.chosenSaves?.map((s) => s.rank)).toEqual(['master', 'master', 'legendary']);
  });

  it('and the three save tracks are still EMPTY, which is the point', () => {
    // If someone ever writes an increase onto one of these, the class starts asserting a choice the
    // player has not made and this whole mechanism becomes a second, disagreeing source of truth.
    expect(MONK.saves.fortitude.increases).toHaveLength(0);
    expect(MONK.saves.reflex.increases).toHaveLength(0);
    expect(MONK.saves.will.increases).toHaveLength(0);
    expect(base()).toEqual({ fortitude: 'expert', reflex: 'expert', will: 'expert' });
  });

  it('and no other class has one — this is PF2’s only chosen-save feature', () => {
    // Modelled as data so a homebrew class can copy the pattern, but the shipped catalogue has exactly one.
    const withChosen = PF2_CLASS_PROGRESSIONS.filter((c) => c.chosenSaves?.length);
    expect(withChosen.map((c) => c.className)).toEqual(['Monk']);
  });
});

describe('pf2ApplyChosenSaves', () => {
  it('an unmade choice moves nothing', () => {
    // The honest answer for a step nobody has answered. Guessing which save they meant is the one thing
    // worse than leaving it alone, because a guessed master save is invisible on the sheet.
    expect(pf2ApplyChosenSaves('Monk', 20, base(), [])).toEqual(base());
    expect(pf2ApplyChosenSaves('Monk', 20, base(), undefined)).toEqual(base());
  });

  it('applies the step the player actually made', () => {
    const r = pf2ApplyChosenSaves('Monk', 7, base(), [pick(7, 'reflex')]);
    expect(r).toEqual({ fortitude: 'expert', reflex: 'master', will: 'expert' });
  });

  it('does not apply a step above the character’s level', () => {
    // A pick can outlive the level it was made at — a character edited back down to 6 must not keep it.
    expect(pf2ApplyChosenSaves('Monk', 6, base(), [pick(7, 'reflex')])).toEqual(base());
  });

  it('the full 7/11/15 ladder', () => {
    const r = pf2ApplyChosenSaves('Monk', 15, base(), [pick(7, 'reflex'), pick(11, 'will'), pick(15, 'reflex')]);
    expect(r).toEqual({ fortitude: 'expert', reflex: 'legendary', will: 'master' });
  });

  it('REFUSES A LEGENDARY ON A SAVE THAT IS ONLY EXPERT', () => {
    // The step records `from: 'master'`, and this re-checks it at apply time rather than trusting the
    // stored pick. A ledger can go stale — change the level-7 answer and a previously legal level-15 pick
    // is suddenly sitting on an expert save. Re-checking means the ranks are always legal for the picks
    // AS THEY STAND, whatever order they arrived in.
    const r = pf2ApplyChosenSaves('Monk', 15, base(), [pick(7, 'reflex'), pick(11, 'will'), pick(15, 'fortitude')]);
    expect(r.fortitude).toBe('expert');
  });

  it('never lowers a rank, and ignores a junk save name', () => {
    const already = { fortitude: 'legendary', reflex: 'expert', will: 'expert' } as Record<PF2SaveKey, 'legendary' | 'expert'>;
    expect(pf2ApplyChosenSaves('Monk', 11, already, [pick(11, 'fortitude')]).fortitude).toBe('legendary');
    expect(pf2ApplyChosenSaves('Monk', 7, base(), [{ level: 7, save: 'charisma' as PF2SaveKey }])).toEqual(base());
  });

  it('and a class with no chosen-save steps is untouched', () => {
    expect(pf2ApplyChosenSaves('Fighter', 20, base(), [pick(7, 'reflex')])).toEqual(base());
  });
});

describe('pf2ChosenSaveOptions — the legal set, which is where the rule actually lives', () => {
  it('at 7, any of the three', () => {
    expect(pf2ChosenSaveOptions('Monk', 7, base(), []).sort()).toEqual([...PF2_SAVE_KEYS].sort());
  });

  it('at 11, the level-7 save is gone — WITHOUT a special case', () => {
    // Nothing here says "not the one you picked at 7". The step wants a save standing at EXPERT, and the
    // level-7 save is master by now, so it drops out on its own. The rule and the model are the same shape.
    expect(pf2ChosenSaveOptions('Monk', 11, base(), [pick(7, 'reflex')]).sort()).toEqual(['fortitude', 'will']);
  });

  it('at 15, ONLY the two already mastered', () => {
    const opts = pf2ChosenSaveOptions('Monk', 15, base(), [pick(7, 'reflex'), pick(11, 'will')]);
    expect(opts.sort()).toEqual(['reflex', 'will']);
    expect(opts).not.toContain('fortitude');
  });

  it('and at 15 with the earlier steps unanswered, nothing is offered', () => {
    // Better an empty picker with an explanation than three wrong options.
    expect(pf2ChosenSaveOptions('Monk', 15, base(), [])).toEqual([]);
  });

  it('re-answering an earlier step ignores that step’s own old pick', () => {
    // Changing the level-7 answer must offer all three again, not exclude the one currently recorded there.
    const opts = pf2ChosenSaveOptions('Monk', 7, base(), [pick(7, 'reflex'), pick(11, 'will')]);
    expect(opts).toContain('reflex');
    // …but `will` is master from level 11, so it is genuinely not available at expert.
    expect(opts).not.toContain('will');
  });

  it('an unknown step level yields nothing rather than everything', () => {
    expect(pf2ChosenSaveOptions('Monk', 9, base(), [])).toEqual([]);
    expect(pf2ChosenSaveOptions('Fighter', 7, base(), [])).toEqual([]);
  });
});

describe('the planner prompts for it', () => {
  it('a Monk owes a save choice at 7, 11 and 15', () => {
    const plan = pf2PlanLevelUp({ className: 'Monk', to: 15 });
    const saves = plan.outstanding.filter((o) => o.kind === 'save');
    expect(saves.map((s) => s.level)).toEqual([7, 11, 15]);
    expect(saves[0].label).toBe('Path to Perfection');
  });

  it('and the prompt CARRIES the legal options, so the picker cannot invent them', () => {
    const plan = pf2PlanLevelUp({
      className: 'Monk', to: 15,
      recorded: [
        { level: 7, kind: 'save', value: 'reflex' },
        { level: 11, kind: 'save', value: 'will' },
      ],
    });
    const at15 = plan.outstanding.find((o) => o.kind === 'save' && o.level === 15);
    expect(at15?.options?.sort()).toEqual(['reflex', 'will']);
  });

  it('an answered step stops being outstanding', () => {
    const plan = pf2PlanLevelUp({ className: 'Monk', to: 7, recorded: [{ level: 7, kind: 'save', value: 'reflex' }] });
    expect(plan.outstanding.filter((o) => o.kind === 'save')).toHaveLength(0);
  });

  it('and no other class is ever asked', () => {
    for (const c of ['Fighter', 'Wizard', 'Cleric', 'Rogue']) {
      expect(pf2PlanLevelUp({ className: c, to: 20 }).outstanding.filter((o) => o.kind === 'save'), c).toHaveLength(0);
    }
  });
});

describe('pf2SavePicks reads the ledger without trusting it', () => {
  it('keeps the three saves and drops everything else', () => {
    expect(pf2SavePicks([
      { level: 7, kind: 'save', value: 'Reflex' },      // case-insensitive
      { level: 11, kind: 'save', value: ' will ' },     // padded
      { level: 15, kind: 'save', value: 'perception' }, // not a save
      { level: 2, kind: 'feat', value: 'Dodge' },
    ])).toEqual([{ level: 7, save: 'reflex' }, { level: 11, save: 'will' }]);
  });

  it('and survives an empty or absent ledger', () => {
    expect(pf2SavePicks([])).toEqual([]);
    expect(pf2SavePicks(undefined)).toEqual([]);
  });
});

describe('the ranks actually land on the character', () => {
  it('a level-20 Monk with no picks is still expert across the board — the gap, unchanged', () => {
    const p = assemblePF2VanillaCharacter({ name: 'M', className: 'Monk', level: 20 }).pf2e;
    expect(p.saves.Fortitude.rank).toBe('expert');
    expect(p.saves.Reflex.rank).toBe('expert');
    expect(p.saves.Will.rank).toBe('expert');
  });

  it('and with the picks, the sheet reads legendary', () => {
    const p = pf2ReprojectRanks(
      assemblePF2VanillaCharacter({ name: 'M', className: 'Monk', level: 1 }).pf2e,
      15,
      [pick(7, 'reflex'), pick(11, 'will'), pick(15, 'reflex')],
    );
    expect(p.saves.Reflex.rank).toBe('legendary');
    expect(p.saves.Will.rank).toBe('master');
    expect(p.saves.Fortitude.rank).toBe('expert');
  });

  it('pf2RanksAtLevel takes them too, so the builder and the walker agree', () => {
    const r = pf2RanksAtLevel('Monk', undefined, 11, [pick(7, 'fortitude'), pick(11, 'reflex')]);
    expect(r.fortitude).toBe('master');
    expect(r.reflex).toBe('master');
    expect(r.will).toBe('expert');
  });
});

describe('the route and the picker are wired', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/pf2-levels/route.ts'), 'utf8');
  const ui = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2LevelBuilder.tsx'), 'utf8');

  it('the route accepts the new kind', () => {
    expect(route).toContain("kind !== 'save'");
    expect(route).toMatch(/if \(kind === 'save'\)/);
  });

  it('and REJECTS a value that is not one of the three saves', () => {
    // A stored non-save would satisfy the planner's prompt and then move no rank — "answered" on a sheet
    // that is silently still expert, which is the worst of the three outcomes.
    expect(route).toMatch(/PF2_SAVE_KEYS as readonly string\[\]\)\.includes\(save\)/);
  });

  it('and gates the VALUE against the legal set, not just the shape', () => {
    expect(route).toContain('pf2ChosenSaveOptions(');
    expect(route).toMatch(/legal\.includes\(choice\.value/);
    // Same escape hatch as every other refused pick: vanilla blocks, custom/DM flags.
    expect(route).toContain('canTakeAnyway: offer.offered');
  });

  it('and re-derives the ranks with the picks on commit', () => {
    expect(route).toContain('pf2ReprojectRanks(levelled, newLevel, pf2SavePicks(choices))');
  });

  it('the picker renders for a save choice and offers ONLY the plan’s options', () => {
    expect(ui).toMatch(/choice\.kind === 'save' &&/);
    expect(ui).toContain('const options = choice.options ?? [];');
  });

  it('and the walker no longer hand-copies the plan’s type', () => {
    // The copy had already drifted: widening PF2ChoiceKind left this file's union at three kinds, so the
    // new branch typechecked as unreachable and `options` did not exist here at all.
    expect(ui).toContain('export type Outstanding = PF2OutstandingChoice;');
    expect(ui).not.toMatch(/kind: 'subclass' \| 'feat' \| 'boosts';/);
  });
});
