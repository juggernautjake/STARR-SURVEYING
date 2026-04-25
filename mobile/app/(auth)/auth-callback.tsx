import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { parseAuthCallbackUrl } from '@/lib/parseAuthUrl';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * Magic-link callback handler.
 *
 * Routed to when the user taps the "Sign in" link in the email
 * triggered by signInWithMagicLink (lib/auth.tsx). Reads the access
 * + refresh tokens from the URL fragment, hands them to Supabase via
 * setSession, and lets the AuthProvider's onAuthStateChange fire to
 * route the user into the app.
 *
 * On success, this screen never shows the success state visibly —
 * the (auth) layout sees the new session and redirects to /jobs
 * before the user notices.
 */
export default function AuthCallbackScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const url = Linking.useURL();
  const consumedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || consumedRef.current) return;
    const tokens = parseAuthCallbackUrl(url);
    if (!tokens) {
      // Cold-launched into this route without a usable URL (rare —
      // happens if the user navigated here manually). Treat as a
      // missing-link error and let them go back to sign-in.
      setError('No sign-in link detected. Try the email link again.');
      return;
    }
    consumedRef.current = true;
    supabase.auth
      .setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      })
      .then(({ error: setErr }) => {
        if (setErr) setError(setErr.message);
        // Success path: AuthProvider's session updates → (auth)
        // layout's redirect runs.
      })
      .catch((err: Error) => setError(err.message));
  }, [url]);

  if (!error) return <LoadingSplash />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: palette.text }]}>Sign-in failed</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>{error}</Text>
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  caption: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
});
