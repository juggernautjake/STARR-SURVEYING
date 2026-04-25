import { useAuth } from '@/lib/auth';
import { buildTimesheetCsv, suggestedCsvFilename } from '@/lib/csvExport';
import { shareTextFile } from '@/lib/share';
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
import { thisWeekRange, useSubmitWeek, useThisWeekTotal } from '@/lib/timesheetActions';
import { colors } from '@/lib/theme';

/**
 * Time tab.
 *
 * Layout (single scroll):
 *   1. Status card        — clocked-in vs not, live duration counter,
 *                           clock-in/out button (F1 #4)
 *   2. This-week summary  — total minutes + Submit + Export CSV
 *                           buttons (F1 #9)
 *   3. Recent entries     — last 14 days grouped by day with status
 *                           chips, daily totals, tappable for edit
 *                           (F1 #5 + F1 #6)
 */
export default function TimeScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { session } = useAuth();
  const { active, isLoading } = useActiveTimeEntry();
  const { days, isLoading: timesheetLoading } = useTimesheet(14);
  const { totalMinutes: weekMinutes } = useThisWeekTotal();
  const clockOut = useClockOut();
  const submitWeek = useSubmitWeek();
  const [clockingOut, setClockingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const onSubmitWeek = async () => {
    setSubmitting(true);
    try {
      const result = await submitWeek();
      if (result.hasOpenEntry) {
        Alert.alert(
          'Clock out first',
          'You have an open entry this week. Clock out before submitting.'
        );
      } else if (result.alreadySubmitted) {
        Alert.alert(
          'Already submitted',
          'No open days in this week — already sent for approval.'
        );
      } else {
        Alert.alert(
          'Submitted',
          `${result.flipped} day${result.flipped === 1 ? '' : 's'} sent to approval.`
        );
      }
    } catch (err) {
      Alert.alert('Submit failed', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onExportCsv = async () => {
    setExporting(true);
    try {
      const csv = buildTimesheetCsv(days);
      const range = computeRangeFromDays(days);
      const filename = suggestedCsvFilename(
        session?.user.email ?? null,
        range.from,
        range.to
      );
      const shared = await shareTextFile({
        filename,
        contents: csv,
        mimeType: 'text/csv',
        dialogTitle: 'Send timesheet',
      });
      if (!shared) {
        Alert.alert(
          'Sharing unavailable',
          'This device cannot share files. Try again from a real phone.'
        );
      }
    } catch (err) {
      Alert.alert('Export failed', (err as Error).message);
    } finally {
      setExporting(false);
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

        <View
          style={[
            styles.weekCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.weekHeader}>
            <Text style={[styles.weekLabel, { color: palette.muted }]}>
              This week
            </Text>
            <Text style={[styles.weekRange, { color: palette.muted }]}>
              {formatRangeLabel(thisWeekRange())}
            </Text>
          </View>
          <Text style={[styles.weekTotal, { color: palette.text }]}>
            {formatDuration(weekMinutes * 60_000)}
          </Text>

          <View style={styles.weekButtons}>
            <View style={styles.weekButton}>
              <Button
                label="Submit"
                onPress={onSubmitWeek}
                loading={submitting}
                disabled={exporting || weekMinutes === 0}
                accessibilityHint="Sends this week's open days to the dispatcher for approval"
              />
            </View>
            <View style={styles.weekButtonGap} />
            <View style={styles.weekButton}>
              <Button
                variant="secondary"
                label="Export CSV"
                onPress={onExportCsv}
                loading={exporting}
                disabled={submitting || days.length === 0}
                accessibilityHint="Generates a CSV of recent entries and opens the share sheet"
              />
            </View>
          </View>
        </View>

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
            Smart prompts (still working?) + GPS auto-suggest land in F1 #7
            and #8.
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

function formatRangeLabel(range: { from: string; to: string }): string {
  return `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Pick min/max log_dates from the loaded days for the CSV filename. */
function computeRangeFromDays(
  days: { date: string }[]
): { from: string; to: string } {
  if (days.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { from: today, to: today };
  }
  const sorted = days.map((d) => d.date).sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
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
  weekCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekRange: {
    fontSize: 12,
  },
  weekTotal: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: 8,
  },
  weekButtons: {
    flexDirection: 'row',
    marginTop: 8,
  },
  weekButton: {
    flex: 1,
  },
  weekButtonGap: {
    width: 12,
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
