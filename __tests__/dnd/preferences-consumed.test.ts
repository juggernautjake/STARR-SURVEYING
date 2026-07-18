// __tests__/dnd/preferences-consumed.test.ts — a regression guard against a DEFINED-BUT-UNREAD preference
// (the bug where `recordMode` had a resolver + DM control + player row but nothing consumed it, so choosing
// it changed nothing). For each configurable preference, assert its `.value` is read in the code path that
// makes it DO something. If a preference loses its consumer, this fails — the pref is dead again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
// Where each preference is actually CONSUMED (drives behavior), not just defined/displayed.
const CONSUMERS: Record<string, string[]> = {
  autoMechanics: ['app/dnd/_sheet/state/store.tsx'],
  exhaustionModel: ['app/dnd/_sheet/state/store.tsx'],
  longRestModel: ['app/dnd/_sheet/state/store.tsx'],
  equipLimits: ['app/dnd/_sheet/components/Inventory.tsx', 'app/api/dnd/characters/[id]/ai-edit/route.ts'],
  diceRollerStyle: ['app/dnd/_sheet/components/DiceTray.tsx'],
  recordMode: ['app/dnd/_sheet/components/DiceTray.tsx'],
  // Read in the store, which threads them into buildLedger/deriveAc (attunement gating, feat auto-apply,
  // and the shapeshift stat policy).
  autoAttune: ['app/dnd/_sheet/state/store.tsx'],
  featAutoApply: ['app/dnd/_sheet/state/store.tsx'],
  shapeshiftStats: ['app/dnd/_sheet/state/store.tsx'],
  // Consumed server-side at the PF2 edit sites, which resolve it from the campaign and pass it to applyPf2Edit.
  downedDamageModel: ['app/api/dnd/characters/[id]/pf2-edit/route.ts', 'app/api/dnd/characters/[id]/ai-edit/route.ts'],
};

describe('every configurable preference is consumed (no defined-but-unread prefs)', () => {
  const keys = Object.keys(DEFAULT_CAMPAIGN_PREFERENCES);
  it('covers every preference key with a documented consumer', () => {
    expect(Object.keys(CONSUMERS).sort()).toEqual(keys.sort());
  });
  for (const key of keys) {
    it(`"${key}".value is read in a behavior-driving consumer`, () => {
      const sources = CONSUMERS[key].map(read).join('\n');
      // matches `prefs.<key>.value` or `preferences.<key>.value`
      expect(sources).toMatch(new RegExp(`(prefs|preferences)\.${key}\.value`));
    });
  }
});
