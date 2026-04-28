/**
 * Theme preference store + provider. Persists the user's choice
 * across launches and exposes the resolved scheme to screens that
 * opt into the new high-contrast sun-readable palette.
 *
 * Closes the F7 deferral *"High-contrast / sun-readable theme —
 * dark mode default exists per `lib/theme.ts`; high-contrast variant
 * pending. Acceptance: legible in direct 100°F sun."*
 *
 * Usage:
 *   const [pref, setPref] = useThemePreference();
 *     pref ∈ 'auto' | 'light' | 'dark' | 'sun'
 *
 *   const scheme = useResolvedScheme();
 *     scheme ∈ 'light' | 'dark' | 'sun'  — pass to colors[]
 *
 * Persistence: AsyncStorage key `@starr-field/theme_pref`. Default
 * 'auto' (follows OS). Writes hit AsyncStorage immediately so the
 * choice survives kills + reboots.
 *
 * Two-channel coordination:
 *   - The `Appearance.setColorScheme()` API tells React Native +
 *     legacy `useColorScheme()` callers what to render. We map
 *     'sun' → 'light' on this channel (RN doesn't know about sun)
 *     so screens that haven't migrated yet still pick a sensible
 *     fallback palette.
 *   - The React context exposes the actual user choice ('sun'
 *     included) so screens that opt in via `useResolvedScheme()`
 *     get the high-contrast palette.
 *
 * Mount once at the root via <ThemePreferenceProvider>. The
 * provider hydrates from AsyncStorage on mount and keeps
 * Appearance in sync on every preference change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { logWarn } from './log';
import type { Scheme } from './theme';

export type ThemePreference = 'auto' | 'light' | 'dark' | 'sun';

const STORAGE_KEY = '@starr-field/theme_pref';
const DEFAULT_PREF: ThemePreference = 'auto';

interface ThemeContextValue {
  /** User-chosen preference. 'auto' delegates to OS scheme. */
  preference: ThemePreference;
  /** Set + persist the preference. Returns once AsyncStorage settles
   *  so callers can `await` before showing a confirmation. */
  setPreference: (next: ThemePreference) => Promise<void>;
  /** Final scheme to render: 'light' | 'dark' | 'sun'. */
  resolved: Scheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Translate the user preference + OS scheme into the actual scheme
 *  the app should render. Pure function — easy to test, easy to
 *  reason about. */
function resolveScheme(
  preference: ThemePreference,
  osScheme: 'light' | 'dark' | null
): Scheme {
  switch (preference) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'sun':
      return 'sun';
    case 'auto':
    default:
      return osScheme === 'light' ? 'light' : 'dark';
  }
}

/** Drive the RN Appearance API so legacy `useColorScheme()` callers
 *  get a coherent fallback. 'sun' falls back to 'light' since RN
 *  has no concept of sun. 'auto' clears the override (returns to
 *  OS-native). */
function applyAppearance(preference: ThemePreference): void {
  switch (preference) {
    case 'light':
    case 'sun':
      Appearance.setColorScheme('light');
      return;
    case 'dark':
      Appearance.setColorScheme('dark');
      return;
    case 'auto':
    default:
      Appearance.setColorScheme(null);
      return;
  }
}

export function ThemePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREF);
  // Hydrating from AsyncStorage means the very first paint uses
  // the default ('auto'). We accept that single-frame mismatch —
  // forcing a synchronous-from-disk read on cold start would block
  // first paint by ~30 ms.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw && isPreference(raw)) {
          setPreferenceState(raw);
          applyAppearance(raw);
        } else {
          applyAppearance(DEFAULT_PREF);
        }
      } catch (err) {
        logWarn('themePreference.hydrate', 'AsyncStorage read failed', err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    applyAppearance(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      logWarn('themePreference.set', 'AsyncStorage write failed', err, {
        next,
      });
    }
  }, []);

  // Subscribe to OS scheme changes so 'auto' preference re-renders
  // when the user toggles dark mode in Settings while the app is
  // backgrounded.
  const osScheme = useColorScheme();
  const resolved = useMemo(
    () => resolveScheme(preference, osScheme ?? null),
    [preference, osScheme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, resolved }),
    [preference, setPreference, resolved]
  );

  // Render children regardless of hydration state — the default
  // ('auto') is good enough for the brief flash before the
  // persisted choice loads.
  void hydrated;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isPreference(value: string): value is ThemePreference {
  return (
    value === 'auto' ||
    value === 'light' ||
    value === 'dark' ||
    value === 'sun'
  );
}

/** Tuple-style preference hook for setters that want a setState
 *  ergonomics. */
export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => Promise<void>,
] {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Defensive — happens only if a screen renders outside the
    // provider (test harness without the wrapper). Fall back to
    // OS-default rather than crashing.
    return [DEFAULT_PREF, async () => {}];
  }
  return [ctx.preference, ctx.setPreference];
}

/** Resolved scheme — pass to colors[]. Screens that opt into the
 *  sun-readable palette use this in place of `useColorScheme()`. */
export function useResolvedScheme(): Scheme {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx.resolved;
  // Fallback when rendered outside the provider — same logic as
  // the default-`useColorScheme() ?? 'dark'` pattern most existing
  // screens use today.
  return 'dark';
}
