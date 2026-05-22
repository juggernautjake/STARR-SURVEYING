// app/admin/components/payroll/useJobTitles.ts
//
// Client-side hook + cache for the role_tiers catalog. Returns the same
// Record<key, {label, icon, description}> shape that JOB_TITLES used to
// provide, but sourced from the DB so admin edits via the Phase 3 CRUD
// surface propagate everywhere.
//
// Cache: a module-level promise keeps in-flight requests from being
// duplicated when multiple components mount in the same render. The
// data refreshes when the window regains focus (so admin edits show
// up without a full reload) but otherwise persists for the SPA session.
//
// Fallback: if the fetch fails (offline, server error) we fall back to
// JOB_TITLES_FALLBACK from PayrollConstants so the page still renders
// without missing labels. The fallback covers the 14 seeded tiers.

'use client';

import { useEffect, useState } from 'react';
import { JOB_TITLES_FALLBACK } from './PayrollConstants';

export interface JobTitleInfo {
  label: string;
  icon: string;
  description: string;
}

export type JobTitleMap = Record<string, JobTitleInfo>;

let cachedPromise: Promise<JobTitleMap> | null = null;
let cachedData: JobTitleMap | null = null;

interface RoleTierRow {
  role_key: string;
  label: string | null;
  description: string | null;
  icon: string | null;
}

async function fetchJobTitles(): Promise<JobTitleMap> {
  try {
    const res = await fetch('/api/role-tiers', { cache: 'no-store' });
    if (!res.ok) throw new Error(`role-tiers ${res.status}`);
    const data = await res.json() as { tiers: RoleTierRow[] };
    const map: JobTitleMap = { ...JOB_TITLES_FALLBACK };
    for (const t of data.tiers) {
      map[t.role_key] = {
        label: t.label || t.role_key,
        icon: t.icon || JOB_TITLES_FALLBACK[t.role_key]?.icon || '👤',
        description: t.description || '',
      };
    }
    cachedData = map;
    return map;
  } catch {
    cachedData = JOB_TITLES_FALLBACK;
    return JOB_TITLES_FALLBACK;
  }
}

export function useJobTitles(): JobTitleMap {
  const [map, setMap] = useState<JobTitleMap>(cachedData || JOB_TITLES_FALLBACK);

  useEffect(() => {
    if (cachedData) {
      setMap(cachedData);
      return;
    }
    if (!cachedPromise) cachedPromise = fetchJobTitles();
    cachedPromise.then(setMap);

    function onFocus() {
      cachedPromise = fetchJobTitles();
      cachedPromise.then(setMap);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return map;
}

// Invalidate the cache (call after admin edits a tier via the Phase 3 CRUD).
export function invalidateJobTitlesCache(): void {
  cachedData = null;
  cachedPromise = null;
}
