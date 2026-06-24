'use client';
// lib/work-mode/use-activity-tags.ts
//
// Shared, module-cached activity-tag catalog for the clock-in/out modals.
//
// Before this, each clock surface (top-bar pill, WorkModePrompt, the
// quick-actions widget) fetched the catalog *when its modal opened*, so the
// modal popped up empty and then visibly reflowed as the tags arrived — which
// reads as "the modal flashed / re-rendered right after opening." This hook
// fetches once per session (deduped across all surfaces) and PRELOADS on mount,
// so by the time the user opens a clock modal the tags are already there.

import { useEffect, useState } from 'react';

export interface ActivityTag {
  id: string;
  label: string;
  color: string;
}

let cache: ActivityTag[] | null = null;
let inflight: Promise<ActivityTag[]> | null = null;

async function loadTags(): Promise<ActivityTag[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/admin/activity-tags');
      if (!res.ok) return [];
      const data = (await res.json()) as { tags?: ActivityTag[] };
      cache = data.tags ?? [];
      return cache;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The activity-tag catalog, fetched once and cached module-wide. Preloads on
 *  mount so the clock modals open fully-formed. Returns `[]` until ready. */
export function useActivityTags(): ActivityTag[] {
  const [tags, setTags] = useState<ActivityTag[]>(cache ?? []);
  useEffect(() => {
    if (cache) {
      setTags(cache);
      return;
    }
    let cancelled = false;
    void loadTags().then((t) => {
      if (!cancelled) setTags(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return tags;
}
