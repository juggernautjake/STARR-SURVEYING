import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { ScreenHeader } from '@/lib/ScreenHeader';
import { MyPersonalKitSection } from '@/lib/MyPersonalKitSection';
import { MyTruckSection } from '@/lib/MyTruckSection';
import { useMyCheckouts, useMyPersonalKit } from '@/lib/equipment';
import * as haptics from '@/lib/haptics';
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
import {
  type AppVersionInfo,
  type ManualUpdateState,
  getAppVersionInfo,
  useManualUpdateCheck,
} from '@/lib/otaUpdates';
import { usePinnedStorageStats } from '@/lib/pinnedFiles';
import {
  type ThemePreference,
  useResolvedScheme,
  useThemePreference,
} from '@/lib/themePreference';
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
  // useResolvedScheme honours the user's Display preference (auto /
  // light / dark / sun) so the Me tab itself respects the toggle the
  // user is about to flip below.
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const [themePref, setThemePref] = useThemePreference();
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

  const onSignOut = () => {
    // Sign-out drops the session and forces the next surveyor on this
    // device through the full sign-in flow (biometric / password +
    // PowerSync resync). Easy to fat-finger from the bottom of /me
    // mid-scroll, so confirm before the async work fires. iOS/Android
    // destructive-button pattern keeps it native.
    Alert.alert(
      'Sign out?',
      'You’ll need to sign back in to capture, clock in, or upload. Any unsynced work stays on this device until you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            haptics.confirm();
            setSigningOut(true);
            try {
              await signOut();
            } catch (err) {
              // Sign-out can fail if Supabase's storage adapter throws
              // on session-clear (rare; usually a keychain race).
              // Surface because otherwise the button just spins.
              logError('me.onSignOut', 'sign out failed', err);
              Alert.alert(
                'Sign-out failed',
                err instanceof Error ? err.message : String(err)
              );
            } finally {
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  const email = session?.user.email ?? 'unknown';
  const { summary: truckSummary } = useMyCheckouts(session?.user.id ?? null);
  const { items: personalKitItems } = useMyPersonalKit(
    session?.user.id ?? null
  );
  const kindUpper = capitalize(biometricLabel(bioKind));
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.scroll, tabletStyle]}>
        <ScreenHeader
          title="Account"
          subtitle={email}
          right={
            // One-tap Sun-readable toggle (D8). The 4-pill picker
            // further down still controls Auto / Light / Dark
            // explicitly; this pill is the "I just walked into
            // direct sun and can't read the screen" shortcut.
            // Toggles between 'sun' and 'auto' so the second tap
            // returns to OS-following. Haptic confirms the flip.
            <Pressable
              onPress={() => {
                haptics.tap();
                void setThemePref(themePref === 'sun' ? 'auto' : 'sun');
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: themePref === 'sun' }}
              accessibilityLabel="Sun-readable theme"
              accessibilityHint="Toggles the max-contrast sun-readable colour scheme for direct sunlight."
              hitSlop={8}
              style={({ pressed }) => [
                styles.sunPill,
                {
                  backgroundColor:
                    themePref === 'sun' ? palette.accent : 'transparent',
                  borderColor:
                    themePref === 'sun' ? palette.accent : palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: themePref === 'sun' ? '#FFFFFF' : palette.text,
                }}
              >
                ☀ {themePref === 'sun' ? 'On' : 'Sun'}
              </Text>
            </Pressable>
          }
        />

        <MyTruckSection summary={truckSummary} palette={palette} />

        <MyPersonalKitSection items={personalKitItems} palette={palette} />

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

        {/* Display preference. Sun-readable boosts contrast for direct
            sunlight per plan §7.1 rule 3 ("Sun-readable: high-contrast
            theme, 1-tap toggle"). */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            Display
          </Text>
          <View style={[styles.row, { borderColor: palette.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: palette.text }]}>
                Theme
              </Text>
              <Text style={[styles.rowCaption, { color: palette.muted }]}>
                {themePref === 'sun'
                  ? 'Sun-readable picks max-contrast colours so the screen reads in direct sunlight.'
                  : themePref === 'auto'
                    ? 'Auto follows the OS dark / light setting.'
                    : 'Manually picked. Switch back to Auto to follow the OS.'}
              </Text>
              <View style={styles.themePillRow}>
                {(
                  [
                    { key: 'auto', label: 'Auto' },
                    { key: 'light', label: 'Light' },
                    { key: 'dark', label: 'Dark' },
                    { key: 'sun', label: '☀ Sun' },
                  ] as Array<{ key: ThemePreference; label: string }>
                ).map((opt) => {
                  const active = themePref === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => void setThemePref(opt.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Theme: ${opt.label}`}
                      style={({ pressed }) => [
                        styles.themePill,
                        {
                          backgroundColor: active
                            ? palette.accent
                            : 'transparent',
                          borderColor: active
                            ? palette.accent
                            : palette.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? '#FFFFFF' : palette.text,
                          fontSize: 13,
                          fontWeight: '600',
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
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
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>About</Text>
          <AboutRow palette={palette} />
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
/**
 * About row — Batch HH. Shows the app version + EAS Update channel
 * + a "Check for updates" button that pulls a fresh JS bundle from
 * the EAS CDN and prompts the user to restart.
 *
 * Hidden when expo-updates isn't enabled (dev mode, no URL set) so
 * the row isn't a misleading dead-end. The version line still
 * renders so the surveyor can read the binary version off the
 * screen for support requests.
 */
function AboutRow({
  palette,
}: {
  palette: { text: string; muted: string; accent: string; surface: string; border: string; danger: string };
}) {
  const info = useMemo<AppVersionInfo>(() => getAppVersionInfo(), []);
  const { state, check, restart } = useManualUpdateCheck();
  const [busy, setBusy] = useState(false);

  const onCheck = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await check();
    } finally {
      setBusy(false);
    }
  };

  const onRestart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await restart();
    } finally {
      setBusy(false);
    }
  };

  const versionLine = [
    info.appVersion ? `v${info.appVersion}` : null,
    info.channel ? `${info.channel} channel` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const statusLabel = formatUpdateState(state);

  return (
    <View
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
        Starr Field
      </Text>
      <Text
        style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}
        accessibilityLabel={`App version ${versionLine || 'unknown'}`}
      >
        {versionLine || 'Version unknown'}
      </Text>
      {info.updateId ? (
        <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
          Bundle {info.updateId.slice(0, 8)}…
        </Text>
      ) : null}
      {statusLabel ? (
        <Text
          style={{
            color:
              state.kind === 'error'
                ? palette.danger
                : state.kind === 'ready-to-restart'
                  ? palette.accent
                  : palette.muted,
            fontSize: 12,
            marginTop: 6,
          }}
          accessibilityLiveRegion="polite"
        >
          {statusLabel}
        </Text>
      ) : null}
      {info.enabled ? (
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
          {state.kind === 'ready-to-restart' ? (
            <Pressable
              onPress={() => void onRestart()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Restart to apply update"
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: palette.accent,
                opacity: pressed || busy ? 0.7 : 1,
              })}
            >
              <Text
                style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}
              >
                Restart to apply
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void onCheck()}
              disabled={busy || state.kind === 'checking' || state.kind === 'downloading'}
              accessibilityRole="button"
              accessibilityLabel="Check for updates"
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.accent,
                opacity: pressed || busy ? 0.7 : 1,
              })}
            >
              <Text
                style={{ color: palette.accent, fontSize: 13, fontWeight: '600' }}
              >
                {state.kind === 'checking'
                  ? 'Checking…'
                  : state.kind === 'downloading'
                    ? 'Downloading…'
                    : 'Check for updates'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text
          style={{ color: palette.muted, fontSize: 11, marginTop: 8, fontStyle: 'italic' }}
        >
          OTA updates aren&apos;t enabled in this build. Install the latest
          version from the App Store / Play Store.
        </Text>
      )}
    </View>
  );
}

function formatUpdateState(state: ManualUpdateState): string | null {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return 'Downloading the new version…';
    case 'no-update': {
      const t = Date.parse(state.checkedAt);
      const ago = Number.isFinite(t)
        ? Math.max(0, Math.floor((Date.now() - t) / 1000))
        : 0;
      return ago < 60
        ? 'You’re up to date.'
        : `You’re up to date. (Checked ${Math.floor(ago / 60)}m ago.)`;
    }
    case 'ready-to-restart':
      return 'Update ready. Tap “Restart to apply” to use it.';
    case 'error':
      return `Couldn’t check: ${state.message}`;
    default:
      return null;
  }
}

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
  themePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  themePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 64,
    alignItems: 'center',
  },
  sunPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: { flex: 1 },
  scroll: {
    padding: 24,
    paddingTop: 32,
    flexGrow: 1,
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
