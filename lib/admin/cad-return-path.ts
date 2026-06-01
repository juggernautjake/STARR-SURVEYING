// lib/admin/cad-return-path.ts
//
// cad-exit-return-path 2026-05-30 — remember which admin page the user
// was on before they entered the CAD editor, so the CAD "Exit" button
// can send them back there instead of always defaulting to
// /admin/research-cad.
//
// Stored in sessionStorage so it survives in-app navigation (Next.js
// client-side routing doesn't preserve referrer reliably) but doesn't
// leak across browser sessions. Pure helpers + a hook the admin layout
// mounts to track the transition INTO the CAD route.

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'cad:returnPath';
const CAD_ROUTE = '/admin/cad';
const DEFAULT_FALLBACK = '/admin/research-cad';

/** True only for the CAD editor route (or sub-routes underneath it). */
export function isCadPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === CAD_ROUTE || pathname.startsWith(`${CAD_ROUTE}/`);
}

/** Read the stored return path. Returns the fallback when nothing is
 *  stored, when running on the server, or when the stored value points
 *  back at /admin/cad (shouldn't happen, but guard anyway so a buggy
 *  state never sends the user in a loop). */
export function getCadReturnPath(
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (typeof window === 'undefined') return fallback;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback;
  }
  if (!stored || isCadPath(stored)) return fallback;
  return stored;
}

/** Write the prior pathname so the CAD exit button can navigate back
 *  to it. No-op on server / when the path looks invalid. */
export function setCadReturnPath(prev: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!prev || !prev.startsWith('/')) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, prev);
  } catch {
    /* sessionStorage quota / disabled — non-fatal */
  }
}

/** Clear the stored return path. Called after the exit button has used
 *  it so a second exit doesn't bounce between two pages. */
export function clearCadReturnPath(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Hook for the always-mounted admin layout: continuously remembers
 *  the most recent NON-CAD admin path so the CAD "Exit" button returns
 *  there no matter HOW the user entered CAD.
 *
 *  cad-trv-fidelity Slice 10 — the old logic only recorded the single
 *  non-CAD → /admin/cad CLIENT-SIDE transition (via a `prev` ref). A
 *  HARD page load into `/admin/cad` (a fresh URL, a refresh, or any
 *  full navigation) mounts the tracker fresh with `prev = null`, so the
 *  transition was never observed and Exit always fell back to the
 *  research-cad menu. Recording EVERY non-CAD path means the page the
 *  user was on right before CAD is always on file in sessionStorage —
 *  it was written while they were still on that page, surviving even a
 *  hard navigation into the editor. */
export function useCadReturnPathTracker(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    if (!isCadPath(pathname)) setCadReturnPath(pathname);
  }, [pathname]);
}
