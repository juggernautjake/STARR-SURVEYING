// __tests__/employee-pond/e2-search-filter.test.ts
//
// employee-pond Slice E2 — search bar (name + email) + multi-select
// role filter. Locks the pure helpers (matchesEmployee, filterEmployees)
// + the page wiring (state, click-outside dismissal, count chip,
// filter panel with checkbox per role, clear-filters button).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  filterEmployees,
  matchesEmployee,
  type EmployeeFilter,
  type PondEmployee,
} from '@/app/admin/employees/EmployeePond';
import type { UserRole } from '@/lib/auth';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Generate a deterministic email per name so the test doesn't leak
 *  the default 'rachel@…' email into Jacob/Hank cases (which would
 *  flake the "Jacob doesn't match 'ra'" assertion). */
function emp(overrides: Partial<PondEmployee> = {}): PondEmployee {
  const base: PondEmployee = {
    id: 'u1',
    email: 'rachel@starr-surveying.com',
    name: 'Rachel Greene',
    roles: ['employee'],
    avatar_url: null,
    job_title: null,
    hire_date: null,
  };
  const merged = { ...base, ...overrides };
  // When the caller overrode the name but not the email, derive the
  // email from the name so the search predicate sees consistent data.
  if (overrides.name && !overrides.email) {
    const slug = String(overrides.name).toLowerCase().replace(/\s+/g, '.');
    merged.email = `${slug}@starr-surveying.com`;
  }
  return merged;
}

function filter(overrides: Partial<EmployeeFilter> = {}): EmployeeFilter {
  return {
    query: '',
    selectedRoles: new Set<UserRole>(),
    ...overrides,
  };
}

describe('matchesEmployee — pure predicate', () => {
  it('empty filter passes everyone through', () => {
    expect(matchesEmployee(emp(), filter())).toBe(true);
  });

  it('substring on name (case-insensitive)', () => {
    expect(matchesEmployee(emp({ name: 'Rachel' }), filter({ query: 'ra' }))).toBe(true);
    expect(matchesEmployee(emp({ name: 'Raphael' }), filter({ query: 'RA' }))).toBe(true);
    expect(matchesEmployee(emp({ name: 'Jacob' }), filter({ query: 'ra' }))).toBe(false);
  });

  it('substring on email', () => {
    expect(matchesEmployee(emp({ email: 'jacob@x.com' }), filter({ query: 'jacob' }))).toBe(true);
    expect(matchesEmployee(emp({ email: 'hank@x.com' }), filter({ query: 'jacob' }))).toBe(false);
  });

  it('trims whitespace before matching so "  ra  " behaves like "ra"', () => {
    expect(matchesEmployee(emp({ name: 'Randall' }), filter({ query: '  ra  ' }))).toBe(true);
  });

  it('does NOT match against the roles array (role search is the dropdown\'s job)', () => {
    expect(
      matchesEmployee(emp({ roles: ['admin'] as UserRole[], name: 'Zed' }), filter({ query: 'admin' })),
    ).toBe(false);
  });

  it('role filter: empty set passes everyone', () => {
    expect(
      matchesEmployee(emp({ roles: ['employee'] as UserRole[] }), filter({ selectedRoles: new Set() })),
    ).toBe(true);
  });

  it('role filter: at least one role must match (OR semantics)', () => {
    const f = filter({ selectedRoles: new Set<UserRole>(['admin', 'field_crew']) });
    expect(matchesEmployee(emp({ roles: ['employee'] as UserRole[] }), f)).toBe(false);
    expect(matchesEmployee(emp({ roles: ['field_crew'] as UserRole[] }), f)).toBe(true);
    expect(matchesEmployee(emp({ roles: ['admin', 'employee'] as UserRole[] }), f)).toBe(true);
  });

  it('combines search + role filter via AND', () => {
    const f = filter({ query: 'jacob', selectedRoles: new Set<UserRole>(['admin']) });
    expect(matchesEmployee(emp({ name: 'Jacob Maddux', roles: ['employee'] }), f)).toBe(false);
    expect(matchesEmployee(emp({ name: 'Jacob Maddux', roles: ['admin'] }), f)).toBe(true);
  });
});

describe('filterEmployees — list-level helper', () => {
  it('returns only matches in the same order as the input', () => {
    const all = [
      emp({ id: '1', name: 'Rachel' }),
      emp({ id: '2', name: 'Hank' }),
      emp({ id: '3', name: 'Randall' }),
    ];
    const result = filterEmployees(all, filter({ query: 'ra' }));
    expect(result.map((e) => e.id)).toEqual(['1', '3']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterEmployees([emp()], filter({ query: 'zzz' }))).toEqual([]);
  });
});

describe('EmployeePond.tsx — E2 page wiring', () => {
  const SRC = read('app/admin/employees/EmployeePond.tsx');

  it('holds the query + selectedRoles + filterOpen state', () => {
    expect(SRC).toMatch(/const \[query, setQuery\] = useState<string>/);
    expect(SRC).toMatch(/const \[selectedRoles, setSelectedRoles\] = useState<ReadonlySet<UserRole>>/);
    expect(SRC).toMatch(/const \[filterOpen, setFilterOpen\] = useState<boolean>/);
  });

  it('renders an enabled search input controlled by query', () => {
    expect(SRC).toMatch(/value=\{query\}/);
    expect(SRC).toMatch(/onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/);
    // E1's `disabled` attribute on the search has been removed —
    // assert by inspecting the search block specifically.
    const searchBlock = SRC.match(/<input\s+type="search"[\s\S]*?\/>/);
    expect(searchBlock).toBeTruthy();
    expect(searchBlock?.[0] ?? '').not.toMatch(/\bdisabled\b/);
  });

  it('renders the filter panel only when filterOpen is true', () => {
    expect(SRC).toMatch(/\{filterOpen && \(/);
    expect(SRC).toMatch(/data-testid="employee-pond-filter-panel"/);
  });

  it('panel has one checkbox per role with stable testIDs', () => {
    expect(SRC).toMatch(/FILTER_ROLES\.map\(\(role\) => \{/);
    expect(SRC).toMatch(/data-testid=\{`employee-pond-filter-\$\{role\}`\}/);
  });

  it("clear-filters button resets both query + selectedRoles", () => {
    expect(SRC).toMatch(/const clearFilters = \(\) => \{/);
    expect(SRC).toMatch(/setQuery\(''\);/);
    expect(SRC).toMatch(/setSelectedRoles\(new Set\(\)\)/);
  });

  it("filter button label shows the selected count when > 0", () => {
    expect(SRC).toMatch(/\$\{filterCount\}/);
  });

  it('click-outside + Esc dismisses the panel', () => {
    expect(SRC).toMatch(/document\.addEventListener\('mousedown', onDown\)/);
    expect(SRC).toMatch(/if \(e\.key === 'Escape'\) setFilterOpen\(false\)/);
  });

  it('renders the live count chip + below-pond list keyed off visibleEmployees', () => {
    expect(SRC).toMatch(/data-testid="employee-pond-count"/);
    expect(SRC).toMatch(/Showing \{visibleEmployees\.length\} of \{employees\.length\}/);
    expect(SRC).toMatch(/visibleEmployees\.length === 0 \? \(/);
    expect(SRC).toMatch(/data-testid="employee-pond-list-empty"/);
  });

  it('orb render is driven by visibleEmployees (not the full set)', () => {
    // E3 replaced the static layout map with a direct render over
    // visibleEmployees + the physics hook for positioning.
    expect(SRC).toMatch(/visibleEmployees\.map\(\(employee\) => \(/);
  });
});

describe('EmployeePond.css — E2 filter panel styling', () => {
  const CSS = read('app/admin/styles/EmployeePond.css');

  it('declares the dropdown panel + pop-in keyframes', () => {
    expect(CSS).toMatch(/\.employee-pond__filter-panel \{[\s\S]*?position: absolute/);
    expect(CSS).toMatch(/@keyframes employee-pond-filter-pop \{/);
  });

  it('checkbox uses brand-navy accent-color so it visually rhymes with the system', () => {
    expect(CSS).toMatch(/accent-color: var\(--color-brand-navy\)/);
  });

  it('clear-filters button turns error-red on hover so it telegraphs the destructive intent', () => {
    expect(CSS).toMatch(
      /\.employee-pond__filter-clear:hover:not\(:disabled\) \{[\s\S]*?border-color: var\(--color-error\);[\s\S]*?color: var\(--color-error\)/,
    );
  });

  it('count chip + empty-list styling exist', () => {
    expect(CSS).toMatch(/\.employee-pond__count \{/);
    expect(CSS).toMatch(/\.employee-pond__list-empty \{/);
  });

  it('still uses canonical tokens (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
  });
});
