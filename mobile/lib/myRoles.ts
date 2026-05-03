/**
 * Lookup the signed-in surveyor&apos;s roles from
 * `registered_users.roles` (Supabase admin web&apos;s source of
 * truth for permission gating). Cached in module scope so the
 * lookup runs once per session, not once per consumer.
 *
 * Phase F10.8 — drives the role-gated Gear tab visibility +
 * future EM-only flows. Mobile doesn&apos;t carry a JWT-based role
 * claim today (the Supabase JWT only has user_metadata, not the
 * registered_users.roles array), so we issue a single
 * `select('roles').eq('email', me).single()` after sign-in.
 *
 * The query goes through Supabase&apos;s anon key + RLS — make
 * sure the registered_users RLS policy allows
 * `email = auth.jwt() ->> 'email'`. Without that, the query
 * returns 0 rows and the user is treated as having no special
 * roles (safe-default).
 */
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { logError } from './log';
import { supabase } from './supabase';

interface RoleCacheEntry {
  email: string;
  roles: string[];
  fetchedAt: number;
}

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

let cachedEntry: RoleCacheEntry | null = null;

/**
 * Hook returning the current user&apos;s roles array. Empty while
 * loading; falls back to `[]` (no special roles) when the lookup
 * fails or the row doesn&apos;t exist. The `isLoading` flag stays
 * true until the first lookup resolves so consumers can avoid
 * flicker when role-gating UI.
 */
export function useMyRoles(): {
  roles: string[];
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { session } = useAuth();
  const email = session?.user.email ?? null;
  const [roles, setRoles] = useState<string[]>(() => {
    if (cachedEntry && cachedEntry.email === email) {
      return cachedEntry.roles;
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!email) return false;
    if (cachedEntry && cachedEntry.email === email) return false;
    return true;
  });

  async function fetchRoles(forceEmail: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('registered_users')
        .select('roles')
        .eq('email', forceEmail)
        .maybeSingle();
      if (error) {
        logError('myRoles.fetch', 'registered_users select failed', error, {
          email: forceEmail,
        });
        return [];
      }
      const fetched = (data as { roles?: string[] | null } | null)?.roles ?? [];
      return Array.isArray(fetched) ? fetched : [];
    } catch (err) {
      logError(
        'myRoles.fetch',
        'unexpected error',
        err,
        { email: forceEmail }
      );
      return [];
    }
  }

  useEffect(() => {
    if (!email) {
      setRoles([]);
      setIsLoading(false);
      return;
    }
    if (
      cachedEntry &&
      cachedEntry.email === email &&
      Date.now() - cachedEntry.fetchedAt < ROLE_CACHE_TTL_MS
    ) {
      setRoles(cachedEntry.roles);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const r = await fetchRoles(email);
      if (cancelled) return;
      cachedEntry = { email, roles: r, fetchedAt: Date.now() };
      setRoles(r);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function refresh(): Promise<void> {
    if (!email) return;
    setIsLoading(true);
    const r = await fetchRoles(email);
    cachedEntry = { email, roles: r, fetchedAt: Date.now() };
    setRoles(r);
    setIsLoading(false);
  }

  return { roles, isLoading, refresh };
}

/** Convenience: true when the signed-in user is an
 *  equipment_manager OR an admin / developer (the same elevation
 *  ladder the admin web&apos;s `EQUIPMENT_ROLES` constant uses). */
export function useIsEquipmentManager(): {
  isEquipmentManager: boolean;
  isLoading: boolean;
} {
  const { roles, isLoading } = useMyRoles();
  const isEquipmentManager =
    roles.includes('equipment_manager') ||
    roles.includes('admin') ||
    roles.includes('developer');
  return { isEquipmentManager, isLoading };
}
