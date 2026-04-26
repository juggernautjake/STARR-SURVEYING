import { Redirect, Stack, usePathname } from 'expo-router';

import { LoadingSplash } from '@/lib/LoadingSplash';
import { useAuth } from '@/lib/auth';

/**
 * Layout for the unauthenticated route group. If the user already has
 * a session, redirect into the tabs immediately — this is what
 * actually navigates the user away from sign-in after a successful
 * signIn() call (the auth context updates session, this layout
 * re-renders, the redirect fires).
 *
 * Exception: reset-password establishes a session as part of its job
 * (so the user can call updateUser to change their password). If we
 * redirected away the moment a session appeared, the user would
 * never reach the new-password form. Detect that we're on
 * reset-password and let the screen render even with a session.
 *
 * auth-callback does the opposite — once setSession lands the session
 * AuthProvider catches it and we DO want to redirect away (that's
 * how magic-link "lands" on /jobs). No exemption needed there.
 */
export default function AuthLayout() {
  const { session, loading } = useAuth();
  const pathname = usePathname();

  const onResetPassword = pathname.endsWith('/reset-password');

  if (loading) return <LoadingSplash />;
  if (session && !onResetPassword) return <Redirect href="/(tabs)/jobs" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="forgot-password" />
      {/*
        reset-password and auth-callback are reached via deep links
        (starr-field://reset-password#... and
        starr-field://auth-callback#...). They check for an active
        session in their effects but live in the (auth) group so the
        URL → screen mapping works whether or not the user is signed
        in when the device opens the link.
       */}
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}
