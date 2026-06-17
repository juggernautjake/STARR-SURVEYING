// app/admin/employees/useEmployeePondPhysics.ts
//
// employee-pond Slice E3 — requestAnimationFrame loop that owns the
// pond physics. Imperative DOM updates: each frame the hook calls
// `stepPhysics` then writes `transform` directly onto each orb
// element via the refs map. No React re-renders per frame.
'use client';

import { useEffect, useRef } from 'react';
import {
  stepPhysics,
  DEFAULT_PHYSICS,
  type OrbState,
} from '@/lib/employee-pond/physics';
import { mulberry32, placeOrb } from './EmployeePond';

interface UsePondPhysicsArgs {
  visibleIds: string[];
  pondRadius: number;
  orbRadius: number;
  seed: number;
  /** When false (e.g. during fullscreen + reduced motion, or while
   *  the page is hidden), the loop pauses to save battery. */
  enabled: boolean;
  /** Slice E7 — forwarded to stepPhysics so the React side can spawn
   *  particles at the collision point. The hook holds the latest
   *  callback in a ref so reads are stable inside the loop. */
  onDraggedCollision?: (event: { x: number; y: number; force: number }) => void;
}

/** Maximum dt the loop will integrate at once. Caps the catch-up
 *  after a tab-switch so the pond doesn't explode when the user
 *  returns. ~33 ms = 30 fps floor. */
const MAX_DT_SEC = 0.033;

/** Tracks the running orb state across renders so React's
 *  reconciliation never wipes mid-flight velocities. */
export interface PondPhysicsHandle {
  /** Current orb state. Read-only from the React side. */
  readonly orbs: OrbState[];
  /** Forcibly set a single orb's position + velocity. Used by the
   *  drag interaction (E6). */
  setOrb: (id: string, patch: Partial<OrbState>) => void;
  /** Marks the orb as currently dragged (skips gravity/damping). */
  setDragging: (id: string, dragging: boolean) => void;
  /** Slice E6b — pond-relative cursor position drives the gentle
   *  attraction force. `null` removes the cursor (e.g. on
   *  pointerleave) so orbs return to plain gravity. */
  setCursor: (cursor: { x: number; y: number } | null) => void;
}

export function useEmployeePondPhysics(
  refs: Map<string, HTMLElement | null>,
  args: UsePondPhysicsArgs,
): PondPhysicsHandle {
  const orbsRef = useRef<OrbState[]>([]);
  const orbByIdRef = useRef<Map<string, OrbState>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  // Slice P4a — track the last seed so the sync-effect can tell
  // "seed changed" (user clicked Reset, or the employee set
  // changed) apart from "visibleIds changed" (search/filter). On
  // a seed change we forget prior orb positions so every visible
  // orb spawns fresh; on a visibleIds change we keep existing
  // positions and only spawn the newly-visible ones.
  const lastSeedRef = useRef<number | null>(null);
  // Slice E6b — cursor position in pond-center coords. Updated via
  // the handle's setCursor() and read each rAF tick before
  // stepPhysics so the attraction force tracks the user's mouse.
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  // Slice E7 — collision callback ref so the rAF closure always
  // reads the latest function without re-binding the loop.
  const collisionCbRef = useRef<UsePondPhysicsArgs['onDraggedCollision']>(undefined);
  collisionCbRef.current = args.onDraggedCollision;

  // Sync the orb pool whenever the visible set changes. Existing
  // orbs keep their position + velocity; newly-visible ones spawn
  // at a randomized point inside the pond; vanished ones drop out.
  //
  // Slice P4a — when the seed changes (Reset clicked, or the
  // employee list itself changed), discard prior positions so every
  // visible orb gets a fresh randomized placement. Search/filter
  // changes leave the seed alone so settled orbs stay put.
  useEffect(() => {
    const seedChanged = lastSeedRef.current !== args.seed;
    const existing = seedChanged ? new Map<string, OrbState>() : orbByIdRef.current;
    const rand = mulberry32(args.seed);
    const next: OrbState[] = [];
    const nextById = new Map<string, OrbState>();
    for (const id of args.visibleIds) {
      const prior = existing.get(id);
      if (prior) {
        next.push(prior);
        nextById.set(id, prior);
        continue;
      }
      const p = placeOrb(rand, args.pondRadius);
      const fresh: OrbState = {
        id,
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        radius: args.orbRadius,
      };
      next.push(fresh);
      nextById.set(id, fresh);
    }
    orbsRef.current = next;
    orbByIdRef.current = nextById;
    lastSeedRef.current = args.seed;
  }, [args.visibleIds, args.pondRadius, args.orbRadius, args.seed]);

  // Slice E10 — when the loop is disabled (prefers-reduced-motion,
  // or any future battery-save toggle), write a one-shot transform
  // for every orb so it lands at its seeded position instead of
  // stacking at the pond center.
  useEffect(() => {
    if (args.enabled) return;
    for (const orb of orbsRef.current) {
      const el = refs.get(orb.id);
      if (!el) continue;
      const scale = orb.scale ?? 1;
      el.style.transform = `translate3d(calc(${orb.x.toFixed(2)}px - 50%), calc(${orb.y.toFixed(2)}px - 50%), 0) scale(${scale.toFixed(3)})`;
    }
  }, [args.enabled, args.visibleIds, args.pondRadius, refs]);

  // rAF loop. Effect runs once per `enabled` / `pondRadius` change
  // and owns the cancel side.
  useEffect(() => {
    if (!args.enabled) return;
    if (typeof window === 'undefined') return;

    const loop = (t: number) => {
      const last = lastTimeRef.current;
      lastTimeRef.current = t;
      const dt =
        last === 0
          ? 1 / 60
          : Math.min(MAX_DT_SEC, Math.max(0, (t - last) / 1000));

      stepPhysics(orbsRef.current, {
        pondRadius: args.pondRadius,
        ...DEFAULT_PHYSICS,
        cursor: cursorRef.current,
        onDraggedCollision: collisionCbRef.current,
        dt,
      });

      for (const orb of orbsRef.current) {
        const el = refs.get(orb.id);
        if (!el) continue;
        // `top: 50%; left: 50%` puts the orb's top-left at the pond
        // center; `calc(<x>px - 50%)` shifts back by the orb's own
        // half-size so the orb's *center* lands at (x, y) relative
        // to the pond center. Works regardless of phone/desktop
        // orb-size because the `- 50%` is relative to the orb's own
        // rendered width.
        //
        // Slice E4 — append `scale(<scale>)` so hover can grow the
        // orb visually while the matching radius bump on the same
        // patch drives the neighbor bump through the existing
        // repulsion loop. Default 1.0 = no visual change.
        const scale = orb.scale ?? 1;
        el.style.transform = `translate3d(calc(${orb.x.toFixed(2)}px - 50%), calc(${orb.y.toFixed(2)}px - 50%), 0) scale(${scale.toFixed(3)})`;
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = 0;
    };
  }, [args.enabled, args.pondRadius, refs]);

  return {
    get orbs() {
      return orbsRef.current;
    },
    setOrb(id, patch) {
      const o = orbByIdRef.current.get(id);
      if (!o) return;
      if (patch.x !== undefined) o.x = patch.x;
      if (patch.y !== undefined) o.y = patch.y;
      if (patch.vx !== undefined) o.vx = patch.vx;
      if (patch.vy !== undefined) o.vy = patch.vy;
      if (patch.dragging !== undefined) o.dragging = patch.dragging;
      // Slice E4 — radius + scale patches let the hover hook bump
      // both the visual size AND the collision radius in one call.
      if (patch.radius !== undefined) o.radius = patch.radius;
      if (patch.scale !== undefined) o.scale = patch.scale;
    },
    setDragging(id, dragging) {
      const o = orbByIdRef.current.get(id);
      if (!o) return;
      o.dragging = dragging;
      if (!dragging) {
        // Wake the orb up; the loop's damping will calm it back
        // down. No explicit nudge — the drag's last velocity is
        // already in vx/vy.
      }
    },
    setCursor(cursor) {
      cursorRef.current = cursor;
    },
  };
}
