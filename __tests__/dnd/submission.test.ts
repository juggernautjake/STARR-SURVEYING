// __tests__/dnd/submission.test.ts — the vanilla-only submission gate is correct (IG builder Slice 4).
import { describe, it, expect } from 'vitest';
import { evaluateSubmission, normalizeSubmissionStatus } from '@/lib/dnd/submission';
import { tagElement, summarizeProvenance } from '@/lib/dnd/provenance';

const vanillaOnly = summarizeProvenance([
  tagElement('intuitive-games', 'stance', 'Offensive'),
  tagElement('intuitive-games', 'class', 'Freebooter'),
]);
const withCustom = summarizeProvenance([
  tagElement('intuitive-games', 'stance', 'Offensive'),
  tagElement('intuitive-games', 'power', 'Ultra Fireball'), // custom
]);
const withDmGrant = summarizeProvenance([
  tagElement('intuitive-games', 'stance', 'Offensive'),
  tagElement('intuitive-games', 'feat', 'DM Gift', { grantedBy: 'DM' }), // dm-granted, not blocking
]);

describe('submission policy (Slice 4)', () => {
  it('a custom-allowed campaign accepts anything', () => {
    expect(evaluateSubmission(true, withCustom).allowed).toBe(true);
    expect(evaluateSubmission(true, vanillaOnly).allowed).toBe(true);
    expect(evaluateSubmission(true, withDmGrant).allowed).toBe(true);
  });

  it('a vanilla-only campaign accepts a pure-vanilla character', () => {
    const c = evaluateSubmission(false, vanillaOnly);
    expect(c.allowed).toBe(true);
    expect(c.blocking).toHaveLength(0);
  });

  it('a vanilla-only campaign BLOCKS a character with custom content and names what blocks it', () => {
    const c = evaluateSubmission(false, withCustom);
    expect(c.allowed).toBe(false);
    expect(c.blocking.map((b) => b.name)).toContain('Ultra Fireball');
    expect(c.reason).toMatch(/vanilla-only/i);
    expect(c.reason).toMatch(/Ultra Fireball/);
  });

  it('DM-granted content does NOT block a vanilla-only campaign', () => {
    expect(evaluateSubmission(false, withDmGrant).allowed).toBe(true);
  });

  it('normalizeSubmissionStatus coerces to a valid status', () => {
    expect(normalizeSubmissionStatus('submitted')).toBe('submitted');
    expect(normalizeSubmissionStatus('APPROVED')).toBe('approved');
    expect(normalizeSubmissionStatus('nonsense')).toBe('draft');
    expect(normalizeSubmissionStatus(undefined)).toBe('draft');
  });
});
