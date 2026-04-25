import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';
import Sentry, { initSentry } from '@/lib/sentry';

// Module-load side effects (must run BEFORE any provider mounts):
//
//   1. initSentry() — wraps the JS runtime with crash reporting so a
//      failure during AuthProvider/DatabaseProvider init still gets
//      captured. No-op when EXPO_PUBLIC_SENTRY_DSN is missing.
//   2. preventAutoHideAsync() — keeps the native splash visible while
//      AuthProvider + DatabaseProvider finish their initial setup.
//      DatabaseProvider calls SplashScreen.hideAsync() the moment
//      SQLite is open, so we go native splash → ready UI with no
//      empty-screen flash. Per plan §7.1 rule 4 ("speed over
//      decoration").
initSentry();

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (hot-reload, etc.) — safe to ignore.
});

/**
 * Provider stack ordering matters:
 *   1. SafeAreaProvider — outer; insets are needed by everyone below
 *   2. AuthProvider     — supplies useAuth() to DatabaseProvider so it
 *                         can connect/disconnect with session changes
 *   3. DatabaseProvider — opens local SQLite, wires PowerSync; renders
 *                         a splash while init() runs (one-time, fast)
 *   4. Stack            — actual screens
 *
 * Wrapped in Sentry.wrap so component-tree info attaches to crash
 * reports. Sentry.wrap is a passthrough when initSentry no-op'd
 * (no DSN configured), so dev still works without a Sentry account.
 */
function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <DatabaseProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </DatabaseProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
