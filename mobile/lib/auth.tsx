/**
 * Auth context for Starr Field.
 *
 * Per STARR_FIELD_MOBILE_APP_PLAN.md §5.1, the mobile app talks to
 * Supabase Auth directly (NOT through NextAuth — that's web-only).
 * This provider:
 *   1. Reads the current session at mount (from AsyncStorage via the
 *      Supabase client config in lib/supabase.ts) AND the biometric
 *      preference together, so the lock decision is made before the
 *      UI flashes through unlocked tabs
 *   2. Subscribes to onAuthStateChange so signIn/signOut anywhere
 *      else updates state here too
 *   3. Tracks AppState transitions to auto-lock after configurable
 *      idle (default 15 min) when the user returns from background
 *   4. Exposes the full sign-in surface (signIn, signInWithMagicLink,
 *      resetPassword, signOut) AND the lock-state management methods
 *      (setBiometricEnabled, unlock, lockNow, requireReauth) via a
 *      single useAuth() context
 *
 * Phases shipped:
 *   F0 #2a — email + password sign-in
 *   F0 #2b — biometric unlock + auto-lock + re-auth helper
 *   F0 #2c — magic-link sign-in + password-reset deep link;
 *            Sign in with Apple lives in lib/AppleSignInButton.tsx
 *            (it doesn't need a hook into this provider since the
 *            session change comes through onAuthStateChange).
 *
 * The session itself is still the authoritative auth; biometric and
 * lock-state are UI gates on top of it.
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { LockOverlay } from './LockOverlay';
import {
  authenticate,
  getBiometricCapability,
  requireReauth as runReauthPrompt,
} from './biometric';
import {
  getBiometricEnabled as readBiometricEnabled,
  setBiometricEnabled as writeBiometricEnabled,
  getIdleLockMinutes,
  getLastBackgroundedTs,
  markBackgroundedNow,
} from './lockState';
import { logError, logInfo, setUserContext } from './log';
import { supabase } from './supabase';

interface AuthContextValue {
  /** Current session, or null when signed out. */
  session: Session | null;
  /**
   * True until the initial session check + biometric-pref read both
   * resolve. Layouts that gate routes should render their splash
   * while this is true.
   */
  loading: boolean;
  /**
   * True when a session exists but the user must pass biometric to
   * proceed. False when no session exists (sign-in screen handles
   * that case) or when biometric is disabled.
   */
  locked: boolean;
  /** Has the user opted into biometric unlock from the Me tab? */
  biometricEnabled: boolean;
  /**
   * Sign in with email + password. Returns an error message on failure,
   * `null` on success.
   */
  signIn: (email: string, password: string) => Promise<string | null>;
  /**
   * Send a magic-link email. The user taps the link in their inbox →
   * device opens `starr-field://auth-callback#...` → the callback
   * screen calls supabase.auth.setSession with the embedded tokens.
   * Returns an error message or null.
   */
  signInWithMagicLink: (email: string) => Promise<string | null>;
  /** Sign out and clear local session. Also clears the locked flag. */
  signOut: () => Promise<void>;
  /**
   * Send a password-reset email. The link points at
   * `starr-field://reset-password#...`; the reset screen establishes
   * the recovery session and lets the user set a new password.
   * Returns an error message or null.
   */
  resetPassword: (email: string) => Promise<string | null>;
  /** Toggle the biometric preference. Persists to AsyncStorage. */
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  /** Prompt biometric and clear the lock if the user authenticates. */
  unlock: () => Promise<boolean>;
  /** Force-lock immediately. Used by the "Lock now" button on Me. */
  lockNow: () => void;
  /**
   * Re-auth helper for destructive actions (delete job, delete point,
   * delete time entry per plan §5.1). No-ops to true when biometric
   * is disabled or unavailable — the Supabase session is the actual
   * auth, this is just UX.
   */
  requireReauth: (reason: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Initial mount: load session + biometric pref together ──────────────
  useEffect(() => {
    let mounted = true;

    Promise.all([supabase.auth.getSession(), readBiometricEnabled()])
      .then(async ([{ data }, savedBiometricEnabled]) => {
        if (!mounted) return;
        const hasSession = !!data.session;

        // Defense: if biometric was enabled but the device no longer
        // supports it (sensor unavailable, all biometrics removed via
        // device settings), silently clear the pref so the user isn't
        // locked out with no way to authenticate.
        let effectiveBiometric = savedBiometricEnabled;
        if (savedBiometricEnabled) {
          const cap = await getBiometricCapability();
          if (!cap.available) {
            effectiveBiometric = false;
            await writeBiometricEnabled(false);
            logInfo('auth.boot', 'cleared biometric pref — device no longer supports it');
          }
        }

        if (!mounted) return;
        setSession(data.session);
        setBiometricEnabledState(effectiveBiometric);
        // Cold-start with an existing session AND biometric enabled →
        // start locked. The LockOverlay will auto-prompt on mount.
        setLocked(hasSession && effectiveBiometric);
        setLoading(false);

        // Tag Sentry events with the current user the moment we know
        // who they are. Critical: do this BEFORE any feature code runs
        // so a crash during DatabaseProvider init still attributes
        // correctly.
        if (data.session?.user) {
          setUserContext({
            id: data.session.user.id,
            email: data.session.user.email,
          });
          logInfo('auth.boot', 'restored session', {
            user_id: data.session.user.id,
            biometric_enabled: effectiveBiometric,
          });
        } else {
          logInfo('auth.boot', 'no saved session');
        }
      })
      .catch((err) => {
        // getSession or AsyncStorage failure → treat as signed out.
        // This is corruption-territory; capture for diagnosis.
        logError('auth.boot', 'failed to restore session', err);
        if (!mounted) return;
        setSession(null);
        setBiometricEnabledState(false);
        setLocked(false);
        setLoading(false);
      });

    // Live auth-state subscription. Handles signIn from any screen,
    // token refresh, and server-side signOut.
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      // If the session went away (signOut, expired token), clear lock
      // so we don't show the LockOverlay on top of the sign-in screen.
      if (!newSession) setLocked(false);
      // SIGNED_IN fires after a successful signInWithPassword. The
      // user just authenticated; do NOT lock them again — they'd
      // immediately have to do biometric on top of password, which
      // is bad UX. Cold-start uses the locked-state from the
      // Promise.all above; mid-session sign-in skips the lock.
      if (event === 'SIGNED_IN') setLocked(false);

      // Sentry user-context update + breadcrumb. Visible in any
      // crash that occurs after this transition.
      logInfo('auth.stateChange', event, {
        user_id: newSession?.user.id,
        has_session: !!newSession,
      });
      if (newSession?.user) {
        setUserContext({
          id: newSession.user.id,
          email: newSession.user.email,
        });
      } else {
        setUserContext(null);
      }
    });

    return () => {
      mounted = false;
      authSubscription.unsubscribe();
    };
  }, []);

  // ── AppState: auto-lock after idle when returning from background ──────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        await markBackgroundedNow();
        return;
      }
      if (nextState !== 'active') return;
      // Only re-lock if there's a session to lock AND user has opted in.
      if (!session || !biometricEnabled) return;
      const ts = await getLastBackgroundedTs();
      if (!ts) return;
      const idleMin = await getIdleLockMinutes();
      const elapsedMin = (Date.now() - ts) / 60000;
      if (elapsedMin >= idleMin) setLocked(true);
    });
    return () => sub.remove();
  }, [session, biometricEnabled]);

  // ── Imperative actions ─────────────────────────────────────────────────
  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    await writeBiometricEnabled(enabled);
    setBiometricEnabledState(enabled);
    // Turning biometric OFF while locked is the same as unlocking —
    // there's no second factor left to demand.
    if (!enabled) setLocked(false);
  }, []);

  const unlock = useCallback(async () => {
    const ok = await authenticate('Unlock Starr Field');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const lockNow = useCallback(() => {
    if (biometricEnabled) setLocked(true);
  }, [biometricEnabled]);

  const requireReauth = useCallback(
    (reason: string) => runReauthPrompt(reason, biometricEnabled),
    [biometricEnabled]
  );

  // ── Context value ──────────────────────────────────────────────────────
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      locked,
      biometricEnabled,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return error?.message ?? null;
      },
      signInWithMagicLink: async (email) => {
        // createURL respects the `scheme` set in app.json AND the dev
        // proxy (Expo Go uses exp:// in dev, starr-field:// in prod).
        const emailRedirectTo = Linking.createURL('auth-callback');
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo, shouldCreateUser: false },
        });
        return error?.message ?? null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const redirectTo = Linking.createURL('reset-password');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        return error?.message ?? null;
      },
      setBiometricEnabled,
      unlock,
      lockNow,
      requireReauth,
    }),
    [
      session,
      loading,
      locked,
      biometricEnabled,
      setBiometricEnabled,
      unlock,
      lockNow,
      requireReauth,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {locked ? (
        <LockOverlay
          onUnlock={() => setLocked(false)}
          onSignOut={() => {
            // Sign out clears the session, which clears `locked` via
            // the onAuthStateChange handler above. Don't setLocked
            // here — let the auth state machine drive it.
            void supabase.auth.signOut();
          }}
        />
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      'useAuth must be called inside <AuthProvider>. Wrap your tree in app/_layout.tsx.'
    );
  }
  return ctx;
}
