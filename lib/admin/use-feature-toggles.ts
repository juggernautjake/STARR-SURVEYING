'use client';

// lib/admin/use-feature-toggles.ts — one read of the toggle map, shared by every nav surface.
//
// T2 of §11 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── WHY THIS IS CACHED IN A MODULE AND NOT A CONTEXT ────────────────────────────────────────────
//
// Four components need this on every admin page — the sidebar, the rail, the command palette and
// the workspace flyout — and they do not share a parent that owns admin state. A provider would
// mean touching the admin layout and every test that mounts one of these four in isolation.
//
// A module-level promise is the smaller thing and gives the same guarantee: the FIRST caller starts
// the fetch, everybody else awaits the same promise, and there is exactly one request per page load
// no matter how many surfaces ask. React 18 renders these concurrently, so a naive `useEffect` per
// component would fire four identical requests on every navigation.
//
// ── AND WHY A FAILURE IS SILENT ─────────────────────────────────────────────────────────────────
//
// An empty map means everything is on — see `feature-toggles.ts` for why that is the load-bearing
// default. So a settings endpoint that is slow, down, or answering 403 to a non-admin leaves the
// nav exactly as it is today. The one thing this must never do is empty somebody's sidebar because
// a fetch failed.

import { useEffect, useState } from 'react';
import type { FeatureToggles } from './feature-toggles';

/** Resolved once per page load. `null` until the first read finishes. */
let cache: FeatureToggles | null = null;
let inflight: Promise<FeatureToggles> | null = null;

async function read(): Promise<FeatureToggles> {
  if (cache) return cache;
  if (!inflight) {
    // ── NOT `/api/admin/settings` ───────────────────────────────────────────────────────────────
    //
    // That endpoint is `isAdmin`-only, which it should be — it carries the company's details and its
    // billing. Reading the toggle map from it meant an employee's browser got a 403, this correctly
    // answered "everything is on", and the whole feature silently did nothing for non-admins: the
    // nav kept every switched-off page, and the off-page notice could never appear for the people it
    // exists for.
    //
    // It worked perfectly for the one account I had been testing with, which is exactly why it took
    // a second signed-in browser to find.
    inflight = fetch('/api/admin/feature-toggles', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => (body?.toggles ?? {}) as FeatureToggles)
      // Down, slow, signed out. Everything stays on, which is today's behaviour exactly.
      .catch(() => ({} as FeatureToggles))
      .then((t) => { cache = t; return t; })
      // Cleared either way so a later navigation can retry after a transient failure. Without this,
      // one bad response at page load would pin an empty map for the rest of the session.
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/**
 * Which pages this firm uses. `{}` until the first read lands, which means "all of them".
 *
 * Deliberately NOT a loading flag. A nav that waited would flicker its whole list into existence on
 * every page load, and the honest starting state is the one that shows everything — the toggle
 * removes entries, so an unfiltered list is a superset and never a lie about what exists.
 */
export function useFeatureToggles(): FeatureToggles {
  const [toggles, setToggles] = useState<FeatureToggles>(cache ?? {});

  useEffect(() => {
    let cancelled = false;
    void read().then((t) => { if (!cancelled) setToggles(t); });
    return () => { cancelled = true; };
  }, []);

  return toggles;
}

/** Drop the cached read — for after somebody flips a switch on the settings screen (T3). */
export function invalidateFeatureToggles(): void {
  cache = null;
  inflight = null;
}
