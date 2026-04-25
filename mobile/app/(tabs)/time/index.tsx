import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { useActiveTimeEntry, useClockOut } from '@/lib/timeTracking';
import { formatDuration } from '@/lib/timeFormat';
import { colors } from '@/lib/theme';

/**
 * Time tab — F1 #4 clock-in/out.
 *
 * Two states:
 *   1. Not clocked in — big "Clock in" button that opens pick-job.
 *   2. Clocked in — shows job/entry-type + live duration counter +
 *      "Clock out" button.
 *
 * Timesheet history (past entries, totals by day, submit-for-
 * approval) lands in F1 #5.
 */
export default function TimeScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { active, isLoading } = useActiveTimeEntry();
  const clockOut = useClockOut();
  const [clockingOut, setClockingOut] = useState(false);

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

        <View style={styles.hintRow}>
          <Text style={[styles.hint, { color: palette.muted }]}>
            Timesheet history (today / this week / submit-for-approval) lands
            in F1 #5.
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
  hintRow: {
    paddingTop: 24,
  },
  hint: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
