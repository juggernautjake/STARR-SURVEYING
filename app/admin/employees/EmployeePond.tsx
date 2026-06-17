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

import { useMemo } from 'react';
import type { UserRole } from '@/lib/auth';

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
  // E1 — static layout snapshot. E3 replaces this with the rAF physics
  // loop; the data-attribute + structure stay the same so the source
  // locks survive the swap.
  const orbs = useMemo(() => {
    const rand = mulberry32(seed);
    const pondRadius = 280;
    return employees.map((e) => ({
      employee: e,
      pos: placeOrb(rand, pondRadius),
    }));
  }, [employees, seed]);

  return (
    <div className="employee-pond" data-testid="employee-pond">
      <div className="employee-pond__toolbar" data-testid="employee-pond-toolbar">
        {/* Slice E2 — search bar + role filter dropdown land here. */}
        <input
          type="search"
          className="employee-pond__search"
          placeholder="Search by name or email…"
          data-testid="employee-pond-search"
          aria-label="Search employees by name or email"
          disabled
        />
        <button
          type="button"
          className="employee-pond__filter-btn"
          data-testid="employee-pond-filter-btn"
          disabled
        >
          Filter by role
        </button>
      </div>

      <div
        className="employee-pond__surface"
        data-testid="employee-pond-surface"
        data-orb-count={orbs.length}
        // The CSS keys on this --radius var so the surface and the
        // child orb absolute positions agree on geometry.
        style={{ ['--pond-radius' as string]: '280px' }}
      >
        <div className="employee-pond__pond" aria-label="Employee pond">
          {orbs.map(({ employee, pos }) => (
            <div
              key={employee.id}
              className="employee-pond__orb"
              data-testid="employee-pond-orb"
              data-employee-id={employee.id}
              style={{
                transform: `translate3d(calc(${pos.x}px - 50%), calc(${pos.y}px - 50%), 0)`,
              }}
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

      {/* Slice E8 — below-pond list of currently-visible employees.
          E1 stubs it as a basic list so the layout settles. */}
      <ul className="employee-pond__list" data-testid="employee-pond-list">
        {employees.map((e) => (
          <li key={e.id} className="employee-pond__list-item">
            <span className="employee-pond__list-name">{e.name}</span>
            <span className="employee-pond__list-email">{e.email}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
