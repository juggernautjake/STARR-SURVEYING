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
import {
  anchorDialogue,
  yearsWithCompany,
  type DialogueOrigin,
} from '@/lib/employee-pond/dialogue-anchor';
import {
  pointerToPondCoords,
  computeReleaseVelocity,
  exceedsDragThreshold,
  detectShake,
  MOTION_BUFFER_LIMIT,
  type MotionSample,
} from '@/lib/employee-pond/drag';

/** Slice E7 — particles spawned at collision points + at shake
 *  release. State holds only what the JSX needs; CSS owns the
 *  animation, which auto-removes via onAnimationEnd. */
interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}
const MAX_ACTIVE_PARTICLES = 64;

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

  // Slice E5 — click dialogue. `selectedEmployee` carries everything
  // the panel renders so we don't have to re-resolve from the
  // employees array. `dialoguePosition` is computed at click time
  // from the orb's CURRENT physics position so the panel grows out
  // of that spot (the orb continues drifting; the panel stays put).
  const [selectedEmployee, setSelectedEmployee] = useState<PondEmployee | null>(null);
  const [dialoguePosition, setDialoguePosition] = useState<{
    left: number;
    top: number;
    origin: DialogueOrigin;
  } | null>(null);
  const dialogueRef = useRef<HTMLDivElement | null>(null);

  // Slice E10 — prefers-reduced-motion respected end-to-end. When
  // true, the physics rAF loop is paused (orbs render at their
  // initial seeded positions), particle spawning is short-circuited,
  // and the cursor attraction is bypassed via the disabled loop.
  // The CSS reduced-motion blocks (set by prior slices) collapse the
  // remaining transitions for hover / dialogue pop / tooltip / etc.
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Slice E10 — capture the orb element that opened the dialogue so
  // we can return focus to it on close (avoids the screen-reader
  // user landing back at the document root after dismissing).
  const dialogueOpenerRef = useRef<HTMLElement | null>(null);

  // Slice E4 — hover state. Tracks the orb the cursor is currently
  // over so we can scale that orb (and grow its collision radius —
  // the existing repulsion loop bumps neighbors). Tooltip renders
  // inside the hovered orb.
  const [hoveredEmployeeId, setHoveredEmployeeId] = useState<string | null>(null);
  const prevHoveredRef = useRef<string | null>(null);
  const HOVER_SCALE = 1.18;
  const HOVER_RADIUS = ORB_RADIUS_PX * HOVER_SCALE;

  // Slice E6b — selection scale + previous tracker. While the
  // dialogue is open, the selected orb stays enlarged (matching the
  // hover bump) so the user can see which one the dialogue points
  // at even after their cursor moves away.
  const prevSelectedRef = useRef<string | null>(null);
  const SELECTION_SCALE = HOVER_SCALE;
  const SELECTION_RADIUS = HOVER_RADIUS;

  // Slice E6 — drag refs. All non-rendering state so React doesn't
  // re-render the world on every pointermove event. `pondElRef`
  // points at the .employee-pond__pond element so we can read its
  // bounding rect inside the pointer handlers.
  const pondElRef = useRef<HTMLDivElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    orbX: number;
    orbY: number;
  } | null>(null);
  const dragMotionRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const motionSamplesRef = useRef<MotionSample[]>([]);
  /** Suppresses the synthetic click event that fires after a drag
   *  pointerup so a drag-then-release doesn't accidentally open
   *  the dialogue. */
  const suppressNextClickRef = useRef<boolean>(false);
  /** Slice E7 — set when shake-to-release has already fired during
   *  the current drag so pointermove + pointerup know not to
   *  re-apply drag logic. */
  const shakeReleasedRef = useRef<boolean>(false);

  // Slice E7 — particle pool + spawner. State drives the render;
  // CSS animation auto-removes each particle 600 ms after spawn
  // via onAnimationEnd. The pool caps at MAX_ACTIVE_PARTICLES so a
  // user dragging through dozens of orbs can't slow the page.
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleSeqRef = useRef<number>(0);
  const spawnParticles = useCallback((x: number, y: number, count: number) => {
    // Slice E10 — respect prefers-reduced-motion. No particles at all
    // when the user has asked for less motion; the gesture still
    // works, it just doesn't shower sparkles.
    if (reduceMotion) return;
    const fresh: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      fresh.push({
        id: `p-${particleSeqRef.current++}`,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        // Brand palette range: navy (220) → indigo / violet (290).
        hue: 220 + Math.floor(Math.random() * 70),
      });
    }
    setParticles((prev) => {
      const next = [...prev, ...fresh];
      return next.length > MAX_ACTIVE_PARTICLES
        ? next.slice(next.length - MAX_ACTIVE_PARTICLES)
        : next;
    });
  }, [reduceMotion]);
  const removeParticle = useCallback((id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);
  /** Slice E7 — collision callback handed to the physics hook.
   *  Throttle via a per-frame guard so a single deep overlap that
   *  fires every step doesn't drown the pond in particles. */
  const lastCollisionAtRef = useRef<number>(0);
  const handleDraggedCollision = useCallback(
    (e: { x: number; y: number; force: number }) => {
      const now = performance.now();
      if (now - lastCollisionAtRef.current < 40) return;
      lastCollisionAtRef.current = now;
      // Scale particle count with collision force, clamped 3..7.
      const count = Math.max(3, Math.min(7, Math.round(3 + e.force / 80)));
      spawnParticles(e.x, e.y, count);
    },
    [spawnParticles],
  );
  // Bridge the forward reference for the physics hook call above.
  useEffect(() => {
    handleDraggedCollisionRef.current = handleDraggedCollision;
  }, [handleDraggedCollision]);

  /** Slice E7 — kicks neighbors near a release point. Used after
   *  shake-to-release so the pond visibly reacts (orbs jitter
   *  outward, then settle back). Pure-ish (touches physics through
   *  the handle) so we keep it as a helper. */
  const kickNeighbors = useCallback(
    (originX: number, originY: number, range: number, strength: number) => {
      for (const o of physics.orbs) {
        const dx = o.x - originX;
        const dy = o.y - originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0 || dist > range) continue;
        const fall = 1 - dist / range;
        const jitter = 0.5 + Math.random();
        physics.setOrb(o.id, {
          vx: o.vx + (dx / dist) * strength * fall * jitter,
          vy: o.vy + (dy / dist) * strength * fall * jitter,
        });
      }
    },
    // physics handle identity is stable; deps narrow on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
  const physics = useEmployeePondPhysics(orbRefsRef.current, {
    visibleIds,
    pondRadius: POND_RADIUS_PX,
    orbRadius: ORB_RADIUS_PX,
    seed,
    enabled: !reduceMotion,
    // Slice E7 — declared below; the hook reads via a ref so the
    // forward reference here is fine for compilation order.
    onDraggedCollision: (e) => handleDraggedCollisionRef.current?.(e),
  });
  // handleDraggedCollision is defined later (it depends on physics);
  // a ref bridges the order. We assign to the ref in an effect so
  // the latest version is always read.
  const handleDraggedCollisionRef = useRef<
    ((e: { x: number; y: number; force: number }) => void) | null
  >(null);
  const setOrbRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) orbRefsRef.current.set(id, el);
      else orbRefsRef.current.delete(id);
    },
    [],
  );

  /** Slice E5 — orb click opens the dialogue. Reads the orb's CURRENT
   *  physics position so the panel anchors to where the orb actually
   *  is right now (not to its CSS-static origin). Slice E10 also
   *  captures the trigger element so we can return focus on close. */
  const handleOrbClick = useCallback(
    (employee: PondEmployee, opener?: HTMLElement | null) => {
      const orbState = physics.orbs.find((o) => o.id === employee.id);
      const x = orbState?.x ?? 0;
      const y = orbState?.y ?? 0;
      const anchor = anchorDialogue({
        orbX: x,
        orbY: y,
        orbRadius: ORB_RADIUS_PX,
        dialogueWidth: 280,
        dialogueHeight: 360,
        gap: 16,
        pondRadius: POND_RADIUS_PX,
      });
      // Slice E10 — capture the focus origin so closeDialogue can
      // return focus there. Fallback: the orb DOM element.
      dialogueOpenerRef.current =
        opener ??
        orbRefsRef.current.get(employee.id) ??
        (typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null);
      setSelectedEmployee(employee);
      setDialoguePosition(anchor);
    },
    // physics handle is stable across renders by design; declared in
    // deps so a future refactor doesn't accidentally break the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const closeDialogue = useCallback(() => {
    setSelectedEmployee(null);
    setDialoguePosition(null);
    // Slice E10 — return focus to whichever element opened the
    // dialogue (orb or list row) so keyboard + screen-reader users
    // don't get dropped back at the document root.
    const opener = dialogueOpenerRef.current;
    if (opener && typeof opener.focus === 'function') {
      // setTimeout 0 so React's render cycle commits the close
      // first; otherwise the orb may not yet be tabbable.
      setTimeout(() => {
        try {
          opener.focus();
        } catch {
          /* ignore */
        }
      }, 0);
    }
    dialogueOpenerRef.current = null;
  }, []);

  // Esc dismisses the dialogue. Click-outside is handled by an inline
  // overlay so dialogue clicks don't propagate up.
  useEffect(() => {
    if (!selectedEmployee) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialogue();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedEmployee, closeDialogue]);

  // Slice E4 — drive scale + collision radius from the hover state.
  // When the hovered orb changes, the previous one returns to its
  // resting size; the new one grows. The repulsion in the physics
  // step naturally pushes neighbors away from the now-larger orb
  // and they re-converge once it shrinks back.
  //
  // Slice E6b — while the dialogue is open, the selection effect
  // owns the bump for the selected orb. Hover changes are still
  // tracked (for tooltip) but no longer drive scale/radius — that
  // prevents fighting between the two effects.
  useEffect(() => {
    if (selectedEmployee) return; // selection effect owns the bump
    const prev = prevHoveredRef.current;
    if (prev && prev !== hoveredEmployeeId) {
      physics.setOrb(prev, { scale: 1, radius: ORB_RADIUS_PX });
    }
    if (hoveredEmployeeId) {
      physics.setOrb(hoveredEmployeeId, {
        scale: HOVER_SCALE,
        radius: HOVER_RADIUS,
      });
    }
    prevHoveredRef.current = hoveredEmployeeId;
    // physics handle identity is stable; deps intentionally narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredEmployeeId, selectedEmployee]);

  // Slice E6b — selection effect. When the user opens a dialogue,
  // the selected orb stays enlarged + the repulsion loop pushes
  // neighbors away. When the dialogue closes, the selected orb
  // returns to its resting size and the pond settles back together.
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedEmployee?.id) {
      physics.setOrb(prev, { scale: 1, radius: ORB_RADIUS_PX });
    }
    if (selectedEmployee) {
      physics.setOrb(selectedEmployee.id, {
        scale: SELECTION_SCALE,
        radius: SELECTION_RADIUS,
      });
    }
    prevSelectedRef.current = selectedEmployee?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]);

  /** Slice E6 — pointerdown on an orb captures the pointer and
   *  records the drag origin. We don't flip `dragging` in the
   *  physics until the user actually moves past the threshold, so
   *  a tap-and-release still opens the dialogue (E5). */
  const handleOrbPointerDown = useCallback(
    (employee: PondEmployee, e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return; // left/primary only
      const orbState = physics.orbs.find((o) => o.id === employee.id);
      if (!orbState) return;
      draggingIdRef.current = employee.id;
      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        orbX: orbState.x,
        orbY: orbState.y,
      };
      dragMotionRef.current = { dx: 0, dy: 0 };
      motionSamplesRef.current = [];
      suppressNextClickRef.current = false;
      shakeReleasedRef.current = false;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw in obscure browsers; ignore.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOrbPointerMove = useCallback(
    (employee: PondEmployee, e: React.PointerEvent<HTMLDivElement>) => {
      if (draggingIdRef.current !== employee.id) return;
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.pointerX;
      const dy = e.clientY - start.pointerY;
      dragMotionRef.current = { dx, dy };
      if (!exceedsDragThreshold(dx, dy)) return;

      // Cross the threshold once → mark the physics step to skip
      // gravity/damping/bounce for this orb; the orb tracks the
      // pointer until release.
      physics.setDragging(employee.id, true);
      suppressNextClickRef.current = true;

      // Convert the pointer position into pond-center coords so the
      // orb follows the cursor exactly, not the start-relative
      // delta (which would drift if the pointer enters / exits
      // window bounds).
      const rect = pondElRef.current?.getBoundingClientRect();
      if (rect) {
        const pond = pointerToPondCoords(e.clientX, e.clientY, rect);
        physics.setOrb(employee.id, { x: pond.x, y: pond.y });
        const samples = motionSamplesRef.current;
        samples.push({ x: pond.x, y: pond.y, t: performance.now() });
        if (samples.length > MOTION_BUFFER_LIMIT) samples.shift();

        // Slice E7 — shake detection. Only fire once per drag.
        if (!shakeReleasedRef.current && detectShake(samples)) {
          shakeReleasedRef.current = true;
          // Release the orb with a random fling so the user feels
          // the "let go" moment.
          const angle = Math.random() * Math.PI * 2;
          const speed = 600 + Math.random() * 400;
          physics.setOrb(employee.id, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
          physics.setDragging(employee.id, false);
          // Spawn a burst of particles + kick the neighbors so the
          // pond visibly reacts.
          spawnParticles(pond.x, pond.y, 12);
          kickNeighbors(pond.x, pond.y, 140, 220);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOrbPointerUp = useCallback(
    (employee: PondEmployee, e: React.PointerEvent<HTMLDivElement>) => {
      if (draggingIdRef.current !== employee.id) return;
      const motion = dragMotionRef.current;
      const wasDragged = exceedsDragThreshold(motion.dx, motion.dy);
      // Slice E7 — if shake already released the orb, skip the
      // pointerup release-velocity application (the shake already
      // assigned a strong velocity + cleared the dragging flag).
      if (wasDragged && !shakeReleasedRef.current) {
        const release = computeReleaseVelocity(motionSamplesRef.current);
        physics.setOrb(employee.id, { vx: release.vx, vy: release.vy });
        physics.setDragging(employee.id, false);
      }
      // Reset drag state. suppressNextClickRef stays true if a
      // drag happened so the synthetic click is ignored.
      draggingIdRef.current = null;
      dragStartRef.current = null;
      dragMotionRef.current = { dx: 0, dy: 0 };
      motionSamplesRef.current = [];
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleOrbPointerCancel = useCallback(
    (employee: PondEmployee, _e: React.PointerEvent<HTMLDivElement>) => {
      if (draggingIdRef.current !== employee.id) return;
      // The OS reclaimed the pointer (e.g. system gesture). Drop the
      // drag without applying a release velocity so the orb settles.
      physics.setDragging(employee.id, false);
      draggingIdRef.current = null;
      dragStartRef.current = null;
      dragMotionRef.current = { dx: 0, dy: 0 };
      motionSamplesRef.current = [];
      suppressNextClickRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div
          ref={pondElRef}
          className="employee-pond__pond"
          role="region"
          aria-roledescription="Interactive employee pond"
          aria-label={`Employee pond — ${visibleEmployees.length} employee${visibleEmployees.length === 1 ? '' : 's'} visible. Use the list below or Tab to navigate.`}
          data-selection-active={selectedEmployee ? 'true' : undefined}
          onPointerMove={(e) => {
            // Slice E6b — feed pond-relative cursor into the
            // physics so orbs feel a gentle attraction. Skip touch
            // input so a finger swipe (used for drag) doesn't
            // double-fire as an attractor.
            if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
            const rect = pondElRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pond = pointerToPondCoords(e.clientX, e.clientY, rect);
            physics.setCursor(pond);
          }}
          onPointerLeave={() => {
            physics.setCursor(null);
          }}
        >
          {visibleEmployees.map((employee) => (
            <div
              key={employee.id}
              ref={setOrbRef(employee.id)}
              className="employee-pond__orb"
              data-testid="employee-pond-orb"
              data-employee-id={employee.id}
              data-selected={selectedEmployee?.id === employee.id ? 'true' : undefined}
              data-hovered={hoveredEmployeeId === employee.id ? 'true' : undefined}
              role="button"
              tabIndex={0}
              aria-label={`${employee.name} — ${employee.email}`}
              onClick={() => {
                // Slice E6 — drag suppresses the click that would
                // otherwise open the dialogue.
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                handleOrbClick(employee, orbRefsRef.current.get(employee.id) ?? null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOrbClick(employee, e.currentTarget);
                }
              }}
              onPointerEnter={(e) => {
                // Skip mouse hover semantics during a drag (E6) so
                // a panning finger doesn't trigger the radius bump.
                if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
                  setHoveredEmployeeId(employee.id);
                }
              }}
              onPointerLeave={() => {
                setHoveredEmployeeId((cur) => (cur === employee.id ? null : cur));
              }}
              onFocus={() => setHoveredEmployeeId(employee.id)}
              onBlur={() =>
                setHoveredEmployeeId((cur) => (cur === employee.id ? null : cur))
              }
              onPointerDown={(e) => handleOrbPointerDown(employee, e)}
              onPointerMove={(e) => handleOrbPointerMove(employee, e)}
              onPointerUp={(e) => handleOrbPointerUp(employee, e)}
              onPointerCancel={(e) => handleOrbPointerCancel(employee, e)}
            >
              <div className="employee-pond__orb-clip">
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
              {/* Slice E4 — hover tooltip. Always in the DOM so the
                  opacity transition runs cleanly; visibility is
                  driven by the orb's `data-hovered` attribute. */}
              <div
                className="employee-pond__orb-tooltip"
                data-testid="employee-pond-orb-tooltip"
                role="tooltip"
                aria-hidden={hoveredEmployeeId !== employee.id}
              >
                <strong className="employee-pond__orb-tooltip-name">
                  {employee.name}
                </strong>
                <span className="employee-pond__orb-tooltip-email">
                  {employee.email}
                </span>
              </div>
            </div>
          ))}
          {/* Slice E5 — anchored dialogue panel. Lives inside the
              pond surface so its absolute coords share the pond's
              center frame (same as the orbs). Backdrop catches
              clicks outside to dismiss; the panel itself stops
              propagation so internal clicks don't close it. */}
          {/* Slice E7 — particle FX. Each particle's CSS animation
              auto-runs once + onAnimationEnd removes the node. */}
          {particles.map((p) => (
            <span
              key={p.id}
              className="employee-pond__particle"
              data-testid="employee-pond-particle"
              style={
                {
                  '--p-x': p.x,
                  '--p-y': p.y,
                  '--p-vx': p.vx,
                  '--p-vy': p.vy,
                  background: `hsl(${p.hue}deg 70% 60%)`,
                } as React.CSSProperties
              }
              onAnimationEnd={() => removeParticle(p.id)}
              aria-hidden
            />
          ))}
          {selectedEmployee && dialoguePosition && (
            <>
              <div
                className="employee-pond__dialogue-backdrop"
                data-testid="employee-pond-dialogue-backdrop"
                onClick={closeDialogue}
              />
              <div
                ref={dialogueRef}
                className="employee-pond__dialogue"
                data-testid="employee-pond-dialogue"
                data-origin={dialoguePosition.origin}
                role="dialog"
                aria-label={`${selectedEmployee.name} details`}
                style={{
                  transform: `translate(${dialoguePosition.left}px, ${dialoguePosition.top}px)`,
                  transformOrigin: dialoguePosition.origin.replace('-', ' '),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="employee-pond__dialogue-close"
                  data-testid="employee-pond-dialogue-close"
                  data-action="close-dialogue"
                  aria-label="Close"
                  onClick={closeDialogue}
                >
                  ×
                </button>
                <div className="employee-pond__dialogue-head">
                  {selectedEmployee.avatar_url ? (
                    <img
                      src={selectedEmployee.avatar_url}
                      alt={selectedEmployee.name}
                      className="employee-pond__dialogue-avatar"
                    />
                  ) : (
                    <span
                      className="employee-pond__dialogue-avatar employee-pond__dialogue-avatar--initials"
                      aria-hidden
                    >
                      {selectedEmployee.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                  )}
                  <div className="employee-pond__dialogue-head-text">
                    <h3 className="employee-pond__dialogue-name">{selectedEmployee.name}</h3>
                    <p className="employee-pond__dialogue-email">{selectedEmployee.email}</p>
                  </div>
                </div>
                <dl className="employee-pond__dialogue-fields">
                  <div>
                    <dt>Roles</dt>
                    <dd>
                      {selectedEmployee.roles.length > 0
                        ? selectedEmployee.roles
                            .map((r) => ROLE_FILTER_LABELS[r] ?? r)
                            .join(', ')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Job title</dt>
                    <dd>{selectedEmployee.job_title ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Years with company</dt>
                    <dd>
                      {(() => {
                        const y = yearsWithCompany(selectedEmployee.hire_date);
                        return y === null ? '—' : `${y} yr${y === 1 ? '' : 's'}`;
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt>DOB · Age · Gender</dt>
                    <dd className="employee-pond__dialogue-dim">— (schema add tracked as E11)</dd>
                  </div>
                  <div>
                    <dt>Employment type</dt>
                    <dd className="employee-pond__dialogue-dim">—</dd>
                  </div>
                </dl>
                <div className="employee-pond__dialogue-actions">
                  <a
                    href={`/admin/employees/manage?email=${encodeURIComponent(selectedEmployee.email)}`}
                    className="employee-pond__dialogue-link"
                    data-action="open-profile"
                    data-testid="employee-pond-dialogue-profile"
                  >
                    Open profile →
                  </a>
                  <div className="employee-pond__dialogue-contact">
                    {/* Slice E9c — Email button routes to the
                        in-app email composer page with the
                        recipient preloaded. E9b's shared
                        recipient store also makes the value
                        flow to the messenger widget + the
                        dedicated /admin/messages page. */}
                    <a
                      href={`/admin/email/new?to=${encodeURIComponent(selectedEmployee.email)}`}
                      className="employee-pond__dialogue-btn"
                      data-action="contact-email"
                      data-testid="employee-pond-dialogue-email"
                    >
                      ✉ Email
                    </a>
                    {/* Slice E9 — Direct Message button. Dispatches a
                        custom event the FloatingMessenger listens for;
                        the widget opens at the bottom-right with the
                        recipient preloaded. E9b will swap to a shared
                        recipient store so the same id flows to the
                        dedicated /admin/messages page. */}
                    <button
                      type="button"
                      className="employee-pond__dialogue-btn employee-pond__dialogue-btn--primary"
                      data-action="contact-dm"
                      data-testid="employee-pond-dialogue-dm"
                      onClick={() => {
                        if (typeof window === 'undefined') return;
                        window.dispatchEvent(
                          new CustomEvent('employee-pond:open-messenger', {
                            detail: { email: selectedEmployee.email },
                          }),
                        );
                        closeDialogue();
                      }}
                    >
                      💬 Message
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slice E8 — below-pond list reads as a flat, scannable
          mirror of who's currently in the pond. Rows are
          clickable (open the same E5 dialogue) and hoverable
          (cross-highlight the matching orb so the user can locate
          a specific employee by name and immediately see where
          they are floating). */}
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
              <button
                type="button"
                className="employee-pond__list-row"
                data-testid="employee-pond-list-row"
                data-employee-id={e.id}
                data-selected={selectedEmployee?.id === e.id ? 'true' : undefined}
                data-hovered={hoveredEmployeeId === e.id ? 'true' : undefined}
                onClick={(ev) => handleOrbClick(e, ev.currentTarget)}
                onPointerEnter={(ev) => {
                  if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
                    setHoveredEmployeeId(e.id);
                  }
                }}
                onPointerLeave={() => {
                  setHoveredEmployeeId((cur) => (cur === e.id ? null : cur));
                }}
                onFocus={() => setHoveredEmployeeId(e.id)}
                onBlur={() =>
                  setHoveredEmployeeId((cur) => (cur === e.id ? null : cur))
                }
              >
                <span className="employee-pond__list-avatar" aria-hidden>
                  {e.avatar_url ? (
                    <img
                      src={e.avatar_url}
                      alt=""
                      className="employee-pond__list-avatar-img"
                      loading="lazy"
                    />
                  ) : (
                    <span className="employee-pond__list-avatar-initials">
                      {e.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="employee-pond__list-text">
                  <span className="employee-pond__list-name">{e.name}</span>
                  <span className="employee-pond__list-email">{e.email}</span>
                  {e.job_title && (
                    <span className="employee-pond__list-title">{e.job_title}</span>
                  )}
                </span>
                <span
                  className="employee-pond__list-roles"
                  aria-label="Roles"
                >
                  {e.roles.slice(0, 3).map((r) => (
                    <span key={r} className="employee-pond__list-role-pill">
                      {ROLE_FILTER_LABELS[r] ?? r}
                    </span>
                  ))}
                  {e.roles.length > 3 && (
                    <span className="employee-pond__list-role-more">
                      +{e.roles.length - 3}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
