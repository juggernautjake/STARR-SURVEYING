// __tests__/dnd/level-up-ai.test.ts — the AI level-up apply (turns a validated draft into character changes).
import { describe, it, expect } from 'vitest';
import { applyLevelUpDraft, parseLevelUpToolCall, LEVEL_UP_TOOL } from '@/lib/dnd/classes/level-up-ai';
import { parseLevelUpDraft } from '@/lib/dnd/classes/level-up-draft';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

function charAt(level: number) {
  const c = blankCharacter('Test');
  c.meta = { ...c.meta, level, subclass: '' };
  c.abilities = { ...c.abilities, str: 16, con: 14 };
  c.combat = { ...c.combat, maxHp: 20 };
  c.features = [];
  return c;
}

describe('LEVEL_UP_TOOL schema', () => {
  it('is a valid structured-output tool with mode + features required', () => {
    expect(LEVEL_UP_TOOL.name).toBe('level_up_character');
    expect(LEVEL_UP_TOOL.input_schema.required).toEqual(['mode', 'features']);
  });
  it('parseLevelUpToolCall normalizes a raw tool call to the next level', () => {
    const d = parseLevelUpToolCall({ mode: 'custom', features: [{ name: 'X', body: 'y' }] }, 4);
    expect(d.toLevel).toBe(5);
    expect(d.mode).toBe('custom');
  });
});

describe('applyLevelUpDraft', () => {
  it('bumps the level, appends features, applies ASI, and adds HP', () => {
    const c = charAt(4);
    const draft = parseLevelUpDraft({
      mode: 'vanilla', hpGained: 7, abilityIncreases: { str: 2 },
      features: [{ name: 'Extra Attack', body: 'Attack twice.' }],
    }, { currentLevel: 4 });
    const next = applyLevelUpDraft(c, draft);
    expect(next.meta.level).toBe(5);
    expect(next.abilities.str).toBe(18); // 16 + 2
    expect(next.combat.maxHp).toBe(27); // 20 + 7
    expect(next.features).toHaveLength(1);
    expect(next.features[0]).toMatchObject({ name: 'Extra Attack', source: 'Level 5', unlockLevel: 5, customized: false });
    expect(next.features[0].body).toEqual(['Attack twice.']);
    // input untouched (immutability)
    expect(c.meta.level).toBe(4);
    expect(c.abilities.str).toBe(16);
  });

  it('flags custom features and their source', () => {
    const c = charAt(2);
    const draft = parseLevelUpDraft({ mode: 'custom', features: [{ name: 'Chrome Reflexes', body: '+PB to initiative.' }] }, { currentLevel: 2 });
    const next = applyLevelUpDraft(c, draft);
    expect(next.features[0]).toMatchObject({ source: 'Custom · Level 3', customized: true });
  });

  it('is deterministic — same draft yields the same feature id (idempotent id)', () => {
    const draft = parseLevelUpDraft({ mode: 'custom', features: [{ name: 'Nova Fist', body: 'boom' }] }, { currentLevel: 3 });
    expect(applyLevelUpDraft(charAt(3), draft).features[0].id).toBe(applyLevelUpDraft(charAt(3), draft).features[0].id);
    expect(applyLevelUpDraft(charAt(3), draft).features[0].id).toBe('lvl-4-nova-fist');
  });

  it('caps an ability at 30 (Epic Boon headroom), never overflowing', () => {
    const c = charAt(19); c.abilities.str = 29;
    const draft = parseLevelUpDraft({ mode: 'custom', abilityIncreases: { str: 2 }, features: [] }, { currentLevel: 19 });
    expect(applyLevelUpDraft(c, draft).abilities.str).toBe(30);
  });

  it('records a chosen subclass when none is set', () => {
    const draft = parseLevelUpDraft({ mode: 'vanilla', subclass: 'champion', features: [] }, { currentLevel: 2 });
    expect(applyLevelUpDraft(charAt(2), draft).meta.subclass).toBe('champion');
  });
});
