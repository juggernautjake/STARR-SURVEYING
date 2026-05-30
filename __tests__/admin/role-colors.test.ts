// __tests__/admin/role-colors.test.ts
//
// Slice 1 of hub-widget-excellence-01-greeting-roles-workmode. Locks
// the role pill color helper: every UserRole gets a distinct readable
// background + a contrast-chosen foreground that clears WCAG AA.

import { describe, it, expect } from 'vitest';
import type { UserRole } from '@/lib/auth';
import {
  roleBackground,
  roleForeground,
  rolePillColors,
  rolePillContrast,
} from '@/lib/admin/role-colors';

// Declared locally (typed) rather than importing the runtime
// `ALL_ROLES` from '@/lib/auth' — that module pulls in next-auth,
// which fails to load in the vitest environment. TypeScript still
// checks this list against UserRole, so a drift in ALL_ROLES surfaces
// as a type error here. (Same pattern as work-mode-eligibility.test.)
const ALL_ROLES: readonly UserRole[] = [
  'admin', 'developer', 'teacher', 'student', 'researcher',
  'drawer', 'field_crew', 'employee', 'guest', 'tech_support',
  'equipment_manager',
];

describe('Slice 1 — role pill colors cover every role', () => {
  it('every UserRole returns a #rrggbb background', () => {
    for (const role of ALL_ROLES) {
      expect(roleBackground(role)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('every role foreground is black or white', () => {
    for (const role of ALL_ROLES) {
      expect(['#000000', '#FFFFFF']).toContain(roleForeground(role));
    }
  });

  it('every role pill clears WCAG AA (>= 4.5) bg vs fg', () => {
    for (const role of ALL_ROLES) {
      expect(rolePillContrast(role)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rolePillColors returns the same bg/fg as the individual helpers', () => {
    for (const role of ALL_ROLES) {
      expect(rolePillColors(role)).toEqual({
        bg: roleBackground(role),
        fg: roleForeground(role),
      });
    }
  });

  it('backgrounds are distinct per role (no two roles share a color)', () => {
    const backgrounds = ALL_ROLES.map((r) => roleBackground(r).toUpperCase());
    expect(new Set(backgrounds).size).toBe(ALL_ROLES.length);
  });
});

describe('Slice 1 — defensive fallback for unknown roles', () => {
  it('an unknown role string still returns a valid pill', () => {
    const colors = rolePillColors('not-a-real-role');
    expect(colors.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(['#000000', '#FFFFFF']).toContain(colors.fg);
  });

  it('the fallback pill also clears AA', () => {
    expect(rolePillContrast('not-a-real-role')).toBeGreaterThanOrEqual(4.5);
  });
});
