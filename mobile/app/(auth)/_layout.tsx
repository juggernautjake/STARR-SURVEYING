import { Redirect, Stack } from 'expo-router';

import { LoadingSplash } from '@/lib/LoadingSplash';
import { useAuth } from '@/lib/auth';

/**
 * Layout for the unauthenticated route group. If the user already has
 * a session, redirect into the tabs immediately — this is what
 * actually navigates the user away from sign-in after a successful
 * signIn() call (the auth context updates session, this layout
 * re-renders, the redirect fires).
 */
export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingSplash />;
  if (session) return <Redirect href="/(tabs)/jobs" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
