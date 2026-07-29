// __tests__/dnd/xp-award.test.ts — awarding XP to a mixed-system party (P3-4b).
//
// P3-4 gave each character an XP value. This is the DM half: one action instead of eight edits.
//
// WHAT MAKES IT MORE THAN A LOOP is that the systems disagree about what XP is. 5e uses cumulative
// thresholds, PF2 a flat 1000/level, and **Intuitive Games has no XP table at all** — `xp.ts` says so
// plainly rather than borrowing 5e's numbers. Writing XP to an IG character would store a value nothing
// reads and no rule interprets, and it would look real. So the award is PLANNED first and reports, per
// character, what will happen — including "nothing, and here is why".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planAward, summarizeAward, type AwardTarget } from '@/lib/dnd/xp-award';
import { xpForLevel } from '@/lib/dnd/xp';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const pc = (over: Partial<AwardTarget> = {}): AwardTarget =>
  ({ id: 'c1', name: 'Vex', system: 'dnd5e-2024', xp: 0, level: 1, ...over });

describe('a single-system party', () => {
  it('adds XP to everyone', () => {
    const plan = planAward([pc({ id: 'a', name: 'Vex' }), pc({ id: 'b', name: 'Grog' })], 450);
    expect(plan.awarded).toBe(2);
    expect(plan.skipped).toBe(0);
    expect(plan.outcomes.every((o) => o.xpAfter === 450)).toBe(true);
  });

  it('and reports a level-up when a threshold is crossed', () => {
    // 300 XP is level 2 in both 5e editions.
    const plan = planAward([pc({ xp: 0, level: 1 })], 300);
    expect(plan.outcomes[0].levelAfter).toBe(2);
    expect(plan.levelUps).toHaveLength(1);
  });

  it('but not when the character was already past it', () => {
    // Compared against the level the XP ALREADY implied, not the stored level. A character whose stored
    // level lags their XP — levelled by hand, or awarded before P3-4 existed — would otherwise be reported
    // as levelling up on an award that changed nothing about their tier.
    const plan = planAward([pc({ xp: 400, level: 1 })], 10);
    expect(plan.outcomes[0].levelAfter).toBe(2);
    expect(plan.levelUps, 'they were already level 2 by XP').toHaveLength(0);
  });
});

describe('a MIXED party is the whole reason this is planned, not looped', () => {
  const party: AwardTarget[] = [
    pc({ id: 'a', name: 'Vex', system: 'dnd5e-2024' }),
    pc({ id: 'b', name: 'Amiri', system: 'pathfinder2e' }),
    pc({ id: 'c', name: 'Kesh', system: 'intuitive-games' }),
  ];

  it('awards the XP systems and SKIPS the milestone one', () => {
    const plan = planAward(party, 1000);
    expect(plan.awarded).toBe(2);
    expect(plan.skipped).toBe(1);
    const kesh = plan.outcomes.find((o) => o.name === 'Kesh')!;
    expect(kesh.applied).toBe(false);
    expect(kesh.xpAfter).toBe(kesh.xpBefore);
  });

  it('and says WHY, rather than silently doing nothing', () => {
    // A DM who is not told will assume the whole party was awarded, and the missing bar looks like a bug.
    const kesh = planAward(party, 1000).outcomes.find((o) => o.name === 'Kesh')!;
    expect(kesh.reason).toMatch(/milestone/i);
  });

  it('PF2 uses its own curve, not 5e’s', () => {
    // The SAME award lands the two characters on DIFFERENT levels, which is the property that matters: PF2
    // is a flat 1000/level, so 1000 XP is exactly level 2; 5e's thresholds are 300/900/2700, so the same
    // 1000 reaches level 3. If these two ever agree, one system is being scored on the other's table.
    const plan = planAward(party, 1000);
    expect(plan.outcomes.find((o) => o.name === 'Amiri')!.levelAfter).toBe(2);
    expect(plan.outcomes.find((o) => o.name === 'Vex')!.levelAfter).toBe(3);
    expect(xpForLevel('pathfinder2e', 2)).toBe(1000);
    expect(xpForLevel('dnd5e-2024', 3)).toBe(900);
  });
});

describe('taking XP back', () => {
  it('a negative award reduces it', () => {
    // Correcting an over-award is real, and refusing negatives would leave the DM editing sheets by hand —
    // exactly what this tool exists to replace.
    const plan = planAward([pc({ xp: 500 })], -200);
    expect(plan.outcomes[0].xpAfter).toBe(300);
  });

  it('but never below zero', () => {
    const plan = planAward([pc({ xp: 100 })], -9999);
    expect(plan.outcomes[0].xpAfter).toBe(0);
  });

  it('and the summary says "Removed", not "Awarded"', () => {
    expect(summarizeAward(planAward([pc({ xp: 500 })], -100))).toMatch(/^Removed 100 XP/);
  });
});

describe('the summary a DM reads', () => {
  it('names who levelled', () => {
    const s = summarizeAward(planAward([pc({ name: 'Vex', xp: 0 })], 300));
    expect(s).toMatch(/Vex levelled up/);
  });

  it('and NAMES the skipped characters rather than counting them', () => {
    // "2 skipped" invites exactly the question this sentence should have already answered.
    const s = summarizeAward(planAward([
      pc({ id: 'a', name: 'Vex' }),
      pc({ id: 'b', name: 'Kesh', system: 'intuitive-games' }),
    ], 100));
    expect(s).toMatch(/Kesh/);
    expect(s).toMatch(/milestone/i);
  });

  it('and pluralises the common case correctly', () => {
    expect(summarizeAward(planAward([pc()], 100))).toMatch(/1 character\./);
    expect(summarizeAward(planAward([pc({ id: 'a' }), pc({ id: 'b' })], 100))).toMatch(/2 characters\./);
  });
});

describe('junk in', () => {
  it('an empty party plans nothing', () => {
    const plan = planAward([], 100);
    expect(plan.outcomes).toEqual([]);
    expect(plan.awarded).toBe(0);
  });

  it('and a non-numeric amount is zero rather than NaN', () => {
    expect(planAward([pc({ xp: 50 })], NaN as never).outcomes[0].xpAfter).toBe(50);
  });

  it('an unknown system falls back rather than throwing', () => {
    expect(() => planAward([pc({ system: 'nonsense' })], 100)).not.toThrow();
  });
});

describe('the route', () => {
  const route = read('app/api/dnd/campaigns/[id]/award-xp/route.ts');

  it('is DM-only', () => {
    // A player awarding themselves is the obvious abuse, and the UI hiding the control is not a gate.
    expect(route).toContain("if (role !== 'dm')");
  });

  it('uses the SHARED roster query, not the legacy campaign_id column', () => {
    // The roster is the join table ∪ the legacy column. Filtering on `campaign_id` alone would silently
    // miss every character attached through `dnd_campaign_characters` — most of them — and the DM would
    // have no way to tell which players were skipped.
    expect(route).toContain('characterIdsInCampaign(params.id)');
    expect(route, 'must not filter on the legacy column alone').not.toMatch(/\.eq\('campaign_id', params\.id\)/);
  });

  it('excludes NPCs', () => {
    // "Award XP to the party" never means the DM's monster roster.
    expect(route).toContain(".eq('is_npc', false)");
  });

  it('and does not touch a milestone character at all', () => {
    // Writing an unchanged value would bump `updated_at` and imply something happened.
    expect(route).toContain('if (!outcome.applied) continue;');
  });

  it('bounds the amount so a typo cannot jump someone to level 20', () => {
    expect(route).toMatch(/Math\.abs\(amount\) > 100_000/);
  });
});

describe('the DM control', () => {
  const ui = read('app/dnd/_ui/AwardXpControl.tsx');

  it('deep-links each level-up into that character’s level walker', () => {
    // Telling a DM "Vex levelled up" and leaving them to find Vex's sheet is most of the work still undone.
    expect(ui).toMatch(/\/dnd\/characters\/\$\{l\.id\}\/builder/);
  });

  it('and is rendered only for the DM', () => {
    expect(read('app/dnd/_ui/CampaignPageClient.tsx')).toMatch(/data\.campaign\.role === 'dm' && \([\s\S]{0,400}AwardXpControl/);
  });
});
