// __tests__/employee-pond/e12b-privacy-api-ui.test.ts
//
// employee-pond Slice E12b — GET/PUT API endpoint + per-user
// settings page. Locks the auth gate, the EDITABLE_KEYS allow-list,
// the upsert path, and the page wiring (load + toggle + save).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/api/admin/employees/privacy — GET + PUT route', () => {
  const SRC = read('app/api/admin/employees/privacy/route.ts');

  it('exports both GET and PUT', () => {
    expect(SRC).toMatch(/export const GET = withErrorHandler/);
    expect(SRC).toMatch(/export const PUT = withErrorHandler/);
  });

  it('auth-gates both verbs on a signed-in user email', () => {
    const matches = SRC.match(/if \(!session\?\.user\?\.email\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('reads only the legal toggle columns (EDITABLE_KEYS) — no salary / payout', () => {
    expect(SRC).toMatch(/const EDITABLE_KEYS = \[[\s\S]*?\] as const/);
    expect(SRC).not.toMatch(/show_salary_to_employees/);
    expect(SRC).not.toMatch(/show_payout_history_to_employees/);
  });

  it('GET hydrates the response so missing rows fall back to defaults', () => {
    expect(SRC).toMatch(/hydrateEmployeePrivacy\(/);
  });

  it('GET returns both `privacy` + `defaults` so the page can show "back to default" later', () => {
    expect(SRC).toMatch(/privacy, defaults: DEFAULT_EMPLOYEE_PRIVACY/);
  });

  it('PUT rejects unknown keys + non-boolean values', () => {
    expect(SRC).toMatch(/Unknown privacy field/);
    expect(SRC).toMatch(/must be a boolean/);
  });

  it('PUT rejects empty bodies (so a no-op PUT doesn\'t silently succeed)', () => {
    expect(SRC).toMatch(/No editable fields in body/);
  });

  it('PUT upserts on user_email with the new updated_at stamp', () => {
    expect(SRC).toMatch(/upsert\(\s*\n\s*\{ user_email: email, \.\.\.patch, updated_at: new Date\(\)\.toISOString\(\) \}/);
  });

  it("lowercases the email so duplicates don't pile up", () => {
    expect(SRC).toMatch(/session\.user\.email\.toLowerCase\(\)/);
  });
});

describe('/admin/me/privacy — settings page', () => {
  const SRC = read('app/admin/me/privacy/page.tsx');

  it("declares 'use client' so React hooks land", () => {
    expect(SRC).toMatch(/'use client';/);
  });

  it('renders the four expected groups with stable testIDs', () => {
    expect(SRC).toMatch(/data-testid=\{`privacy-group-\$\{group\.title\.toLowerCase\(\)\}`\}/);
    // Group titles must include Contact / Personal / Employment / Activity.
    expect(SRC).toMatch(/title: 'Contact'/);
    expect(SRC).toMatch(/title: 'Personal'/);
    expect(SRC).toMatch(/title: 'Employment'/);
    expect(SRC).toMatch(/title: 'Activity'/);
  });

  it('renders a toggle per privacy key with stable testIDs', () => {
    expect(SRC).toMatch(/data-testid=\{`privacy-toggle-\$\{f\.key\}`\}/);
  });

  it("loads the current settings via GET on mount", () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/employees\/privacy', \{ credentials: 'include' \}\)/);
  });

  it("Save button PUTs the full struct to the API", () => {
    expect(SRC).toMatch(
      /fetch\('\/api\/admin\/employees\/privacy', \{[\s\S]*?method: 'PUT'[\s\S]*?body: JSON\.stringify\(privacy\)/,
    );
  });

  it('reports saved / error states via role="status" + role="alert"', () => {
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/role="alert"/);
  });

  it("disables the Save button while saving so the user can't double-fire", () => {
    expect(SRC).toMatch(/disabled=\{saveState === 'saving'\}/);
  });

  it("calls out the role visibility matrix in the page intro", () => {
    expect(SRC).toMatch(/Admins/);
    expect(SRC).toMatch(/salary \+ payout history/);
  });
});
