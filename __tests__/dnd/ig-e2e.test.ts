// __tests__/dnd/ig-e2e.test.ts — end-to-end IG builder journey (Slice 8 QA). Ties the whole flow together
// through the real libs (the deterministic layer that works with zero services): build vanilla → all-vanilla
// → submits to a vanilla-only campaign; build custom → flagged → blocked by a vanilla-only campaign, naming
// the offenders; a DM grant of that element unblocks it; a custom-allowed campaign accepts everything;
// submission-status normalization.
import { describe, it, expect } from 'vitest';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';
import { evaluateSubmission, normalizeSubmissionStatus } from '@/lib/dnd/submission';

describe('IG builder end-to-end (Slice 8)', () => {
  it('vanilla build → all vanilla → passes a vanilla-only campaign', () => {
    const c = assembleIGVanillaCharacter({ ancestry: 'Migoi', className: 'Freebooter', subclass: 'Arcanist', stances: ['Offensive'], powers: ['Mirror Image'], feats: ['Toughness'] });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.custom).toHaveLength(0);
    expect(evaluateSubmission(false, s).allowed).toBe(true);   // vanilla-only accepts a pure-vanilla build
  });

  it('custom build → flagged → blocked by a vanilla-only campaign, naming the offenders', () => {
    const c = assembleIGVanillaCharacter({ className: 'Freebooter', stances: ['Berserker Fury'], powers: ['Ultra Nuke'] });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.hasBlockingCustom).toBe(true);
    const gate = evaluateSubmission(false, s);
    expect(gate.allowed).toBe(false);
    const blocked = gate.blocking.map((b) => b.name);
    expect(blocked).toContain('Berserker Fury');
    expect(blocked).toContain('Ultra Nuke');
    // a custom-allowing campaign takes it as-is
    expect(evaluateSubmission(true, s).allowed).toBe(true);
  });

  it('DM grant of the custom element unblocks a vanilla-only submit', () => {
    const c = assembleIGVanillaCharacter({ className: 'Freebooter', stances: ['Berserker Fury'] });
    const granted = summarizeCharacterProvenance(c, 'intuitive-games', [{ kind: 'stance', name: 'Berserker Fury', grantedBy: 'DM', mechanics: 'rage stance' }]);
    expect(granted.dmGranted.some((e) => e.name === 'Berserker Fury')).toBe(true);
    expect(granted.hasBlockingCustom).toBe(false);
    expect(evaluateSubmission(false, granted).allowed).toBe(true);
  });

  it('normalizes submission status across the review lifecycle', () => {
    expect(normalizeSubmissionStatus('draft')).toBe('draft');
    expect(normalizeSubmissionStatus('submitted')).toBe('submitted');
    expect(normalizeSubmissionStatus('approved')).toBe('approved');
    expect(normalizeSubmissionStatus('rejected')).toBe('rejected');
    expect(normalizeSubmissionStatus('nonsense')).toBe('draft');
  });
});
