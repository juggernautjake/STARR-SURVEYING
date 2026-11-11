'use client';
// lib/admin/back-target.ts — where the header's "Back to …" goes (owner, 2026-11-11).
//
// "There should be some kind of logic for all pages as to what page you would have naturally gotten
// there from, and that should be the default 'Back to...' page that is referenced."
//
// The default is the page's parent in the address — /admin/receipts/123 goes back to Receipts — and
// that is right for nearly every page: you reach a detail page from its list. It is wrong where the
// real parent is not in the address. A job is /admin/jobs/<id>, but you got there from its PROJECT,
// and "Back to Jobs" dropped people on the projects list instead of the jobs in that project.
//
// So a page that knows better says so: `useBackTarget({ href, label })`. The header shows that for
// as long as the page is on screen, and falls back to the address parent otherwise. It is keyed to
// the path it was set on, so a target can never leak onto the next page during a navigation.

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

export interface BackTarget { href: string; label: string }

let current: (BackTarget & { path: string }) | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => current;

/** Set the page's "Back to …". Pass null while it is not known yet (the default shows meanwhile). */
export function useBackTarget(target: BackTarget | null): void {
  const path = usePathname() || '';
  const href = target?.href ?? null;
  const label = target?.label ?? null;
  useEffect(() => {
    if (!href || !label) return;
    const mine = { href, label, path };
    current = mine;
    emit();
    return () => { if (current === mine) { current = null; emit(); } };
  }, [href, label, path]);
}

/** The target a page set for `pathname`, or null to use the address parent. */
export function useBackOverride(pathname: string): BackTarget | null {
  const v = useSyncExternalStore(subscribe, snapshot, () => null);
  return v && v.path === pathname ? { href: v.href, label: v.label } : null;
}

/** The same, for a server component: render `<SetBackTarget href=… label=… />` anywhere in it. */
export function SetBackTarget({ href, label }: BackTarget): null {
  useBackTarget({ href, label });
  return null;
}
