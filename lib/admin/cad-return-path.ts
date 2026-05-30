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

import { useEffect, useRef } from 'react';
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

/** Hook for the always-mounted admin layout: watches the pathname,
 *  and when the user transitions INTO `/admin/cad` from somewhere else
 *  (the prior tick wasn't a CAD path), stores the prior pathname as
 *  the return-to target. Skips the initial mount so a direct CAD URL
 *  (bookmark / refresh) doesn't store `/admin/cad` itself. */
export function useCadReturnPathTracker(): void {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const last = prev.current;
    prev.current = pathname;
    if (!pathname) return;
    // Only record on a fresh transition from non-CAD into CAD.
    if (isCadPath(pathname) && last && !isCadPath(last)) {
      setCadReturnPath(last);
    }
  }, [pathname]);
}
