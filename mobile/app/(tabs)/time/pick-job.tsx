import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { logError } from '@/lib/log';
import { useJobs, type Job } from '@/lib/jobs';
import { useClockIn, type EntryType } from '@/lib/timeTracking';
import { colors } from '@/lib/theme';

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
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { jobs } = useJobs();
  const clockIn = useClockIn();

  const [submitting, setSubmitting] = useState(false);

  // Shared exit path — surface GPS-failure messaging when present, then
  // dismiss back to the Time tab. Surveyors trust the on-site stamp
  // for billing, so a silent no-GPS clock-in leads to confusing
  // mileage gaps later.
  const finishClockIn = (
    result: Awaited<ReturnType<ReturnType<typeof useClockIn>>>,
    label: string
  ) => {
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

  const onPickEntryType = async (type: EntryType) => {
    setSubmitting(true);
    try {
      const result = await clockIn({ jobId: null, entryType: type });
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
  };

  const onPickJob = async (job: Job) => {
    if (!job.id) return;
    setSubmitting(true);
    try {
      const result = await clockIn({ jobId: job.id, entryType: 'on_site' });
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
        return 'Your start point won’t appear on the map. Henry can correct mileage from the web admin if needed.';
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: palette.text }]}>Clock in</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.closeButton}
        >
          <Text style={[styles.closeText, { color: palette.muted }]}>Cancel</Text>
        </Pressable>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id ?? ''}
        ListHeaderComponent={
          <View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
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
});
