import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import * as haptics from '@/lib/haptics';
import { logError } from '@/lib/log';
import { useJobs, type Job } from '@/lib/jobs';
import { useClockIn, type EntryType } from '@/lib/timeTracking';
import {
  hasTrackingConsent,
  setTrackingConsent,
} from '@/lib/trackingConsent';
import { TrackingConsentModal } from '@/lib/TrackingConsentModal';
import { useVehicles, type Vehicle } from '@/lib/vehicles';
import { ScreenHeader } from '@/lib/ScreenHeader';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Modal: pick what to clock into.
 *
 * Top of the screen: four pseudo-job tiles (On site / Travel / Office
 * / Overhead) for quick non-job entries — these write a job_time_entries
 * row with job_id = NULL and entry_type set per the tap.
 *
 * Below that: scrollable list of active jobs from useJobs(). Tap one
 * to clock-in with entry_type = 'on_site' and job_id set.
 *
 * Per plan §5.10.1, location stamp captures only after the user has
 * actively chosen what to clock into — never automatically.
 */

const ENTRY_TYPE_OPTIONS: { type: EntryType; label: string; emoji: string }[] = [
  { type: 'travel', label: 'Travel', emoji: '🚗' },
  { type: 'office', label: 'Office', emoji: '🏢' },
  { type: 'overhead', label: 'Overhead', emoji: '🧰' },
];

export default function PickJobScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const { jobs } = useJobs();
  const { vehicles } = useVehicles();
  const clockIn = useClockIn();

  const [submitting, setSubmitting] = useState(false);
  // Vehicle picker state — surveyor selects (or skips) a vehicle
  // BEFORE picking a job/category. Driver toggle defaults true since
  // most clock-ins are the driver themselves; passengers explicitly
  // flip it off so mileage attribution stays clean.
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(
    null
  );
  const [isDriver, setIsDriver] = useState<boolean>(true);
  // Tracking-consent modal state. Shown the FIRST time the surveyor
  // clocks in (per `hasTrackingConsent` flag in AsyncStorage). The
  // pending action is held in a ref so onContinue / onSkip can run
  // the right job / entry type when the modal closes.
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingClockInRef = useRef<null | (() => Promise<void>)>(null);

  // Shared exit path — surface GPS-failure messaging when present, then
  // dismiss back to the Time tab. Surveyors trust the on-site stamp
  // for billing, so a silent no-GPS clock-in leads to confusing
  // mileage gaps later.
  const finishClockIn = (
    result: Awaited<ReturnType<ReturnType<typeof useClockIn>>>,
    label: string
  ) => {
    haptics.success();
    if (!result.hasGps) {
      Alert.alert(
        `Clocked into ${label} — no GPS fix`,
        gpsReasonClockInCopy(result.gpsReason),
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
    }
    router.back();
  };

  /**
   * Wrap a clock-in action with the tracking-consent check.
   * - If consent already granted → run immediately.
   * - If not → defer the action behind the consent modal. The
   *   user's "Continue" tap persists consent + runs the action;
   *   "Skip tracking for now" runs the action without consent
   *   (clock-in still happens; only background tracking is bypassed).
   *
   * Held in a ref because Modal callbacks would otherwise close
   * over stale jobId / type values.
   */
  const runWithConsent = async (action: () => Promise<void>) => {
    const granted = await hasTrackingConsent();
    if (granted) {
      await action();
      return;
    }
    pendingClockInRef.current = action;
    setConsentVisible(true);
  };

  const onConsentContinue = async () => {
    setConsentVisible(false);
    await setTrackingConsent(true);
    const action = pendingClockInRef.current;
    pendingClockInRef.current = null;
    if (action) await action();
  };

  const onConsentSkip = async () => {
    setConsentVisible(false);
    // Don't persist consent — we'll re-prompt on next clock-in.
    // The action still runs so the surveyor can clock in WITHOUT
    // background tracking for this shift; clock-in/out boundary
    // pings still capture coordinates via lib/location.ts.
    const action = pendingClockInRef.current;
    pendingClockInRef.current = null;
    if (action) await action();
  };

  const onPickEntryType = (type: EntryType) =>
    runWithConsent(async () => {
      setSubmitting(true);
      try {
        const result = await clockIn({
          jobId: null,
          entryType: type,
          vehicleId: pickedVehicleId,
          isDriver: pickedVehicleId ? isDriver : false,
        });
        finishClockIn(result, type);
      } catch (err) {
        logError('pickJob.onPickEntryType', 'clock-in failed', err, {
          entry_type: type,
        });
        Alert.alert(
          'Clock-in failed',
          err instanceof Error ? err.message : String(err)
        );
        setSubmitting(false);
      }
    });

  const onPickJob = (job: Job) => {
    if (!job.id) return;
    return runWithConsent(async () => {
      setSubmitting(true);
      try {
        const result = await clockIn({
          jobId: job.id,
          entryType: 'on_site',
          vehicleId: pickedVehicleId,
          isDriver: pickedVehicleId ? isDriver : false,
        });
        finishClockIn(result, job.name?.trim() || 'job');
      } catch (err) {
        logError('pickJob.onPickJob', 'clock-in failed', err, {
          job_id: job.id,
        });
        Alert.alert(
          'Clock-in failed',
          err instanceof Error ? err.message : String(err)
        );
        setSubmitting(false);
      }
    });
  };

  const gpsReasonClockInCopy = (
    reason: 'no_permission' | 'timeout' | 'hardware' | null
  ): string => {
    switch (reason) {
      case 'no_permission':
        return 'Location permission is off — your start point won’t appear on the map. Turn on location in Settings to GPS-stamp future clock-ins.';
      case 'timeout':
        return "Couldn't reach a satellite in time. Your clock-in is recorded but the start point won't appear on the map. Try moving outside if the fix is needed.";
      default:
        return 'Your start point won’t appear on the map. The office can correct mileage from the admin site if needed.';
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <ScreenHeader back title="Clock in" />

      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id ?? ''}
        ListHeaderComponent={
          <View>
            {vehicles.length > 0 ? (
              <View style={styles.vehicleBlock}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  Vehicle (optional)
                </Text>
                <View style={styles.vehiclePillRow}>
                  <VehiclePill
                    active={pickedVehicleId === null}
                    label="None"
                    onPress={() => setPickedVehicleId(null)}
                    palette={palette}
                  />
                  {vehicles.map((v) => (
                    <VehiclePill
                      key={v.id}
                      active={pickedVehicleId === v.id}
                      label={v.name ?? 'Unnamed'}
                      onPress={() => setPickedVehicleId(v.id ?? null)}
                      palette={palette}
                    />
                  ))}
                </View>
                {pickedVehicleId ? (
                  <Pressable
                    onPress={() => setIsDriver((d) => !d)}
                    style={styles.driverToggleRow}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDriver }}
                    accessibilityLabel="I'm driving"
                    hitSlop={8}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isDriver ? palette.accent : palette.border,
                          backgroundColor: isDriver ? palette.accent : 'transparent',
                        },
                      ]}
                    >
                      {isDriver ? (
                        <Text style={styles.checkboxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.driverToggleLabel, { color: palette.text }]}>
                      I’m driving
                    </Text>
                    <Text style={[styles.driverToggleHint, { color: palette.muted }]}>
                      {isDriver
                        ? 'Mileage will be attributed to you for IRS deduction.'
                        : 'You’re a passenger — the driver claims mileage.'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Quick categories
            </Text>
            <View style={styles.tileRow}>
              {ENTRY_TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.type}
                  disabled={submitting}
                  onPress={() => onPickEntryType(opt.type)}
                  accessibilityRole="button"
                  accessibilityLabel={`Clock in as ${opt.label}`}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: pressed ? palette.border : palette.surface,
                      borderColor: palette.border,
                      opacity: submitting ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={styles.tileEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.tileLabel, { color: palette.text }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Jobs ({jobs.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={submitting}
            onPress={() => onPickJob(item)}
            accessibilityRole="button"
            accessibilityLabel={`Clock in to ${item.name ?? 'job'}`}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? palette.border : palette.surface,
                borderColor: palette.border,
                opacity: submitting ? 0.5 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.rowName, { color: palette.text }]}
                numberOfLines={1}
              >
                {item.name?.trim() || '(unnamed job)'}
              </Text>
              <Text
                style={[styles.rowSubtitle, { color: palette.muted }]}
                numberOfLines={1}
              >
                {[item.job_number, item.client_name].filter(Boolean).join(' · ') ||
                  ' '}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: palette.muted }]}>
            No jobs synced yet — use a quick category above.
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />

      {submitting ? (
        <View style={styles.submittingOverlay}>
          <Button label="Clocking in…" onPress={() => undefined} loading />
        </View>
      ) : null}

      <TrackingConsentModal
        visible={consentVisible}
        onContinue={() => void onConsentContinue()}
        onSkip={() => void onConsentSkip()}
      />
    </SafeAreaView>
  );
}

interface VehiclePillProps {
  active: boolean;
  label: string;
  onPress: () => void;
  palette: ReturnType<typeof paletteOf>;
}

function VehiclePill({ active, label, onPress, palette }: VehiclePillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.vehiclePill,
        {
          borderColor: active ? palette.accent : palette.border,
          backgroundColor: active ? palette.accent : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.vehiclePillText,
          { color: active ? '#FFFFFF' : palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function paletteOf(scheme: 'light' | 'dark') {
  return colors[scheme];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  tile: {
    flex: 1,
    minHeight: 96,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  submittingOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
  },
  vehicleBlock: {
    marginBottom: 8,
  },
  vehiclePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  vehiclePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  vehiclePillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  driverToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  driverToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  driverToggleHint: {
    fontSize: 12,
    flex: 1,
  },
});
