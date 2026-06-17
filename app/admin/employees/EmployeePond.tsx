// app/admin/employees/EmployeePond.tsx
//
// employee-pond Slice E1 — alternative viewer skeleton. Renders the
// container surface (toolbar slot for search + filter that ship in E2,
// the big pond circle, a below-pond list). Physics + interactions +
// dialogue land in later slices.
//
// Receives `employees` already fetched by the parent so the toggle
// can swap views without a re-fetch.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '@/lib/auth';
import { useEmployeePondPhysics } from './useEmployeePondPhysics';

/** Render-side orb radius (px) for the collision math. The CSS uses
 *  `--orb-size: 64px` on desktop, 56 px on phone; 32 is the desktop
 *  half so collisions feel right on the surface the user spends
 *  most of their time on. */
const ORB_RADIUS_PX = 32;
const POND_RADIUS_PX = 280;

export interface PondEmployee {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  avatar_url: string | null;
  job_title: string | null;
  hire_date: string | null;
}

interface Props {
  employees: PondEmployee[];
}

/** Slice E2 — the 11 roles the registered_users.roles[] array can
 *  hold. Same source-of-truth as the existing employees list page.
 *  Order matters: drives the legend display order. */
const FILTER_ROLES: readonly UserRole[] = [
  'admin',
  'employee',
  'field_crew',
  'equipment_manager',
  'drawer',
  'researcher',
  'tech_support',
  'teacher',
  'student',
  'developer',
  'guest',
];

const ROLE_FILTER_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  employee: 'Employee',
  field_crew: 'Field Crew',
  equipment_manager: 'Equipment Mgr',
  drawer: 'Drawer',
  researcher: 'Researcher',
  tech_support: 'Tech Support',
  teacher: 'Teacher',
  student: 'Student',
  developer: 'Developer',
  guest: 'Guest',
};

/** Slice E2 — search + role filter contract. Search is name + email
 *  only (case-insensitive substring); role filter is a Set; an empty
 *  Set means "all roles pass". Pure so the source-lock can verify
 *  each branch without React. */
export interface EmployeeFilter {
  query: string;
  selectedRoles: ReadonlySet<UserRole>;
}

export function matchesEmployee(
  employee: PondEmployee,
  filter: EmployeeFilter,
): boolean {
  const q = filter.query.trim().toLowerCase();
  if (q.length > 0) {
    const hayName = employee.name.toLowerCase();
    const hayEmail = employee.email.toLowerCase();
    if (!hayName.includes(q) && !hayEmail.includes(q)) return false;
  }
  if (filter.selectedRoles.size > 0) {
    let hit = false;
    for (const r of employee.roles) {
      if (filter.selectedRoles.has(r)) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

export function filterEmployees(
  employees: PondEmployee[],
  filter: EmployeeFilter,
): PondEmployee[] {
  return employees.filter((e) => matchesEmployee(e, filter));
}

/** Pure helper — produces a stable initial layout seed per employee
 *  set so a strict-mode double-render doesn't reshuffle the pond
 *  before first paint. The hook layer (E3) will read this to place
 *  orbs; E1 just locks the contract. */
export function buildPondSeed(employees: PondEmployee[]): number {
  let h = 0;
  for (const e of employees) {
    for (let i = 0; i < e.id.length; i++) {
      h = (h * 31 + e.id.charCodeAt(i)) | 0;
    }
  }
  return h >>> 0;
}

/** Pure helper — random orb placement inside the pond circle. Used
 *  by both the renderer and the source-lock test. Polar coordinates
 *  with uniform-disc sampling so the orbs don't bias toward the
 *  edge. */
export function placeOrb(
  rand: () => number,
  pondRadius: number,
): { x: number; y: number } {
  const r = Math.sqrt(rand()) * pondRadius * 0.85;
  const theta = rand() * Math.PI * 2;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** Mulberry32 — small deterministic PRNG used to seed the initial
 *  layout. The pond looks random to the user but stays stable across
 *  React's double-mount. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function EmployeePond({ employees }: Props) {
  const seed = useMemo(() => buildPondSeed(employees), [employees]);
  // Slice E2 — search + role filter state. Search drives the orb
  // filter via a pure helper so the source-lock test can cover
  // every branch without React.
  const [query, setQuery] = useState<string>('');
  const [selectedRoles, setSelectedRoles] = useState<ReadonlySet<UserRole>>(
    () => new Set<UserRole>(),
  );
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / Esc to dismiss the filter panel.
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!filterPanelRef.current) return;
      if (filterPanelRef.current.contains(e.target as Node)) return;
      setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const toggleRole = (role: UserRole) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };
  const clearFilters = () => {
    setQuery('');
    setSelectedRoles(new Set());
  };

  const visibleEmployees = useMemo(
    () => filterEmployees(employees, { query, selectedRoles }),
    [employees, query, selectedRoles],
  );

  // E3 — refs map keyed by employee id so the physics hook can
  // imperatively write `transform` to each orb every frame
  // without going through React. `useRef` + callback refs so
  // strict-mode double-mount doesn't leak ghosts.
  const orbRefsRef = useRef<Map<string, HTMLElement | null>>(new Map());
  const visibleIds = useMemo(
    () => visibleEmployees.map((e) => e.id),
    [visibleEmployees],
  );
  useEmployeePondPhysics(orbRefsRef.current, {
    visibleIds,
    pondRadius: POND_RADIUS_PX,
    orbRadius: ORB_RADIUS_PX,
    seed,
    enabled: true,
  });
  const setOrbRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) orbRefsRef.current.set(id, el);
      else orbRefsRef.current.delete(id);
    },
    [],
  );

  const filterCount = selectedRoles.size;

  return (
    <div className="employee-pond" data-testid="employee-pond">
      <div className="employee-pond__toolbar" data-testid="employee-pond-toolbar">
        <input
          type="search"
          className="employee-pond__search"
          placeholder="Search by name or email…"
          data-testid="employee-pond-search"
          aria-label="Search employees by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div
          className="employee-pond__filter-wrap"
          ref={filterPanelRef}
          data-testid="employee-pond-filter-wrap"
        >
          <button
            type="button"
            className="employee-pond__filter-btn"
            data-testid="employee-pond-filter-btn"
            data-open={filterOpen ? 'true' : undefined}
            onClick={() => setFilterOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={filterOpen}
          >
            Filter by role{filterCount > 0 ? ` (${filterCount})` : ''}
            <span className="employee-pond__filter-caret" aria-hidden>▾</span>
          </button>
          {filterOpen && (
            <div
              className="employee-pond__filter-panel"
              data-testid="employee-pond-filter-panel"
              role="dialog"
              aria-label="Filter by role"
            >
              <ul className="employee-pond__filter-list">
                {FILTER_ROLES.map((role) => {
                  const checked = selectedRoles.has(role);
                  return (
                    <li key={role}>
                      <label className="employee-pond__filter-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(role)}
                          data-testid={`employee-pond-filter-${role}`}
                        />
                        <span>{ROLE_FILTER_LABELS[role]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="employee-pond__filter-clear"
                data-testid="employee-pond-filter-clear"
                onClick={clearFilters}
                disabled={query === '' && filterCount === 0}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
        <span
          className="employee-pond__count"
          data-testid="employee-pond-count"
          aria-live="polite"
        >
          Showing {visibleEmployees.length} of {employees.length}
        </span>
      </div>

      <div
        className="employee-pond__surface"
        data-testid="employee-pond-surface"
        data-orb-count={visibleEmployees.length}
        // The CSS keys on this --radius var so the surface and the
        // child orb absolute positions agree on geometry.
        style={{ ['--pond-radius' as string]: '280px' }}
      >
        <div className="employee-pond__pond" aria-label="Employee pond">
          {visibleEmployees.map((employee) => (
            <div
              key={employee.id}
              ref={setOrbRef(employee.id)}
              className="employee-pond__orb"
              data-testid="employee-pond-orb"
              data-employee-id={employee.id}
              role="button"
              tabIndex={0}
              aria-label={`${employee.name} — ${employee.email}`}
            >
              {employee.avatar_url ? (
                <img
                  src={employee.avatar_url}
                  alt={employee.name}
                  className="employee-pond__orb-img"
                  loading="lazy"
                />
              ) : (
                <span className="employee-pond__orb-initials" aria-hidden>
                  {employee.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Slice E2 — below-pond list now mirrors the visible
          employees so the user sees a flat readout of who's
          currently in the pond. E8 will style it further. */}
      <ul className="employee-pond__list" data-testid="employee-pond-list">
        {visibleEmployees.length === 0 ? (
          <li
            className="employee-pond__list-empty"
            data-testid="employee-pond-list-empty"
          >
            No employees match the current search or filters.
          </li>
        ) : (
          visibleEmployees.map((e) => (
            <li key={e.id} className="employee-pond__list-item">
              <span className="employee-pond__list-name">{e.name}</span>
              <span className="employee-pond__list-email">{e.email}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
