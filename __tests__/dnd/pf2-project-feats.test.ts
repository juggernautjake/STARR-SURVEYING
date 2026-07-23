// __tests__/dnd/pf2-project-feats.test.ts — B10 follow-up: committing a PF2 level projects the recorded
// feat choices into the pf2e sidecar so they actually appear on the sheet — idempotently, and without
// touching base-build feats. (Attribute boosts stay recorded-only by design — partial-boost state.)
import { describe, it, expect } from 'vitest';
import { pf2ProjectLevelUpFeats, type PF2RecordedChoice, type PF2FeatResolution } from '@/lib/dnd/systems/pathfinder2e/levelup';

type Feat = { id: string; name: string; level: number; track: 'ancestry' | 'class' | 'skill' | 'general' | 'archetype' | 'feature'; traits: string[]; body: string; customized?: boolean };

const resolve = (name: string): PF2FeatResolution | null =>
  name === 'Power Attack' ? { level: 1, traits: ['Fighter', 'Flourish'], body: 'A mighty swing.' } : null;

const baseFeat: Feat = { id: 'cls-key', name: 'Fighter (Weapon Mastery)', level: 1, track: 'feature', traits: ['Fighter'], body: '' };

describe('pf2ProjectLevelUpFeats (B10 follow-up)', () => {
  it('projects an earned feat choice into the sidecar with catalog traits/body', () => {
    const choices: PF2RecordedChoice[] = [{ level: 1, kind: 'feat', track: 'class', value: 'Power Attack' }];
    const out = pf2ProjectLevelUpFeats<Feat>([baseFeat], choices, 1, resolve);
    const feat = out.find((f) => f.name === 'Power Attack')!;
    expect(feat.id).toBe('lvl-1-class');
    expect(feat.traits).toEqual(['Fighter', 'Flourish']);
    expect(feat.customized).toBeUndefined();
  });

  it('leaves base-build feats (non lvl- ids) untouched', () => {
    const out = pf2ProjectLevelUpFeats<Feat>([baseFeat], [], 5, resolve);
    expect(out).toContainEqual(baseFeat);
  });

  it('is idempotent — re-projecting the same choices does not duplicate', () => {
    const choices: PF2RecordedChoice[] = [{ level: 1, kind: 'feat', track: 'class', value: 'Power Attack' }];
    const once = pf2ProjectLevelUpFeats<Feat>([baseFeat], choices, 1, resolve);
    const twice = pf2ProjectLevelUpFeats<Feat>(once, choices, 1, resolve);
    expect(twice.filter((f) => f.name === 'Power Attack')).toHaveLength(1);
  });

  it('does not project a choice above the earned level', () => {
    const choices: PF2RecordedChoice[] = [{ level: 6, kind: 'feat', track: 'class', value: 'Power Attack' }];
    expect(pf2ProjectLevelUpFeats<Feat>([baseFeat], choices, 5, resolve).some((f) => f.name === 'Power Attack')).toBe(false);
  });

  it('a pick NOT in the catalog is flagged customized (visible to DM review + the ✎ marker)', () => {
    const choices: PF2RecordedChoice[] = [{ level: 1, kind: 'feat', track: 'class', value: 'Homebrew Smash' }];
    const feat = pf2ProjectLevelUpFeats<Feat>([], choices, 1, resolve).find((f) => f.name === 'Homebrew Smash')!;
    expect(feat.customized).toBe(true);
  });

  it('lowering the level REMOVES a feat that is no longer earned (re-projection replaces cleanly)', () => {
    const choices: PF2RecordedChoice[] = [{ level: 4, kind: 'feat', track: 'class', value: 'Power Attack' }];
    const at4 = pf2ProjectLevelUpFeats<Feat>([baseFeat], choices, 4, resolve);
    expect(at4.some((f) => f.name === 'Power Attack')).toBe(true);
    const backTo1 = pf2ProjectLevelUpFeats<Feat>(at4, choices, 1, resolve);
    expect(backTo1.some((f) => f.name === 'Power Attack')).toBe(false); // no longer earned, and not left stale
    expect(backTo1).toContainEqual(baseFeat);
  });

  it('boost choices are never projected as feats (they stay recorded-only)', () => {
    const choices: PF2RecordedChoice[] = [{ level: 5, kind: 'boosts', attributes: ['STR', 'DEX', 'CON', 'WIS'] }];
    expect(pf2ProjectLevelUpFeats<Feat>([], choices, 5, resolve)).toHaveLength(0);
  });
});
