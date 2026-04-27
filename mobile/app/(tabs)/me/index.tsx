import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { logError, logWarn } from '@/lib/log';
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
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/lib/notifications';
import { useOwnLocationPingSummary } from '@/lib/locationTracker';
import {
  tabletContainerStyle,
  useResponsiveLayout,
} from '@/lib/responsive';
import { usePinnedStorageStats } from '@/lib/pinnedFiles';
import { useUploadQueueStatus } from '@/lib/uploadQueue';
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
  const [notifStatus, setNotifStatus] =
    useState<NotificationPermissionState>('undetermined');
  const [notifPending, setNotifPending] = useState(false);
  // Reactive — drives the Storage row's "X uploads pending, Y failed"
  // affordance. Useful for detecting "I captured 5 photos in the
  // field today and 3 are still queued" before opening the drilldown.
  const { pendingCount: uploadsPending, failedCount: uploadsFailed } =
    useUploadQueueStatus();
  // Pinned-files summary so the surveyor can spot a runaway pin set
  // (e.g. ten 50 MB plats accumulated over a job). The row is
  // read-only here — actual unpin happens on the per-point file
  // card next to the file itself, which is where the user actually
  // remembers what each pin is.
  const { count: pinnedCount, totalBytes: pinnedBytes } =
    usePinnedStorageStats();
  // Reactive — drives the Privacy row's "X pings today" affordance
  // and "last seen" copy. The summary reads the same location_pings
  // rows the user can audit in the drilldown.
  const { count: pingsToday, latest: latestPing } =
    useOwnLocationPingSummary(24);

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
    // Read the OS notification permission so the row reflects truth.
    getNotificationPermissionStatus().then((s) => {
      if (!mounted) return;
      setNotifStatus(s);
    });

    // When the user returns from device Settings (where they may have
    // toggled notifications), re-read the permission so the row
    // updates without needing the user to leave + re-enter the tab.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        getNotificationPermissionStatus().then((s) => {
          if (mounted) setNotifStatus(s);
        });
      }
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const onTapNotifications = async () => {
    if (notifPending) return;
    if (notifStatus === 'granted') {
      // Already on — surface a small confirmation; otherwise the row
      // looks "tappable but inert" which is confusing.
      Alert.alert(
        'Notifications enabled',
        'You’ll receive dispatcher pings and clock-in reminders. To disable, use your device Settings.'
      );
      return;
    }

    setNotifPending(true);
    try {
      if (notifStatus === 'denied_hard') {
        // Hard-deny means iOS/Android won't surface our prompt; the
        // user has to flip it in Settings. Deep-link them there.
        Alert.alert(
          'Enable in Settings',
          'Starr Field can’t prompt you again — open Settings to turn notifications back on.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch((err) => {
                  logWarn(
                    'me.notifications',
                    'openSettings failed',
                    err
                  );
                });
              },
            },
          ]
        );
        return;
      }

      // Undetermined OR denied_can_ask — fire the OS prompt.
      const next = await requestNotificationPermission();
      setNotifStatus(next);
      if (next !== 'granted') {
        // User chose deny in the prompt. Tell them how to recover so
        // they don't think the toggle is broken.
        Alert.alert(
          'Notifications off',
          'You can change this anytime in your device Settings.'
        );
      }
    } finally {
      setNotifPending(false);
    }
  };

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
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.scroll, tabletStyle]}>
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
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            Notifications
          </Text>

          <View style={[styles.row, { borderColor: palette.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                {notifStatus === 'granted'
                  ? 'Enabled'
                  : notifStatus === 'denied_hard'
                  ? 'Blocked'
                  : 'Not enabled'}
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {notifStatus === 'granted'
                  ? 'Dispatcher pings and clock-in reminders show on the lock screen.'
                  : notifStatus === 'denied_hard'
                  ? 'Open device Settings to allow notifications. You won’t see dispatcher pings without this.'
                  : 'Tap below to allow notifications. You won’t see dispatcher pings without this.'}
              </Text>
            </View>
          </View>

          <View style={styles.spacerSm} />

          {notifStatus !== 'granted' ? (
            <Button
              variant="secondary"
              label={
                notifPending
                  ? 'Working…'
                  : notifStatus === 'denied_hard'
                  ? 'Open Settings'
                  : 'Allow notifications'
              }
              onPress={onTapNotifications}
              loading={notifPending}
              accessibilityHint={
                notifStatus === 'denied_hard'
                  ? 'Opens iOS or Android Settings so you can re-enable notifications'
                  : 'Prompts the OS to allow Starr Field to send notifications'
              }
            />
          ) : null}
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
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            Storage
          </Text>

          <Pressable
            onPress={() => router.push('/(tabs)/me/uploads')}
            style={[styles.row, styles.rowTappable, { borderColor: palette.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Uploads — ${uploadsPending} in flight, ${uploadsFailed} failed`}
            accessibilityHint="Opens the per-row upload triage screen"
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                Uploads
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {uploadsPending === 0 && uploadsFailed === 0
                  ? 'Everything is synced. Captured photos and receipts upload automatically when online.'
                  : uploadsFailed > 0
                  ? `${uploadsPending} in flight · ${uploadsFailed} failed — open to review.`
                  : `${uploadsPending} in flight. The queue retries automatically.`}
              </Text>
            </View>
            <Text
              style={[
                styles.rowChevron,
                {
                  color:
                    uploadsFailed > 0 ? palette.danger : palette.muted,
                },
              ]}
            >
              ›
            </Text>
          </Pressable>

          <View
            style={[styles.row, { borderColor: palette.border }]}
            accessibilityLabel={`Pinned files — ${pinnedCount} files, ${formatStorageBytes(pinnedBytes)}`}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                Pinned files
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {pinnedCount === 0
                  ? 'Nothing pinned. Pin a plat or deed from a point to read it offline.'
                  : `${pinnedCount} ${pinnedCount === 1 ? 'file' : 'files'} · ${formatStorageBytes(pinnedBytes)} on this device. Unpin from the point to free space.`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            Privacy & tracking
          </Text>

          <Pressable
            onPress={() => router.push('/(tabs)/me/privacy')}
            style={[styles.row, styles.rowTappable, { borderColor: palette.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Privacy and tracking — ${pingsToday} pings recorded in the last 24 hours`}
            accessibilityHint="Opens the disclosure + your own location timeline"
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                Today’s tracking
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {pingsToday === 0
                  ? 'No location pings recorded in the last 24 hours. Tracking only runs while you’re clocked in.'
                  : latestPing
                    ? `${pingsToday} ping${pingsToday === 1 ? '' : 's'} · last ${formatPingAge(latestPing)}. Tap to see exactly what the dispatcher sees.`
                    : `${pingsToday} pings recorded.`}
              </Text>
            </View>
            <Text style={[styles.rowChevron, { color: palette.muted }]}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>Coming soon</Text>
          <Text style={[styles.sectionBody, { color: palette.text }]}>
            Profile editing and idle-timer length land in F1+.
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

/**
 * "5m ago" / "2h ago" copy for the Privacy row's last-ping age. Returns
 * 'just now' for sub-minute deltas. Defensive against bad ISO inputs —
 * any parse failure renders 'recently' so the row still reads.
 */
function formatPingAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'recently';
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/** "12.4 MB" — used by the pinned-files row. Same scale as the
 *  per-file size column on the per-point file card so the user
 *  reads consistent units throughout. */
function formatStorageBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  rowTappable: {
    paddingHorizontal: 0,
  },
  rowChevron: {
    fontSize: 28,
    fontWeight: '300',
    paddingLeft: 8,
  },
  spacerSm: { height: 12 },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
});
