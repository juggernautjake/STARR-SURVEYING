/**
 * "What's in my truck right now" Me-tab section.
 *
 * Phase F10.8 — §5.12.9.1. Shows every active check-out
 * (state='checked_out' AND checked_out_to_user = me) so the
 * surveyor has a one-tap answer to "what gear do I owe back?"
 * without leaving the Me tab. Sister card to the per-job
 * loadout preview — same data, cross-job filter.
 *
 * Hides itself entirely when nothing is out — no zero-state
 * placeholder cluttering the Me tab for surveyors who haven&apos;t
 * checked out anything today.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyCheckoutsSummary } from './equipment';
import { type Palette } from './theme';

interface MyTruckSectionProps {
  summary: MyCheckoutsSummary;
  palette: Palette;
}

export function MyTruckSection({ summary, palette }: MyTruckSectionProps) {
  if (summary.total === 0) return null;
  const nowMs = Date.now();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>
        🛻 What&apos;s in my truck
      </Text>

      <View style={styles.summaryRow}>
        <Text style={[styles.summaryCount, { color: palette.text }]}>
          {summary.total} item{summary.total === 1 ? '' : 's'} out
        </Text>
        {summary.overdueCount > 0 ? (
          <View style={[styles.summaryBadge, styles.summaryBadgeRed]}>
            <Text style={styles.summaryBadgeRedText}>
              {summary.overdueCount} overdue
            </Text>
          </View>
        ) : null}
        {summary.calibrationOverdueCount > 0 ? (
          <View style={[styles.summaryBadge, styles.summaryBadgeAmber]}>
            <Text style={styles.summaryBadgeAmberText}>
              {summary.calibrationOverdueCount} cal lapsed
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.list}>
        {summary.items.slice(0, 8).map((item) => {
          const reservedToMs = Date.parse(item.reserved_to);
          const isOverdue =
            Number.isFinite(reservedToMs) && reservedToMs < nowMs;
          const calMs = item.next_calibration_due_at
            ? Date.parse(item.next_calibration_due_at)
            : NaN;
          const isCalLapsed =
            Number.isFinite(calMs) && calMs < nowMs;
          return (
            <Pressable
              key={item.reservation_id}
              onPress={() => {
                router.push({
                  pathname: '/(tabs)/jobs/[id]',
                  params: { id: item.job_id },
                });
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
                isOverdue ? styles.rowOverdue : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.equipment_name ?? 'Equipment'} for job ${item.job_name ?? item.job_id}, due ${formatDate(item.reserved_to)}`}
            >
              <View style={styles.rowMain}>
                <Text
                  style={[styles.rowName, { color: palette.text }]}
                  numberOfLines={1}
                >
                  {item.equipment_name ?? '(no name)'}
                </Text>
                <Text
                  style={[styles.rowMeta, { color: palette.muted }]}
                  numberOfLines={1}
                >
                  {item.job_number
                    ? `${item.job_number} · `
                    : ''}
                  {item.job_name ?? '(no job)'}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text
                  style={[
                    styles.rowDate,
                    {
                      color: isOverdue ? '#B91C1C' : palette.muted,
                      fontWeight: isOverdue ? '700' : '500',
                    },
                  ]}
                >
                  {isOverdue ? 'overdue' : `due ${formatRelativeDate(item.reserved_to, nowMs)}`}
                </Text>
                {isCalLapsed ? (
                  <Text style={styles.rowCalChip}>cal lapsed</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {summary.items.length > 8 ? (
          <Text style={[styles.overflowHint, { color: palette.muted }]}>
            +{summary.items.length - 8} more — check the cage app for
            the full list.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeDate(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const deltaHours = (t - nowMs) / (1000 * 60 * 60);
  if (deltaHours < 24) {
    if (deltaHours < 1) return 'soon';
    return `in ${Math.round(deltaHours)}h`;
  }
  if (deltaHours < 24 * 2) return 'tomorrow';
  if (deltaHours < 24 * 7) return `in ${Math.round(deltaHours / 24)}d`;
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  summaryCount: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  summaryBadgeRed: { backgroundColor: '#FEE2E2' },
  summaryBadgeRedText: {
    color: '#7F1D1D',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryBadgeAmber: { backgroundColor: '#FEF3C7' },
  summaryBadgeAmberText: {
    color: '#78350F',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: '#B91C1C',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowDate: {
    fontSize: 12,
  },
  rowCalChip: {
    color: '#78350F',
    backgroundColor: '#FEF3C7',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  overflowHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
