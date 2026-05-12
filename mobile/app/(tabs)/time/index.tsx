import { useAuth } from '@/lib/auth';
import { buildTimesheetCsv, suggestedCsvFilename } from '@/lib/csvExport';
import { shareTextFile } from '@/lib/share';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { ScreenHeader } from '@/lib/ScreenHeader';
import * as haptics from '@/lib/haptics';
import { logError } from '@/lib/log';
import { Timesheet } from '@/lib/Timesheet';
import {
  entryTypeLabel,
  useActiveTimeEntry,
  useClockOut,
} from '@/lib/timeTracking';
import {
  formatDuration,
  formatLocalShortDate,
  formatLocalTime,
  todayLocalISODate,
} from '@/lib/timeFormat';
import { useTimesheet } from '@/lib/timesheet';
import { thisWeekRange, useSubmitWeek, useThisWeekTotal } from '@/lib/timesheetActions';
import {
  tabletContainerStyle,
  useResponsiveLayout,
} from '@/lib/responsive';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

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
  const scheme = useResolvedScheme();
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
      const result = await clockOut();
      if (!result.ok) {
        Alert.alert('Already clocked out', 'No open entry to close.');
        return;
      }
      haptics.success();
      // Tell the user when the clock-out wasn't location-stamped.
      // Otherwise they assume the row carries GPS and only find out
      // weeks later when mileage doesn't add up.
      if (!result.hasGps) {
        Alert.alert(
          'Clocked out — no GPS fix',
          gpsReasonClockOutCopy(result.gpsReason)
        );
      }
    } catch (err) {
      logError('time.onClockOut', 'clock-out failed', err);
      Alert.alert(
        'Clock-out failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setClockingOut(false);
    }
  };

  const gpsReasonClockOutCopy = (
    reason: 'no_permission' | 'timeout' | 'hardware' | null
  ): string => {
    switch (reason) {
      case 'no_permission':
        return 'Location permission is off — your clock-out is recorded but not location-stamped. Turn on location in Settings to GPS-stamp future entries.';
      case 'timeout':
        return "Couldn't reach a satellite in time. Your clock-out is recorded but not location-stamped. The office can correct mileage from the admin site if needed.";
      default:
        return 'Your clock-out is recorded but not location-stamped. The office can correct mileage from the admin site if needed.';
    }
  };

  const onSubmitWeek = () => {
    // Submit is effectively irreversible from the surveyor's side —
    // once status flips to 'pending', the bookkeeper has to reject
    // (or use the dispute path) for the user to edit again. Confirm
    // before sending.
    Alert.alert(
      'Submit this week for approval?',
      'Open days in this week will be sent to the dispatcher. You won’t be able to edit them on mobile until they’re approved or rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: () => void doSubmitWeek(),
        },
      ]
    );
  };

  const doSubmitWeek = async () => {
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
        haptics.success();
        Alert.alert(
          'Submitted',
          `${result.flipped} day${result.flipped === 1 ? '' : 's'} sent to approval.`
        );
      }
    } catch (err) {
      logError('time.onSubmitWeek', 'submit failed', err);
      Alert.alert(
        'Submit failed',
        err instanceof Error ? err.message : String(err)
      );
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
      logError('time.onExportCsv', 'export failed', err, {
        days: days.length,
      });
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setExporting(false);
    }
  };

  // Tablet layout: clamp scroll content to a comfortable reading
  // width so cards don't span the full iPad screen. No-op on phones.
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  // Pull-to-refresh: feel-good gesture only. The live duration counter
  // updates every tick and PowerSync delivers timesheet changes
  // continuously, so this just confirms "I asked for fresh data".
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, tabletStyle]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.muted}
          />
        }
      >
        <ScreenHeader title="Time" />

        {active ? (
          <>
            {/* Stale clock-in detection: phone-died-overnight scenario.
                Anything past 16h is almost certainly a forgotten clock-
                out (typical work day caps at 14h with the F1 #7 prompt
                schedule). The user lands here on app re-open and sees
                a prominent "fix this" panel before the regular clocked-
                in card. */}
            {active.elapsedMs > 16 * 60 * 60 * 1000 ? (
              <View
                style={[
                  styles.staleBanner,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.danger,
                  },
                ]}
              >
                <Text style={[styles.staleBannerTitle, { color: palette.danger }]}>
                  Forgot to clock out?
                </Text>
                <Text style={[styles.staleBannerBody, { color: palette.text }]}>
                  You&apos;ve been clocked in for {formatDuration(active.elapsedMs)}
                  {active.entry.started_at
                    ? ` (since ${formatLocalTime(active.entry.started_at) ?? '—'})`
                    : ''}
                  . Clock out at the right time below — pay-rate
                  calculations use the timestamps on the row, so don&apos;t
                  let "now" become your clock-out time if you stopped
                  working hours ago.
                </Text>
                <View style={styles.staleBannerActions}>
                  <Button
                    variant="secondary"
                    label="Fix the time"
                    onPress={() => {
                      const id = active.entry.id;
                      if (!id) return;
                      router.push({
                        pathname: '/(tabs)/time/edit/[id]',
                        params: { id },
                      });
                    }}
                    accessibilityHint="Opens the time editor so you can set the correct clock-out time."
                  />
                </View>
              </View>
            ) : null}
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
                  ? ` · started ${formatLocalTime(active.entry.started_at) ?? '—'}`
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
          </>
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
            Stay-clocked-in prompts and GPS auto-suggest are on the
            roadmap.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatRangeLabel(range: { from: string; to: string }): string {
  return `${formatLocalShortDate(range.from)} – ${formatLocalShortDate(range.to)}`;
}

/** Pick min/max log_dates from the loaded days for the CSV filename. */
function computeRangeFromDays(
  days: { date: string }[]
): { from: string; to: string } {
  if (days.length === 0) {
    const today = todayLocalISODate();
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
  staleBanner: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 16,
  },
  staleBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  staleBannerBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  staleBannerActions: {
    marginTop: 4,
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
