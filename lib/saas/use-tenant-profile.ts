'use client'
// lib/saas/use-tenant-profile.ts — the firm's identity, in a client component (audit item 8h).
//
// ── WHY A SHARED MODULE CACHE AND NOT JUST useEffect ─────────────────────────────────────────────
//
// The admin shell renders many components that each want the firm's name or email domain — the users
// directory, the sidebar, the login screen, the pay portal header. A plain per-component fetch would
// issue one request each, on every navigation. The promise is cached at module scope instead, so N
// components share one in-flight request and every later mount resolves from memory.
//
// ── AND WHY IT STARTS AT `EMPTY_PROFILE`, NOT AT STARR ───────────────────────────────────────────
//
// Same reasoning as the server module: a code-level default of one firm's name would render *that*
// name for a moment in a *different* firm's browser. A blank that fills in a tick later is a flicker;
// a competitor's name on screen is an incident. Components that cannot tolerate the blank should read
// `loaded` and hold their content, which is what the ones with a visible firm name do.
import { useEffect, useState } from 'react';
// The SHAPE module, not `tenant-profile.ts` — that one imports the service-role Supabase client and
// must never be pulled into a browser bundle.
import { EMPTY_PROFILE, type TenantProfile } from './tenant-profile-shape';

let cached: TenantProfile | null = null;
let inFlight: Promise<TenantProfile> | null = null;

/** Drop the cache — for the Org Settings screen after a save, so the change is visible immediately. */
export function clearTenantProfileClientCache(): void {
  cached = null;
  inFlight = null;
}

async function load(): Promise<TenantProfile> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = fetch('/api/admin/tenant/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        cached = (j?.profile as TenantProfile | undefined) ?? EMPTY_PROFILE;
        return cached;
      })
      .catch(() => EMPTY_PROFILE)
      // Cleared either way: a failed load must not pin the failure forever, or a transient blip on
      // first paint leaves the firm nameless until a full reload.
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export interface UseTenantProfile {
  profile: TenantProfile;
  /** False until the real row has arrived. Distinguishes "still loading" from "this firm has not set
   *  a name", which look identical and mean very different things. */
  loaded: boolean;
}

export function useTenantProfile(): UseTenantProfile {
  const [profile, setProfile] = useState<TenantProfile>(cached ?? EMPTY_PROFILE);
  const [loaded, setLoaded] = useState<boolean>(!!cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    load().then((p) => {
      if (!alive) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  return { profile, loaded };
}
