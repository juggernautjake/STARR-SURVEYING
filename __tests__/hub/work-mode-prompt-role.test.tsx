// __tests__/hub/work-mode-prompt-role.test.tsx
//
// Slice 3 of hub-widget-excellence-01-greeting-roles-workmode. Locks
// the Enter-Work-Mode prompt's ROLE step: the destination href, the
// single-role pre-select rule, and the rendered role choices.
//
// `@/lib/auth` is mocked (ROLE_LABELS) to dodge next-auth, and
// `next/navigation` is mocked so `useRouter()` resolves under SSR.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

vi.mock('@/lib/auth', () => ({
  ROLE_LABELS: {
    admin: 'Admin',
    developer: 'Developer',
    teacher: 'Teacher',
    student: 'Student',
    researcher: 'Researcher',
    drawer: 'Drawer',
    field_crew: 'Field Crew',
    employee: 'Employee',
    guest: 'Guest',
    tech_support: 'Tech Support',
    equipment_manager: 'Equipment Manager',
  },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import WorkModePrompt, {
  WorkModeRoleStep,
  workModeHref,
  preselectRole,
} from '@/app/admin/me/components/WorkModePrompt';
import type { UserRole } from '@/lib/auth';

describe('workModeHref — routing target', () => {
  it('maps each role to its work-mode workspace path', () => {
    expect(workModeHref('field_crew')).toBe('/admin/work-mode/field_crew');
    expect(workModeHref('drawer')).toBe('/admin/work-mode/drawer');
    expect(workModeHref('admin')).toBe('/admin/work-mode/admin');
  });
});

describe('preselectRole — single-role fast path', () => {
  it('pre-selects when the user has exactly one eligible role', () => {
    expect(preselectRole(['drawer'])).toBe('drawer');
  });

  it('forces an explicit choice (null) for multiple eligible roles', () => {
    expect(preselectRole(['admin', 'drawer'])).toBeNull();
  });

  it('returns null when there are no eligible roles', () => {
    expect(preselectRole([])).toBeNull();
  });
});

describe('WorkModeRoleStep — the role choices', () => {
  function renderStep(eligible: UserRole[], selected: UserRole | null): string {
    return ReactDOMServer.renderToStaticMarkup(
      <WorkModeRoleStep
        eligible={eligible}
        selectedRole={selected}
        onSelectRole={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
  }

  it('asks which role the user is working under', () => {
    const html = renderStep(['admin', 'drawer'], null);
    expect(html).toContain('What role are you working under?');
  });

  it('renders one labeled choice per eligible role', () => {
    const html = renderStep(['field_crew', 'drawer'], null);
    expect(html).toContain('data-role="field_crew"');
    expect(html).toContain('data-role="drawer"');
    expect(html).toContain('Field Crew');
    expect(html).toContain('Drawer');
  });

  it('marks the selected role as pressed/active', () => {
    const html = renderStep(['admin', 'drawer'], 'drawer');
    // The drawer button carries aria-pressed + data-active.
    expect(html).toMatch(/data-role="drawer"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-role="drawer"[^>]*data-active="true"/);
  });

  it('disables the confirm button until a role is selected', () => {
    const none = renderStep(['admin', 'drawer'], null);
    expect(none).toMatch(/Enter Work Mode<\/button>/);
    expect(none).toMatch(/disabled[^>]*>\s*Enter Work Mode/);
  });

  it('enables the confirm button once a role is selected', () => {
    const picked = renderStep(['admin', 'drawer'], 'admin');
    // The primary action should NOT be disabled when a role is chosen.
    const confirmFragment = picked.slice(picked.indexOf('work-mode-prompt__btn--primary'));
    expect(confirmFragment).not.toContain('disabled');
  });
});

describe('WorkModePrompt — closed by default', () => {
  it('renders the trigger but no dialog until opened', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WorkModePrompt roles={['admin', 'drawer']} />,
    );
    expect(html).toContain('Enter Work Mode');
    expect(html).toContain('aria-haspopup="dialog"');
    // The overlay/dialog is only mounted on open.
    expect(html).not.toContain('role="dialog"');
  });
});
