import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/**
 * Me tab — signed-in surface for the current user.
 *
 * Phase F0 #2a scope: show the email and offer sign-out. Profile
 * editing, biometric toggle, and notification preferences land in
 * F0 #2b and beyond.
 */
export default function MeScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { session, signOut } = useAuth();

  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      // The (tabs) layout's session guard catches the null session
      // and redirects to /(auth)/sign-in — no manual navigation here.
    } finally {
      setSigningOut(false);
    }
  };

  const email = session?.user.email ?? 'unknown';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <Text style={[styles.label, { color: palette.muted }]}>Signed in as</Text>
          <Text style={[styles.email, { color: palette.text }]} selectable>
            {email}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Coming soon</Text>
          <Text style={[styles.sectionBody, { color: palette.text }]}>
            Biometric unlock, auto-lock timer, and notification settings land in Phase F0 #2b.
            Full profile editing in F1.
          </Text>
        </View>

        <View style={styles.spacer} />

        <Button
          variant="danger"
          label="Sign out"
          onPress={onSignOut}
          loading={signingOut}
          accessibilityHint="Signs out of Starr Field and returns to the sign-in screen"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: 24,
    paddingTop: 32,
    flexGrow: 1,
  },
  headerBlock: { marginBottom: 32 },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  email: {
    fontSize: 22,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
});
