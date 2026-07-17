// __tests__/dnd/grant-language-renders.test.ts — Rule 2 accuracy: a target's `rendersAt` must name where
// it ACTUALLY renders. `grant_language` uses the `grant_proficiency` op, so an effect-granted language is
// collected with weapons/tools into the Skills tab's "Granted Proficiencies" panel — NOT "Overview ·
// Languages" (that line is for a species' innate languages). This pins the real render path.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget, validateEffect } from '@/lib/dnd/effects/targets';
import { buildLedger } from '@/lib/dnd/effects/ledger';

const SAVES = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SavesSkills.tsx'), 'utf8');

describe('grant_language renders where its rendersAt claims', () => {
  it('rendersAt names the Granted Proficiencies panel (its real home), not Overview · Languages', () => {
    expect(findTarget('grant_language')!.rendersAt).toMatch(/Granted Proficiencies/);
  });
  it('validates as a grant_proficiency op', () => {
    expect(validateEffect({ target: 'grant_language', operation: 'grant_proficiency', value: 'Draconic' })).toBeNull();
  });
  it('an effect-granted language is collected under grant_proficiency (so the panel shows it)', () => {
    const char = {
      inventory: [
        { id: 'amulet', name: 'Amulet of Tongues', desc: '', qty: 1, tags: [], equipped: true,
          effects: [{ target: 'grant_language', operation: 'grant_proficiency', value: 'Draconic' }] },
      ],
    } as unknown as Parameters<typeof buildLedger>[0];
    const granted = buildLedger(char).collected('grant_proficiency');
    expect(granted.map((g) => g.value)).toContain('Draconic');
    expect(granted.find((g) => g.value === 'Draconic')?.source).toBe('Amulet of Tongues');
  });
  it('the Skills tab renders the collected grant_proficiency set', () => {
    expect(SAVES).toContain("ledger.collected('grant_proficiency')");
    expect(SAVES).toContain('Granted Proficiencies');
  });
});
