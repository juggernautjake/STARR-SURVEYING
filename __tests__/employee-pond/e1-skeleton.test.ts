// __tests__/employee-pond/e1-skeleton.test.ts
//
// employee-pond Slice E1 — view toggle + pond skeleton. Locks the
// pure helpers (seed + placement + PRNG), the source-string contract
// for the page wiring (toggle + localStorage + conditional render),
// and the CSS surface contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPondSeed,
  mulberry32,
  placeOrb,
  type PondEmployee,
} from '@/app/admin/employees/EmployeePond';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function fakeEmp(id: string): PondEmployee {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    roles: ['employee'],
    avatar_url: null,
    job_title: null,
    hire_date: null,
  };
}

describe('buildPondSeed', () => {
  it('produces a stable 32-bit number for the same set of employees', () => {
    const a = buildPondSeed([fakeEmp('a'), fakeEmp('b')]);
    const b = buildPondSeed([fakeEmp('a'), fakeEmp('b')]);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('changes when the employee set changes', () => {
    const a = buildPondSeed([fakeEmp('a')]);
    const b = buildPondSeed([fakeEmp('a'), fakeEmp('b')]);
    expect(a).not.toBe(b);
  });

  it('produces 0 for an empty input', () => {
    expect(buildPondSeed([])).toBe(0);
  });
});

describe('mulberry32 PRNG', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('placeOrb — uniform-disc sampling', () => {
  it('keeps every orb inside the pond radius (×0.85 safety margin)', () => {
    const r = mulberry32(7);
    const radius = 200;
    for (let i = 0; i < 500; i++) {
      const p = placeOrb(r, radius);
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      expect(dist).toBeLessThanOrEqual(radius * 0.85 + 0.0001);
    }
  });

  it('does not bias points to one quadrant (sqrt distribution)', () => {
    const r = mulberry32(11);
    const quadrants = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      const p = placeOrb(r, 100);
      const q = (p.x >= 0 ? 0 : 1) + (p.y >= 0 ? 0 : 2);
      quadrants[q]++;
    }
    // Each quadrant should hold roughly 1000; bound at ±20% so a
    // PRNG quirk doesn't sink the test.
    for (const c of quadrants) {
      expect(c).toBeGreaterThan(800);
      expect(c).toBeLessThan(1200);
    }
  });
});

describe('EmployeePond.tsx — E1 skeleton render', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it("uses 'use client' so the eventual hooks land", () => {
    expect(SRC).toMatch(/'use client';/);
  });

  it('exports PondEmployee + the pure helpers', () => {
    expect(SRC).toMatch(/export interface PondEmployee/);
    expect(SRC).toMatch(/export function buildPondSeed/);
    expect(SRC).toMatch(/export function placeOrb/);
    expect(SRC).toMatch(/export function mulberry32/);
  });

  it("renders the pond surface + toolbar + below-pond list with stable testIDs", () => {
    expect(SRC).toMatch(/data-testid="employee-pond"/);
    expect(SRC).toMatch(/data-testid="employee-pond-toolbar"/);
    expect(SRC).toMatch(/data-testid="employee-pond-surface"/);
    expect(SRC).toMatch(/data-testid="employee-pond-list"/);
  });

  it('every orb carries a stable testID + data-employee-id', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-orb"/);
    expect(SRC).toMatch(/data-employee-id=\{employee\.id\}/);
  });

  it("falls back to initials when avatar_url is missing", () => {
    expect(SRC).toMatch(/employee\.avatar_url \?/);
    expect(SRC).toMatch(/className="employee-pond__orb-initials"/);
  });

  it('exposes search + filter slots even though E1 leaves them disabled', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-search"/);
    expect(SRC).toMatch(/data-testid="employee-pond-filter-btn"/);
  });
});

describe('/admin/employees/page.tsx — E1 view toggle wiring', () => {
  const SRC = read('app/admin/employees/page.tsx');

  it('imports the pond component + stylesheet', () => {
    expect(SRC).toMatch(/import EmployeePond from '\.\/EmployeePond';/);
    expect(SRC).toMatch(/import '\.\.\/styles\/EmployeePond\.css';/);
  });

  it('declares a localStorage key for the view preference', () => {
    expect(SRC).toMatch(/const VIEW_PREF_KEY = 'admin\/employees\/view';/);
  });

  it("readSavedView returns 'pond' only when the key holds 'pond'", () => {
    expect(SRC).toMatch(/return v === 'pond' \? 'pond' : 'list';/);
  });

  it('hydrates the view from localStorage in a useEffect (SSR-safe)', () => {
    expect(SRC).toMatch(/setView\(readSavedView\(\)\);/);
  });

  it('renders the two-button view toggle with data-action="view-list/pond"', () => {
    expect(SRC).toMatch(/data-testid="employees-view-toggle"/);
    expect(SRC).toMatch(/data-action=\{`view-\$\{v\}`\}/);
    expect(SRC).toMatch(/data-current=\{view === v \? 'true' : undefined\}/);
  });

  it("conditionally renders the pond when view === 'pond'", () => {
    expect(SRC).toMatch(/view === 'pond' \? \(/);
    expect(SRC).toMatch(/<EmployeePond[\s\S]*?employees=\{employees\.map/);
  });
});

describe('EmployeePond.css — E1 contract', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('declares the pond circle with a CSS variable for the radius', () => {
    // Slice P1 — the explicit width moved from `.employee-pond__pond`
    // to a new `.employee-pond__pond-wrap` so the dialogue can
    // escape the pond's overflow:hidden clip. The pond itself now
    // uses `position: absolute; inset: 0` to fill the wrap, and the
    // CSS variable lives on the wrap. Widen the lock accordingly.
    expect(CSS).toMatch(
      /\.employee-pond__pond-wrap \{[\s\S]*?width: calc\(var\(--pond-radius, 280px\) \* 2\)/,
    );
    expect(CSS).toMatch(/\.employee-pond__pond \{[\s\S]*?inset: 0/);
  });

  it('orb is absolutely positioned + has --orb-size variable', () => {
    expect(CSS).toMatch(/\.employee-pond__orb \{[\s\S]*?--orb-size: 64px;[\s\S]*?position: absolute/);
  });

  it("uses canonical brand tokens (no drift names)", () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });

  it('phone breakpoint shrinks the pond + orbs', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?--orb-size: 56px;[\s\S]*?--pond-radius: 160px/);
  });

  it('view toggle on the page uses the same segmented-control shape as the calendar', () => {
    expect(CSS).toMatch(/\.employees-page__view-toggle button\[data-current='true'\] \{[\s\S]*?color: var\(--color-brand-navy\)/);
  });
});
