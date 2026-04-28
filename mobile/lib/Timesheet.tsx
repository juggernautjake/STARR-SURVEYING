/**
 * Timesheet visual — day-grouped list of past time entries.
 *
 * Layout per plan §5.8.6:
 *   Day header (date + total)
 *     Entry: job/category · started→ended · duration
 *     Entry: ...
 *   Day header
 *     ...
 *
 * Read-only at F1 #5; tapping an entry is a no-op for now. F1 #6
 * adds the manual-edit screen with audit trail; an entry tap will
 * navigate there.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusChip } from './StatusChip';
import { entryTypeLabel } from './timeTracking';
import {
  durationMinutesBetween,
  formatDuration,
  formatLocalTime,
  formatRelativeDay,
} from './timeFormat';
import type { TimesheetDay, TimesheetEntry } from './timesheet';
import { type Palette, colors } from './theme';

interface TimesheetProps {
  days: TimesheetDay[];
  /** Called when a row is tapped — pushed by the parent screen. */
  onPressEntry?: (entry: TimesheetEntry) => void;
}

export function Timesheet({ days, onPressEntry }: TimesheetProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  if (days.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>
          No history yet
        </Text>
        <Text style={[styles.emptyBody, { color: palette.muted }]}>
          Clock-in entries from the last 14 days appear here, grouped by day
          with daily totals.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {days.map((day) => (
        <DayBlock
          key={day.date}
          day={day}
          palette={palette}
          onPressEntry={onPressEntry}
        />
      ))}
    </View>
  );
}

interface DayBlockProps {
  day: TimesheetDay;
  palette: Palette;
  onPressEntry?: (entry: TimesheetEntry) => void;
}

function DayBlock({ day, palette, onPressEntry }: DayBlockProps) {
  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <View style={styles.dayHeaderLeft}>
          <Text style={[styles.dayDate, { color: palette.text }]}>
            {formatRelativeDay(day.date)}
          </Text>
          <StatusChip status={day.status} />
        </View>
        <Text style={[styles.dayTotal, { color: palette.muted }]}>
          {day.hasOpenEntry ? '· in progress · ' : ''}
          {formatDayTotal(day.totalMinutes)}
        </Text>
      </View>

      <View style={[styles.entryList, { borderColor: palette.border }]}>
        {day.entries.map((entry, idx) => {
          const inner = (
            <View style={styles.entryInner}>
              <View style={styles.entryMain}>
                <Text
                  style={[styles.entryTitle, { color: palette.text }]}
                  numberOfLines={1}
                >
                  {entry.jobName ?? entryTypeLabel(entry.entryType)}
                </Text>
                <Text
                  style={[styles.entrySubtitle, { color: palette.muted }]}
                  numberOfLines={1}
                >
                  {composeRange(entry.startedAt, entry.endedAt)}
                  {entry.jobName && entry.entryType
                    ? ` · ${entryTypeLabel(entry.entryType)}`
                    : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.entryDuration,
                  { color: entry.endedAt ? palette.text : palette.accent },
                ]}
              >
                {formatEntryDuration(entry)}
              </Text>
            </View>
          );

          const rowStyle = [
            styles.entryRow,
            idx > 0 && {
              borderTopColor: palette.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ];

          // When onPressEntry is wired, render as Pressable; otherwise
          // a plain View (no surprise tap targets).
          if (onPressEntry) {
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${entry.jobName ?? entryTypeLabel(entry.entryType)}`}
                onPress={() => onPressEntry(entry)}
                style={({ pressed }) => [
                  ...rowStyle,
                  pressed ? { backgroundColor: palette.border } : null,
                ]}
              >
                {inner}
              </Pressable>
            );
          }
          return (
            <View key={entry.id} style={rowStyle}>
              {inner}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatDayTotal(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  return formatDuration(totalMinutes * 60_000);
}

function formatEntryDuration(entry: TimesheetEntry): string {
  if (!entry.endedAt) return 'open';
  if (entry.durationMinutes != null) {
    return formatDuration(entry.durationMinutes * 60_000);
  }
  const fallback = durationMinutesBetween(entry.startedAt, entry.endedAt);
  return fallback != null ? formatDuration(fallback * 60_000) : '—';
}

function composeRange(
  startedAt: string | null,
  endedAt: string | null
): string {
  const start = formatLocalTime(startedAt);
  const end = endedAt ? formatLocalTime(endedAt) : 'now';
  if (!start) return end ?? '';
  return `${start} → ${end}`;
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  day: {
    gap: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '700',
  },
  dayTotal: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  entryList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  entryRow: {
    minHeight: 60,
  },
  entryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  entryMain: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  entrySubtitle: {
    fontSize: 12,
  },
  entryDuration: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    paddingVertical: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
