import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { TextField } from '@/lib/TextField';
import { parseAuthCallbackUrl } from '@/lib/parseAuthUrl';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Password-reset deep-link handler.
 *
 * When the user taps the link in the reset email, the device opens
 * `starr-field://reset-password#access_token=...&refresh_token=...
 * &type=recovery`. We:
 *
 *   1. Parse the URL fragment into tokens (parseAuthUrl helper)
 *   2. Call supabase.auth.setSession to install the recovery session
 *   3. Show the new-password form
 *   4. On submit, call supabase.auth.updateUser({ password })
 *   5. Success → user is now signed in with the new password; the
 *      (auth) layout's session redirect bounces them to /jobs
 *
 * Edge case: if the user lands on this route without a usable URL
 * (e.g. navigated manually), show an error and offer "back to sign
 * in." The reset link is one-time-use; trying to consume it twice
 * also lands here with a setSession error.
 */
export default function ResetPasswordScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const url = Linking.useURL();
  const consumedRef = useRef(false);

  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Step 1: consume the URL once and establish the recovery session.
  useEffect(() => {
    if (!url || consumedRef.current) return;
    const tokens = parseAuthCallbackUrl(url);
    if (!tokens) {
      setLinkError('No reset link detected. Open the email link from the same device.');
      return;
    }
    consumedRef.current = true;
    supabase.auth
      .setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      })
      .then(({ error }) => {
        if (error) setLinkError(error.message);
        else setLinkReady(true);
      })
      .catch((err: Error) => setLinkError(err.message));
  }, [url]);

  const onSubmit = async () => {
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(error.message);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Error path: bad/expired link.
  if (linkError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>Reset link invalid</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>{linkError}</Text>
          <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </SafeAreaView>
    );
  }

  // Loading: parsing URL / establishing session.
  if (!linkReady) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <Text style={[styles.caption, { color: palette.muted }]}>Verifying link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headerBlock}>
            <Text style={[styles.title, { color: palette.text }]}>Set new password</Text>
            <Text style={[styles.caption, { color: palette.muted }]}>
              Choose a password at least 8 characters long.
            </Text>
          </View>

          {done ? (
            <>
              <Text style={[styles.confirm, { color: palette.success }]}>
                Password updated. You&apos;re signed in.
              </Text>
              <Button label="Go to Jobs" onPress={() => router.replace('/(tabs)/jobs')} />
            </>
          ) : (
            <>
              <TextField
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                editable={!submitting}
              />
              <TextField
                label="Confirm new password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                error={formError}
                editable={!submitting}
              />
              <Button label="Update password" onPress={onSubmit} loading={submitting} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 32 },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBlock: { marginBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  caption: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  confirm: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 24,
  },
});
