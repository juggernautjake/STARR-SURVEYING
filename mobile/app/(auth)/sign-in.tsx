import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppleSignInButton } from '@/lib/AppleSignInButton';
import { Button } from '@/lib/Button';
import { TextField } from '@/lib/TextField';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/**
 * Email + password sign-in plus alternative flows: magic link (email
 * a one-tap sign-in link) and Sign in with Apple (iOS only).
 *
 * Per plan §4 personas, surveyors are created by an admin in the web
 * app first — there's intentionally no sign-up screen here. New
 * employees get an invite email from Supabase Auth and land on the
 * app already provisioned. signInWithMagicLink uses
 * `shouldCreateUser: false` to enforce that.
 */
export default function SignInScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { signIn, signInWithMagicLink } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const onSubmitPassword = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const errMsg = await signIn(email, password);
    setSubmitting(false);
    if (errMsg) setError(errMsg);
    // On success, the AuthProvider session updates and the (auth)
    // layout's redirect kicks in — no router.replace needed here.
  };

  const onSendMagicLink = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then send the link.');
      return;
    }
    setError(null);
    setMagicSubmitting(true);
    const errMsg = await signInWithMagicLink(email);
    setMagicSubmitting(false);
    if (errMsg) {
      setError(errMsg);
      return;
    }
    setMagicSent(true);
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <Text style={[styles.title, { color: palette.text }]}>Starr Field</Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              Sign in with your Starr Software account.
            </Text>
          </View>

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
            editable={!submitting && !magicSubmitting}
          />

          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmitPassword}
            error={error}
            editable={!submitting && !magicSubmitting}
          />

          <Button
            label="Sign in"
            onPress={onSubmitPassword}
            loading={submitting}
            disabled={magicSubmitting}
          />

          <View style={styles.linkRow}>
            <Link
              href="/(auth)/forgot-password"
              style={[styles.link, { color: palette.accent }]}
            >
              Forgot password?
            </Link>
          </View>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
            <Text style={[styles.dividerLabel, { color: palette.muted }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
          </View>

          {magicSent ? (
            <Text style={[styles.magicConfirm, { color: palette.success }]}>
              Sign-in link sent. Check your inbox and tap the link to sign in.
            </Text>
          ) : (
            <Button
              variant="secondary"
              label="Email me a sign-in link"
              onPress={onSendMagicLink}
              loading={magicSubmitting}
              disabled={submitting}
              accessibilityHint="Sends a one-tap sign-in link to your email"
            />
          )}

          <View style={styles.appleSpacer} />

          <AppleSignInButton onError={(msg) => setError(msg)} />
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
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  linkRow: {
    marginTop: 24,
    alignItems: 'center',
  },
  link: {
    fontSize: 15,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  magicConfirm: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  appleSpacer: {
    height: 12,
  },
});
