/**
 * Auth context for Starr Field.
 *
 * Per STARR_FIELD_MOBILE_APP_PLAN.md §5.1, the mobile app talks to
 * Supabase Auth directly (NOT through NextAuth — that's web-only).
 * This provider:
 *   1. Reads the current session at mount (from AsyncStorage via the
 *      Supabase client config in lib/supabase.ts)
 *   2. Subscribes to onAuthStateChange so signIn/signOut anywhere
 *      else updates state here too
 *   3. Exposes signIn / signOut / resetPassword as imperative actions
 *
 * Phase F0 #2a — email + password only. Magic link, biometric unlock,
 * auto-lock idle timer, and re-auth-on-destructive-action are F0 #2b.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

interface AuthContextValue {
  /** Current session, or null when signed out. */
  session: Session | null;
  /** True until the initial session check from AsyncStorage resolves. */
  loading: boolean;
  /**
   * Sign in with email + password. Returns an error message on failure
   * (so screens can surface it without parsing the Supabase error
   * shape themselves), `null` on success.
   */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Sign out and clear local session. */
  signOut: () => Promise<void>;
  /** Send a password-reset email. Returns an error message or null. */
  resetPassword: (email: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Initial session read. This pulls from AsyncStorage (configured in
    // lib/supabase.ts) so a returning user is signed-in before the UI
    // has a chance to flicker through the sign-in screen.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        // getSession failure typically means corrupted local storage.
        // Treat as signed out; user can sign in again.
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      });

    // Live subscription. Handles signIn from any screen, token refresh,
    // and signOut from server-side revocation. The return shape is
    // `{ data: { subscription } }` — destructure deep so the cleanup
    // call site reads naturally.
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession);
    });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return error?.message ?? null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        return error?.message ?? null;
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be called inside <AuthProvider>. Wrap your tree in app/_layout.tsx.');
  }
  return ctx;
}
