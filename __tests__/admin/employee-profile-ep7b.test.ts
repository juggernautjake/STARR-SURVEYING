// __tests__/admin/employee-profile-ep7b.test.ts
//
// Slice EP7b — admin edit-on-behalf-of. The public profile page
// at /admin/employees/[email] now embeds an AdminPersonalInfoEditor
// for admins viewing somebody ELSE's page (self users still use
// the "Edit my profile" link to land on /admin/me?tab=profile).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('AdminPersonalInfoEditor (EP7b)', () => {
  const SRC = read('app/admin/employees/[email]/AdminPersonalInfoEditor.tsx');

  it("is a 'use client' component (form needs hooks + the router)", () => {
    expect(SRC).toMatch(/^'use client';/m);
  });

  it('renders a stable testid for the toggle button + the form', () => {
    expect(SRC).toMatch(/data-testid="employee-profile-admin-edit"/);
    expect(SRC).toMatch(/data-testid="employee-profile-admin-form"/);
    expect(SRC).toMatch(/data-testid="employee-profile-admin-save"/);
  });

  it('POSTs the four personal-info fields to /api/admin/payroll/employees with the target email', () => {
    expect(SRC).toMatch(/'\/api\/admin\/payroll\/employees'/);
    expect(SRC).toMatch(/user_email: targetEmail/);
    expect(SRC).toMatch(/date_of_birth: draft\.date_of_birth \|\| null/);
    expect(SRC).toMatch(/gender: draft\.gender \|\| null/);
    expect(SRC).toMatch(/pronouns: draft\.pronouns \|\| null/);
    expect(SRC).toMatch(/bio: draft\.bio \|\| null/);
  });

  it('calls router.refresh() on save to repaint the server component', () => {
    expect(SRC).toMatch(/router\.refresh\(\)/);
  });
});

describe('public profile page mounts the admin editor (EP7b)', () => {
  const SRC = read('app/admin/employees/[email]/page.tsx');

  it('imports AdminPersonalInfoEditor', () => {
    expect(SRC).toMatch(/import AdminPersonalInfoEditor from '\.\/AdminPersonalInfoEditor'/);
  });

  it('only renders the editor when the viewer is admin AND it is not their own page', () => {
    expect(SRC).toMatch(/\{viewerIsAdmin && !isSelf && \(\s*\n\s*<AdminPersonalInfoEditor/);
  });

  it('passes the target email + initial four fields to the editor', () => {
    expect(SRC).toMatch(/targetEmail=\{email\}/);
    expect(SRC).toMatch(/date_of_birth: profile\.date_of_birth/);
    expect(SRC).toMatch(/gender: profile\.gender/);
    expect(SRC).toMatch(/pronouns: profile\.pronouns/);
    expect(SRC).toMatch(/bio: profile\.bio/);
  });
});
