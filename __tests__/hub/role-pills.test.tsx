// __tests__/hub/role-pills.test.tsx
//
// Slice 2 of hub-widget-excellence-01-greeting-roles-workmode. Locks
// the RolePills contract: every distinct role the user holds renders
// as a colored pill below the greeting, with the human label + the
// contrast-chosen inline background/foreground from role-colors.ts.
//
// `@/lib/auth` is mocked because the real module imports next-auth at
// the top (NextAuth + providers + bcrypt + supabase), which fails to
// load in the vitest environment ("Cannot find module 'next/server'").
// RolePills only needs the ROLE_LABELS map at runtime, so we stub that.

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

import RolePills from '@/app/admin/me/components/RolePills';
import { rolePillColors } from '@/lib/admin/role-colors';
import type { UserRole } from '@/lib/auth';

function render(roles: UserRole[]): string {
  return ReactDOMServer.renderToStaticMarkup(<RolePills roles={roles} />);
}

describe('RolePills — one colored pill per role', () => {
  it('renders a pill for every distinct role with its human label', () => {
    const html = render(['admin', 'student', 'teacher']);
    expect(html).toContain('data-role="admin"');
    expect(html).toContain('data-role="student"');
    expect(html).toContain('data-role="teacher"');
    expect(html).toContain('Admin');
    expect(html).toContain('Student');
    expect(html).toContain('Teacher');
  });

  it('shows the "Your roles:" label matching the sketch', () => {
    const html = render(['admin']);
    expect(html).toContain('Your roles:');
  });

  it('paints each pill with the inline bg + fg from role-colors.ts', () => {
    const html = render(['admin']);
    const { bg, fg } = rolePillColors('admin');
    // ReactDOMServer serialises style props as `background:#…;color:#…`.
    expect(html).toMatch(new RegExp(`background:\\s*${bg}`, 'i'));
    expect(html).toMatch(new RegExp(`color:\\s*${fg}`, 'i'));
  });

  it('uses a role-list element for accessibility', () => {
    const html = render(['admin', 'student']);
    expect(html).toMatch(/role="list"/);
    expect(html).toMatch(/aria-label="Your roles"/);
  });
});

describe('RolePills — de-dupe + empty handling', () => {
  it('renders one pill per role even when a role repeats', () => {
    const html = render(['admin', 'admin', 'student']);
    const adminPills = html.match(/data-role="admin"/g) ?? [];
    expect(adminPills.length).toBe(1);
    const studentPills = html.match(/data-role="student"/g) ?? [];
    expect(studentPills.length).toBe(1);
  });

  it('renders nothing when the user has no roles', () => {
    expect(render([])).toBe('');
  });
});
