// __tests__/dnd/roster.test.ts — Slice 30 roster roles: the pure effective-role fallback that lets a legacy
// character (predating the roster_role column) still triage correctly, and the validity gate the PATCH route
// enforces. Encodes the doc's acceptance: "every existing character reads as a pc" (unless already an NPC).
import { describe, it, expect } from 'vitest';
import { ROSTER_ROLES, isRosterRole, rosterRoleOf } from '@/lib/dnd/roster';

describe('ROSTER_ROLES + isRosterRole', () => {
  it('is exactly the three editorial roles', () => {
    expect(ROSTER_ROLES).toEqual(['pc', 'special_npc', 'generic_npc']);
  });
  it('accepts the three roles and rejects everything else', () => {
    for (const r of ROSTER_ROLES) expect(isRosterRole(r)).toBe(true);
    for (const bad of ['PC', 'npc', '', 'boss', null, undefined, 3, {}]) expect(isRosterRole(bad)).toBe(false);
  });
});

describe('rosterRoleOf — a valid stored role wins, else derive from is_npc (Slice 30 back-compat)', () => {
  it('passes a valid stored role through unchanged, regardless of is_npc', () => {
    expect(rosterRoleOf('special_npc', false)).toBe('special_npc');
    expect(rosterRoleOf('pc', true)).toBe('pc'); // an explicit PC stays a PC even if is_npc drifted true
    expect(rosterRoleOf('generic_npc', false)).toBe('generic_npc');
  });

  it('every legacy character (no roster_role) reads as a pc — unless it was already flagged an NPC', () => {
    // The doc's acceptance criterion: pre-roster characters default to pc.
    expect(rosterRoleOf(null, false)).toBe('pc');
    expect(rosterRoleOf(undefined, undefined)).toBe('pc');
    expect(rosterRoleOf(null, false)).toBe('pc');
    // …and a pre-roster NPC reads as a generic NPC (the safe triage bucket).
    expect(rosterRoleOf(null, true)).toBe('generic_npc');
    expect(rosterRoleOf(undefined, true)).toBe('generic_npc');
  });

  it('a corrupt stored role falls back to the is_npc derivation, never leaking through', () => {
    // This is the correctness fix: two call sites used `?? fallback`, which let a bad value pass. The shared
    // helper validates, so 'boss'/'' can never reach the UI as a phantom group.
    expect(rosterRoleOf('boss', false)).toBe('pc');
    expect(rosterRoleOf('', true)).toBe('generic_npc');
    expect(rosterRoleOf('PC', false)).toBe('pc'); // case-sensitive — 'PC' is not the role 'pc'
  });
});
