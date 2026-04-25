import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';

// Keep the native splash visible while AuthProvider + DatabaseProvider
// finish their initial setup. DatabaseProvider calls
// SplashScreen.hideAsync() the moment SQLite is open and ready, so
// the user goes from native splash → ready UI with no empty-screen
// flash in between. Per plan §7.1 rule 4 ("speed over decoration").
//
// Side-effect at module load: must be the first thing Metro evaluates
// before any provider mount.
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
 */
export default function RootLayout() {
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
