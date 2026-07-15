// __tests__/dnd/build-modes.test.ts — the three creation modes normalize + drive distinct behaviour.
import { describe, it, expect } from 'vitest';
import { normalizeBuildMode, buildModeInstruction } from '@/lib/dnd/build-modes';

describe('build modes', () => {
  it('normalizes to a valid mode (defaults to questioning)', () => {
    expect(normalizeBuildMode('ruthless')).toBe('ruthless');
    expect(normalizeBuildMode('STEPBYSTEP')).toBe('stepbystep');
    expect(normalizeBuildMode('questioning')).toBe('questioning');
    expect(normalizeBuildMode('nonsense')).toBe('questioning');
    expect(normalizeBuildMode(undefined)).toBe('questioning');
  });

  it('each mode yields a distinct instruction with the expected behaviour', () => {
    const r = buildModeInstruction('ruthless');
    const q = buildModeInstruction('questioning');
    const s = buildModeInstruction('stepbystep');
    expect(r).toMatch(/no questions/i);
    expect(q).toMatch(/do NOT guess/i);
    expect(s).toMatch(/Do NOT auto-fill/i);
    expect(new Set([r, q, s]).size).toBe(3);
  });
});
