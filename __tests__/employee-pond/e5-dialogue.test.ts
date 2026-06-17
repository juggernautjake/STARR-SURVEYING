// __tests__/employee-pond/e5-dialogue.test.ts
//
// employee-pond Slice E5 — click → side dialogue panel.
// Locks the pure anchor helper (every quadrant + origin corner),
// the years-with-company derivation, and the page wiring (state,
// open + close handlers, escape, click-outside backdrop, action
// data-attrs for E9 to wire later).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  anchorDialogue,
  yearsWithCompany,
} from '@/lib/employee-pond/dialogue-anchor';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('anchorDialogue — pure positioning helper', () => {
  const base = {
    orbRadius: 32,
    dialogueWidth: 280,
    dialogueHeight: 360,
    gap: 16,
    pondRadius: 280,
  };

  it('orb in top-left → dialogue to the RIGHT + BELOW + origin=top-left', () => {
    const r = anchorDialogue({ ...base, orbX: -100, orbY: -100 });
    // Below: top > orbY; right: left > orbX
    expect(r.top).toBeGreaterThan(-100);
    expect(r.left).toBeGreaterThan(-100);
    expect(r.origin).toBe('top-left');
  });

  it('orb in top-right → dialogue to the LEFT + BELOW + origin=top-right', () => {
    const r = anchorDialogue({ ...base, orbX: 100, orbY: -100 });
    expect(r.left).toBeLessThan(100); // pushed left
    expect(r.top).toBeGreaterThan(-100); // pushed down
    expect(r.origin).toBe('top-right');
  });

  it('orb in bottom-left → dialogue to the RIGHT + ABOVE + origin=bottom-left', () => {
    const r = anchorDialogue({ ...base, orbX: -100, orbY: 100 });
    expect(r.left).toBeGreaterThan(-100); // pushed right
    expect(r.top).toBeLessThan(100); // pushed up
    expect(r.origin).toBe('bottom-left');
  });

  it('orb in bottom-right → dialogue to the LEFT + ABOVE + origin=bottom-right', () => {
    const r = anchorDialogue({ ...base, orbX: 100, orbY: 100 });
    expect(r.left).toBeLessThan(100); // pushed left
    expect(r.top).toBeLessThan(100); // pushed up
    expect(r.origin).toBe('bottom-right');
  });

  it('orb at exact center has defined behavior (right + above bias)', () => {
    // placeRight = orbX <= 0 → right; placeBelow = orbY < 0 → above.
    // So an orb at (0,0) anchors the dialogue to the right + above.
    const r = anchorDialogue({ ...base, orbX: 0, orbY: 0 });
    expect(r.left).toBeGreaterThanOrEqual(0); // pushed right
    expect(r.top).toBeLessThan(0); // pushed up
    expect(r.origin).toBe('bottom-left'); // orb sits at dialogue's bottom-left
  });

  it('respects the gap so the dialogue doesn\'t overlap the orb', () => {
    const r = anchorDialogue({ ...base, orbX: -100, orbY: -100, gap: 16 });
    expect(r.left).toBeGreaterThanOrEqual(-100 + 32 + 16);
    expect(r.top).toBeGreaterThanOrEqual(-100 + 32 + 16);
  });
});

describe('yearsWithCompany', () => {
  it('returns null for null / undefined / unparseable hire date', () => {
    expect(yearsWithCompany(null)).toBeNull();
    expect(yearsWithCompany(undefined)).toBeNull();
    expect(yearsWithCompany('not a date')).toBeNull();
  });

  it('returns 0 for a hire date in the future', () => {
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    expect(yearsWithCompany(future)).toBe(0);
  });

  it('returns ~3.5 for a hire date 3.5 years ago (one decimal)', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    const hire = new Date('2022-12-16T00:00:00Z').toISOString();
    const y = yearsWithCompany(hire, now);
    expect(y).not.toBeNull();
    expect(y!).toBeGreaterThanOrEqual(3.4);
    expect(y!).toBeLessThanOrEqual(3.6);
  });
});

describe('EmployeePond.tsx — E5 dialogue wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('imports the anchor helper + yearsWithCompany', () => {
    expect(SRC).toMatch(/import \{\s*\n\s*anchorDialogue,\s*\n\s*yearsWithCompany,/);
  });

  it('declares the selectedEmployee + dialoguePosition state', () => {
    expect(SRC).toMatch(/const \[selectedEmployee, setSelectedEmployee\] = useState<PondEmployee \| null>/);
    expect(SRC).toMatch(/const \[dialoguePosition, setDialoguePosition\] = useState</);
  });

  it('handleOrbClick reads the orb\'s current physics position before anchoring', () => {
    expect(SRC).toMatch(/physics\.orbs\.find\(\(o\) => o\.id === employee\.id\)/);
    expect(SRC).toMatch(/anchorDialogue\(\{[\s\S]*?orbX: x,[\s\S]*?orbY: y/);
  });

  it("orb element gets onClick + onKeyDown handlers + a data-selected mirror", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleOrbClick\(employee\)\}/);
    expect(SRC).toMatch(/onKeyDown=\{\(e\) => \{[\s\S]*?if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
    expect(SRC).toMatch(/data-selected=\{selectedEmployee\?\.id === employee\.id \? 'true' : undefined\}/);
  });

  it("Esc dismisses via document-level keydown listener (active only when open)", () => {
    expect(SRC).toMatch(/if \(!selectedEmployee\) return;[\s\S]*?document\.addEventListener\('keydown', onKey\)/);
    expect(SRC).toMatch(/if \(e\.key === 'Escape'\) closeDialogue\(\)/);
  });

  it("dialogue backdrop + panel + close button each carry stable testIDs", () => {
    expect(SRC).toMatch(/data-testid="employee-pond-dialogue-backdrop"/);
    expect(SRC).toMatch(/data-testid="employee-pond-dialogue"/);
    expect(SRC).toMatch(/data-testid="employee-pond-dialogue-close"/);
  });

  it("dialogue carries data-origin reflecting the anchor for the transform-origin CSS", () => {
    expect(SRC).toMatch(/data-origin=\{dialoguePosition\.origin\}/);
  });

  it("renders all five field rows (roles / job title / years / DOB·age·gender / employment)", () => {
    expect(SRC).toMatch(/<dt>Roles<\/dt>/);
    expect(SRC).toMatch(/<dt>Job title<\/dt>/);
    expect(SRC).toMatch(/<dt>Years with company<\/dt>/);
    expect(SRC).toMatch(/<dt>DOB · Age · Gender<\/dt>/);
    expect(SRC).toMatch(/<dt>Employment type<\/dt>/);
  });

  it("Open profile link goes to /admin/employees/manage?email=<encoded>", () => {
    expect(SRC).toMatch(/`\/admin\/employees\/manage\?email=\$\{encodeURIComponent\(selectedEmployee\.email\)\}`/);
    expect(SRC).toMatch(/data-action="open-profile"/);
  });

  it("Email + DM contact buttons carry data-action so E9 can wire them", () => {
    expect(SRC).toMatch(/data-action="contact-email"/);
    expect(SRC).toMatch(/data-action="contact-dm"/);
  });

  it("backdrop click closes; dialogue click does not propagate", () => {
    expect(SRC).toMatch(/onClick=\{closeDialogue\}/);
    expect(SRC).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});

describe('EmployeePond.css — E5 dialogue contract', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it("declares the dialogue surface with brand-navy primary button", () => {
    expect(CSS).toMatch(/\.employee-pond__dialogue \{/);
    expect(CSS).toMatch(
      /\.employee-pond__dialogue-btn--primary \{[\s\S]*?background: var\(--color-brand-navy\)/,
    );
  });

  it("selected orb gets a brand-navy outline ring", () => {
    expect(CSS).toMatch(
      /\.employee-pond__orb\[data-selected='true'\] \{[\s\S]*?outline: 3px solid var\(--color-brand-navy\)/,
    );
  });

  it("prefers-reduced-motion disables the dialogue's pop animation", () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.employee-pond__dialogue \{[\s\S]*?animation: none/,
    );
  });

  it("still uses canonical tokens (no drift names)", () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
  });
});
