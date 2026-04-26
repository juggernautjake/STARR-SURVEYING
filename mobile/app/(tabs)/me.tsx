import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { logError } from '@/lib/log';
import { useAuth } from '@/lib/auth';
import {
  getDeviceLibraryPref,
  setDeviceLibraryPref,
} from '@/lib/deviceLibrary';
import {
  biometricLabel,
  getBiometricCapability,
  type BiometricKind,
} from '@/lib/biometric';
import { colors } from '@/lib/theme';

/**
 * Me tab — signed-in surface for the current user.
 *
 * Phase F0 #2b adds the Security section: biometric unlock toggle and
 * "Lock now" button. When the device has no biometric hardware or the
 * user hasn't enrolled any (Face ID / fingerprint), the toggle is
 * disabled and we explain why instead of failing silently.
 *
 * Profile editing, idle-timer config UI, and notification preferences
 * land in F1+.
 */
export default function MeScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { session, signOut, biometricEnabled, setBiometricEnabled, lockNow } = useAuth();

  const [signingOut, setSigningOut] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('unknown');
  const [bioPending, setBioPending] = useState(false);
  const [saveToDeviceLib, setSaveToDeviceLib] = useState(false);
  const [savePrefPending, setSavePrefPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    getBiometricCapability().then((cap) => {
      if (!mounted) return;
      setBioAvailable(cap.available);
      setBioKind(cap.kind);
    });
    // Read the device-library backup pref so the switch reflects
    // the AsyncStorage state on mount.
    getDeviceLibraryPref().then((enabled) => {
      if (!mounted) return;
      setSaveToDeviceLib(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const onToggleSaveToDeviceLib = async (next: boolean) => {
    setSavePrefPending(true);
    try {
      await setDeviceLibraryPref(next);
      setSaveToDeviceLib(next);
    } finally {
      setSavePrefPending(false);
    }
  };

  const onToggleBiometric = async (next: boolean) => {
    setBioPending(true);
    try {
      await setBiometricEnabled(next);
    } finally {
      setBioPending(false);
    }
  };

  const onLockNow = () => {
    if (!biometricEnabled) {
      Alert.alert(
        'Enable biometric first',
        `Turn on ${biometricLabel(bioKind)} unlock to lock the app.`
      );
      return;
    }
    lockNow();
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      // Sign-out can fail if Supabase's storage adapter throws on
      // session-clear (rare; usually a keychain race). Surface
      // because otherwise the button just spins forever.
      logError('me.onSignOut', 'sign out failed', err);
      Alert.alert(
        'Sign-out failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSigningOut(false);
    }
  };

  const email = session?.user.email ?? 'unknown';
  const kindUpper = capitalize(biometricLabel(bioKind));

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
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Security</Text>

          <View style={[styles.row, { borderColor: palette.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                {kindUpper} unlock
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {bioAvailable
                  ? `Require ${biometricLabel(bioKind)} when reopening Starr Field after 15 minutes idle.`
                  : 'Not available — enroll a biometric in your device settings to enable.'}
              </Text>
            </View>
            <Switch
              value={biometricEnabled && bioAvailable}
              onValueChange={onToggleBiometric}
              disabled={!bioAvailable || bioPending}
              trackColor={{ true: palette.accent, false: palette.border }}
              ios_backgroundColor={palette.border}
            />
          </View>

          <View style={styles.spacerSm} />

          <Button
            variant="secondary"
            label="Lock now"
            onPress={onLockNow}
            accessibilityHint={
              biometricEnabled
                ? 'Locks the app immediately; requires biometric to reopen'
                : 'Disabled — enable biometric unlock first'
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Backups</Text>

          <View style={[styles.row, { borderColor: palette.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                Save copies to my Photos
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                Keep a personal backup of every receipt and survey photo
                in your device&apos;s Photos app under a &quot;Starr Field&quot;
                album. The app already keeps a local copy until upload
                succeeds; this is your fallback if the app is uninstalled.
              </Text>
            </View>
            <Switch
              value={saveToDeviceLib}
              onValueChange={onToggleSaveToDeviceLib}
              disabled={savePrefPending}
              trackColor={{ true: palette.accent, false: palette.border }}
              ios_backgroundColor={palette.border}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Coming soon</Text>
          <Text style={[styles.sectionBody, { color: palette.text }]}>
            Profile editing, idle-timer length, and notification settings land in F1.
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  rowCaption: {
    fontSize: 13,
    lineHeight: 18,
  },
  spacerSm: { height: 12 },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
});
