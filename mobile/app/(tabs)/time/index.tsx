import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { Timesheet } from '@/lib/Timesheet';
import { useActiveTimeEntry, useClockOut } from '@/lib/timeTracking';
import { formatDuration } from '@/lib/timeFormat';
import { useTimesheet } from '@/lib/timesheet';
import { colors } from '@/lib/theme';

/**
 * Time tab — F1 #4 clock-in/out + F1 #5 timesheet history.
 *
 * Layout (single scroll):
 *   1. Status card — clocked-in vs not, with live duration counter
 *      and clock-in/out button (F1 #4).
 *   2. Recent entries — last 14 days, grouped by day, with daily
 *      totals (F1 #5). Read-only; F1 #6 makes entries tappable for
 *      manual edits with audit trail.
 */
export default function TimeScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { active, isLoading } = useActiveTimeEntry();
  const { days, isLoading: timesheetLoading } = useTimesheet(14);
  const clockOut = useClockOut();
  const [clockingOut, setClockingOut] = useState(false);

  // Only block on the active-entry query — the timesheet query can
  // arrive a beat later and the section gracefully shows "No history
  // yet" or the loaded data without flashing the splash.
  if (isLoading) return <LoadingSplash />;

  const onClockIn = () => router.push('/(tabs)/time/pick-job');

  const onClockOut = async () => {
    setClockingOut(true);
    try {
      const ok = await clockOut();
      if (!ok) Alert.alert('Already clocked out', 'No open entry to close.');
    } catch (err) {
      Alert.alert('Clock-out failed', (err as Error).message);
    } finally {
      setClockingOut(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: palette.text }]}>Time</Text>
        </View>

        {active ? (
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.cardLabel, { color: palette.muted }]}>
              Clocked into
            </Text>
            <Text
              style={[styles.cardTitle, { color: palette.text }]}
              numberOfLines={2}
            >
              {active.jobName ?? entryTypeLabel(active.entry.entry_type)}
            </Text>
            <Text style={[styles.cardSubtitle, { color: palette.muted }]}>
              {entryTypeLabel(active.entry.entry_type)}
              {active.entry.started_at
                ? ` · started ${formatStartedAt(active.entry.started_at)}`
                : ''}
            </Text>

            <Text style={[styles.duration, { color: palette.accent }]}>
              {formatDuration(active.elapsedMs)}
            </Text>

            <Button
              variant="danger"
              label="Clock out"
              onPress={onClockOut}
              loading={clockingOut}
              accessibilityHint="Stops the active time entry and stamps your clock-out location"
            />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.cardLabel, { color: palette.muted }]}>
              Status
            </Text>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              Not clocked in
            </Text>
            <Text style={[styles.cardSubtitle, { color: palette.muted }]}>
              Tap below to start a new time entry. We&apos;ll stamp your
              location at clock-in (with permission) so timesheets and
              mileage logs are accurate.
            </Text>
            <View style={styles.buttonSpacer} />
            <Button
              label="Clock in"
              onPress={onClockIn}
              accessibilityHint="Opens the job picker to start a new time entry"
            />
          </View>
        )}

        <View style={styles.timesheetHeader}>
          <Text style={[styles.timesheetTitle, { color: palette.text }]}>
            Recent
          </Text>
          <Text style={[styles.timesheetSubtitle, { color: palette.muted }]}>
            Last 14 days
          </Text>
        </View>

        {timesheetLoading && days.length === 0 ? null : (
          <Timesheet
            days={days}
            onPressEntry={(entry) =>
              router.push(`/(tabs)/time/edit/${entry.id}`)
            }
          />
        )}

        <View style={styles.hintRow}>
          <Text style={[styles.hint, { color: palette.muted }]}>
            Submit-for-approval + CSV export land in F1 #9.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function entryTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'on_site':
      return 'On site';
    case 'travel':
      return 'Travel';
    case 'office':
      return 'Office';
    case 'overhead':
      return 'Overhead';
    default:
      return 'Time entry';
  }
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  headerRow: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  duration: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: 24,
    textAlign: 'center',
  },
  buttonSpacer: {
    height: 24,
  },
  timesheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 16,
  },
  timesheetTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  timesheetSubtitle: {
    fontSize: 13,
  },
  hintRow: {
    paddingTop: 24,
  },
  hint: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
