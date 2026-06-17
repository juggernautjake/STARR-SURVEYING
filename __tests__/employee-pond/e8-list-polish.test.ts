// __tests__/employee-pond/e8-list-polish.test.ts
//
// employee-pond Slice E8 — below-pond list polish. Locks the
// clickable + hoverable row markup + the CSS for the avatar /
// text / role-pill layout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('EmployeePond.tsx — E8 list row markup', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('every row is a <button> for keyboard + tap targeting', () => {
    expect(SRC).toMatch(/className="employee-pond__list-row"/);
    expect(SRC).toMatch(/type="button"/);
  });

  it('row carries stable testID + data attrs (selected + hovered + employee id)', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-list-row"/);
    expect(SRC).toMatch(/data-employee-id=\{e\.id\}/);
    expect(SRC).toMatch(/data-selected=\{selectedEmployee\?\.id === e\.id \? 'true' : undefined\}/);
    expect(SRC).toMatch(/data-hovered=\{hoveredEmployeeId === e\.id \? 'true' : undefined\}/);
  });

  it("row click opens the same dialogue as clicking an orb", () => {
    // E10 widened handleOrbClick with an opener arg for focus
    // return; the list row now passes its currentTarget.
    expect(SRC).toMatch(/onClick=\{\(ev\) => handleOrbClick\(e, ev\.currentTarget\)\}/);
  });

  it("row hover cross-highlights the matching orb (mouse/pen only)", () => {
    expect(SRC).toMatch(
      /onPointerEnter=\{\(ev\) => \{[\s\S]*?if \(ev\.pointerType === 'mouse' \|\| ev\.pointerType === 'pen'\)[\s\S]*?setHoveredEmployeeId\(e\.id\)/,
    );
  });

  it('keyboard focus also cross-highlights (accessibility parity)', () => {
    expect(SRC).toMatch(/onFocus=\{\(\) => setHoveredEmployeeId\(e\.id\)\}/);
  });

  it('renders avatar with initials fallback', () => {
    expect(SRC).toMatch(/className="employee-pond__list-avatar-img"/);
    expect(SRC).toMatch(/className="employee-pond__list-avatar-initials"/);
  });

  it('renders name + email + optional job title text block', () => {
    expect(SRC).toMatch(/className="employee-pond__list-name"/);
    expect(SRC).toMatch(/className="employee-pond__list-email"/);
    expect(SRC).toMatch(/\{e\.job_title && \(\s*\n\s*<span className="employee-pond__list-title"/);
  });

  it('caps role pills at 3 + shows +N for overflow', () => {
    expect(SRC).toMatch(/e\.roles\.slice\(0, 3\)\.map/);
    expect(SRC).toMatch(/\{e\.roles\.length > 3 && \(/);
    expect(SRC).toMatch(/\+\{e\.roles\.length - 3\}/);
  });

  it("uses ROLE_FILTER_LABELS so the pill text matches the filter dropdown", () => {
    expect(SRC).toMatch(/ROLE_FILTER_LABELS\[r\] \?\? r/);
  });
});

describe('EmployeePond.css — E8 list row contract', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('list-row is a flex container with brand-navy hover ring', () => {
    expect(CSS).toMatch(/\.employee-pond__list-row \{[\s\S]*?display: flex/);
    expect(CSS).toMatch(/\.employee-pond__list-row:hover,\s*\n?\s*\.employee-pond__list-row\[data-hovered='true'\]/);
  });

  it("selected row gets a brand-navy border + soft shadow", () => {
    expect(CSS).toMatch(
      /\.employee-pond__list-row\[data-selected='true'\] \{[\s\S]*?border-color: var\(--color-brand-navy\)/,
    );
  });

  it('avatar is a 36 px circle that crops images', () => {
    expect(CSS).toMatch(/\.employee-pond__list-avatar \{[\s\S]*?width: 36px;[\s\S]*?height: 36px;[\s\S]*?border-radius: 50%/);
    expect(CSS).toMatch(/\.employee-pond__list-avatar-img \{[\s\S]*?object-fit: cover/);
  });

  it('role pill uses --color-bg-subtle + the canonical pill radius', () => {
    expect(CSS).toMatch(
      /\.employee-pond__list-role-pill \{[\s\S]*?background: var\(--color-bg-subtle\);[\s\S]*?border-radius: var\(--radius-pill\)/,
    );
  });

  it("phone breakpoint collapses the list grid to a single column", () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?\.employee-pond__list \{[\s\S]*?grid-template-columns: 1fr/);
  });

  it("still uses canonical tokens (no drift names)", () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
  });
});
