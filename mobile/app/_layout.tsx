import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';

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
