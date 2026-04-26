/**
 * Day-status chip shown next to each day in the timesheet.
 *
 * Sourced from daily_time_logs.status. The mobile + web enums share
 * the same column but historically diverged on labels — see the
 * DailyLogStatus union in lib/timesheet.ts for the full set.
 * Recognized values:
 *   open      — editable on mobile (default for mobile-created rows)
 *   pending   — submitted, awaiting admin review (web's primary state
 *               post-submit; mobile flips 'open' → 'pending' on
 *               submit-week so the existing admin queue surfaces it)
 *   submitted — legacy alias for 'pending'; rendered identically
 *   approved  — admin approved; mobile blocks edits
 *   rejected  — admin rejected; back to editable on mobile
 *   adjusted  — admin tweaked hours; locked for pay
 *   disputed  — surveyor disputed admin's decision; back in queue
 *   locked    — payroll has run; immutable, even server-side
 *
 * Unknown statuses render with the muted-label treatment so a
 * future server-side status doesn't crash the row.
 */
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { type Palette, colors } from './theme';

interface StatusInfo {
  label: string;
  fg: keyof Palette;
}

const STATUS_INFO: Record<string, StatusInfo> = {
  open: { label: 'Open', fg: 'muted' },
  pending: { label: 'Submitted', fg: 'accent' },
  submitted: { label: 'Submitted', fg: 'accent' },
  approved: { label: 'Approved', fg: 'success' },
  rejected: { label: 'Rejected', fg: 'danger' },
  adjusted: { label: 'Adjusted', fg: 'success' },
  disputed: { label: 'Disputed', fg: 'danger' },
  locked: { label: 'Locked', fg: 'muted' },
};

// Only locked statuses (per LOCKED_DAY_STATUSES) ever surface this
// banner — 'rejected' / 'disputed' are editable on mobile so they
// have no entry.
const LOCK_TITLES: Record<string, string> = {
  pending: 'Submitted for approval',
  submitted: 'Submitted for approval',
  approved: 'Approved',
  adjusted: 'Adjusted by admin',
  locked: 'Locked by payroll',
};

/**
 * Banner-style title shown on the edit screen when the day is no
 * longer editable. Returns 'Locked' for unknown values rather than
 * throwing or rendering an empty string.
 */
export function lockedDayTitle(status: string | null | undefined): string {
  return (status && LOCK_TITLES[status]) || 'Locked';
}

interface StatusChipProps {
  status: string | null | undefined;
  /** Hide the chip when the day is plain `open` (no chip is the
   *  default state — saves visual clutter). */
  hideWhenOpen?: boolean;
}

export function StatusChip({ status, hideWhenOpen = true }: StatusChipProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const key = status ?? 'open';
  if (hideWhenOpen && key === 'open') return null;

  const info = STATUS_INFO[key] ?? { label: key, fg: 'muted' as const };
  const color = palette[info.fg];

  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
