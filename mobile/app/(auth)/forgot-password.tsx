import { Link, router } from 'expo-router';
import { useState } from 'react';
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
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Request a password-reset email. Supabase sends a deep-link to
 * `starr-field://reset-password#...` (configured in lib/auth.tsx
 * via Linking.createURL); the handler at app/(auth)/reset-password.tsx
 * consumes the link, establishes the recovery session, and shows the
 * new-password form.
 *
 * On this screen, success just shows a confirmation message — the
 * user goes to their email, taps the link, and the OS reopens the
 * app at the reset-password screen to finish the flow.
 */
export default function ForgotPasswordScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const errMsg = await resetPassword(email);
    setSubmitting(false);
    if (errMsg) {
      setError(errMsg);
    } else {
      setSent(true);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headerBlock}>
            <Text style={[styles.title, { color: palette.text }]}>Reset password</Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              We&apos;ll email a link to set a new password.
            </Text>
          </View>

          {sent ? (
            <>
              <Text style={[styles.confirm, { color: palette.success }]}>
                Email sent. Check your inbox for a reset link, then return here to sign in.
              </Text>
              <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
            </>
          ) : (
            <>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                error={error}
                editable={!submitting}
              />
              <Button label="Send reset email" onPress={onSubmit} loading={submitting} />
              <View style={styles.linkRow}>
                <Link href="/(auth)/sign-in" style={[styles.link, { color: palette.accent }]}>
                  Back to sign in
                </Link>
              </View>
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
  scroll: {
    padding: 24,
    paddingTop: 32,
  },
  headerBlock: { marginBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  confirm: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 24,
  },
  linkRow: {
    marginTop: 24,
    alignItems: 'center',
  },
  link: {
    fontSize: 15,
    fontWeight: '500',
  },
});
