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

import { Button } from '@/lib/Button';
import { TextField } from '@/lib/TextField';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/**
 * Email + password sign-in. Per plan §4 personas, surveyors are
 * created by an admin in the web app first — there's intentionally
 * no sign-up screen here. New employees get an invite email from
 * Supabase Auth and land on the app already provisioned.
 */
export default function SignInScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const onSubmit = async () => {
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
            editable={!submitting}
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
            onSubmitEditing={onSubmit}
            error={error}
            editable={!submitting}
          />

          <Button label="Sign in" onPress={onSubmit} loading={submitting} />

          <View style={styles.linkRow}>
            <Link
              href="/(auth)/forgot-password"
              style={[styles.link, { color: palette.accent }]}
            >
              Forgot password?
            </Link>
          </View>
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
});
