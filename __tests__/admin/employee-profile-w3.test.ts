// __tests__/admin/employee-profile-w3.test.ts
//
// Slice W3 — profile fallback per user spec:
// "User's profile page should show their icon, their name, their
//  email, their roles, and if they haven't updated it, it should
//  just have the text 'no more information about [name] is
//  available.'"

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('public profile page — always-on header + collapse-to-stub fallback (W3)', () => {
  const SRC = read('app/admin/employees/[email]/page.tsx');

  it('fetches registered_users.roles so the header pill row can render', () => {
    expect(SRC).toMatch(/\.from\('registered_users'\)[\s\S]*?\.select\('roles'\)/);
  });

  it('renders the role pills row with a stable testid (per the user spec)', () => {
    expect(SRC).toMatch(/data-testid="employee-profile-roles"/);
    expect(SRC).toMatch(/userRoles\.map\(\(r\) =>/);
  });

  it('computes hasOptionalInfo across every detail-card source', () => {
    expect(SRC).toMatch(/const hasOptionalInfo =[\s\S]*?profile\.date_of_birth[\s\S]*?contactRows\.length > 0[\s\S]*?certRows\.length > 0[\s\S]*?profile\.hourly_rate != null/);
  });

  it('renders the empty stub when there is no optional info AND the viewer is not admin', () => {
    expect(SRC).toMatch(/!hasOptionalInfo && !viewerIsAdmin && \(/);
    expect(SRC).toMatch(/data-testid="employee-profile-empty-stub"/);
    expect(SRC).toMatch(/No more information about \{displayName\} is available\./);
  });

  it('skips the four detail cards when collapsed (single-conditional wrapper)', () => {
    expect(SRC).toMatch(/\{\(hasOptionalInfo \|\| viewerIsAdmin\) && \(/);
  });

  it('still shows the EP7b admin editor when the viewer is admin (so admins can fill in the gap)', () => {
    expect(SRC).toMatch(/viewerIsAdmin && !isSelf && \(\s*\n\s*<AdminPersonalInfoEditor/);
  });

  it('the displayed name falls back to the email when user_name is blank', () => {
    expect(SRC).toMatch(/const displayName = profile\.user_name\?\.trim\(\) \|\| email;/);
  });
});
