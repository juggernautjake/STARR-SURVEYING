/**
 * Per-job "Today's captures" rollup card (Batch II).
 *
 * Surveyors arriving at a job in the truck want a one-glance
 * answer to "where am I on this job today?" — clock state, hours
 * logged, captures by type, receipts so far. Mobile mirror of the
 * web admin's `/admin/jobs/[id]/field` rollup.
 *
 * Data comes from `useJobTodayRollup(jobId)` — a single SQL query
 * against PowerSync's local SQLite that aggregates seven counts in
 * one round-trip. Reactive: the card updates as the surveyor
 * captures throughout the day.
 *
 * Hidden gracefully when nothing has been captured today (the card
 * only renders the "On the clock" badge so the surveyor still sees
 * their clock state without a wall of zeros).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { JobTodayRollup } from './jobs';
import { type Palette } from './theme';

interface JobTodayRollupCardProps {
  rollup: JobTodayRollup;
  palette: Palette;
  /** Optional tap handler for the "+ Capture" CTA. Caller wires
   *  this up to the capture flow with `jobId` pre-filled. */
  onCapture?: () => void;
  isLoading?: boolean;
}

export function JobTodayRollupCard({
  rollup,
  palette,
  onCapture,
  isLoading,
}: JobTodayRollupCardProps) {
  const totalCaptures =
    rollup.pointsToday +
    rollup.photosToday +
    rollup.videosToday +
    rollup.voiceToday +
    rollup.notesToday +
    rollup.filesToday +
    rollup.receiptsToday;
  const hasAnyActivity = totalCaptures > 0 || rollup.minutesToday > 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      accessibilityLabel={`Today on this job: ${formatRollupSummary(rollup)}`}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.todayLabel, { color: palette.muted }]}>
          Today {formatHumanDate(rollup.localDate)}
        </Text>
        {rollup.isClockedIn ? (
          <View style={[styles.statusPill, styles.statusPillOk]}>
            <Text style={styles.statusPillText}>🟢 Clocked in</Text>
          </View>
        ) : (
          <View
            style={[
              styles.statusPill,
              { backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.statusPillTextNeutral, { color: palette.muted }]}>
              ⚪ Off the clock
            </Text>
          </View>
        )}
      </View>

      {/* Big primary number — minutes worked. Drives at-a-glance
          orientation: "I'm two hours in / I haven't started yet". */}
      <View style={styles.primaryBlock}>
        <Text style={[styles.primaryValue, { color: palette.text }]}>
          {formatHoursMinutes(rollup.minutesToday)}
        </Text>
        <Text style={[styles.primaryLabel, { color: palette.muted }]}>
          worked on this job today
        </Text>
      </View>

      {/* Capture grid — six tiles. Zero-counts render in muted so a
          fresh-morning card reads "fresh start" without looking
          empty/broken. */}
      <View style={styles.grid}>
        <Stat
          glyph="📍"
          label={rollup.pointsToday === 1 ? 'point' : 'points'}
          value={rollup.pointsToday}
          palette={palette}
        />
        <Stat
          glyph="📷"
          label={rollup.photosToday === 1 ? 'photo' : 'photos'}
          value={rollup.photosToday}
          palette={palette}
        />
        <Stat
          glyph="🎬"
          label={rollup.videosToday === 1 ? 'video' : 'videos'}
          value={rollup.videosToday}
          palette={palette}
        />
        <Stat
          glyph="🎙"
          label={rollup.voiceToday === 1 ? 'memo' : 'memos'}
          value={rollup.voiceToday}
          palette={palette}
        />
        <Stat
          glyph="📝"
          label={rollup.notesToday === 1 ? 'note' : 'notes'}
          value={rollup.notesToday}
          palette={palette}
        />
        <Stat
          glyph="📎"
          label={rollup.filesToday === 1 ? 'file' : 'files'}
          value={rollup.filesToday}
          palette={palette}
        />
      </View>

      {rollup.receiptsToday > 0 ? (
        <View
          style={[
            styles.receiptStrip,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
          accessibilityLabel={`${rollup.receiptsToday} receipts totalling ${formatCents(rollup.receiptsTotalCents)}`}
        >
          <Text style={[styles.receiptGlyph, { color: palette.text }]}>
            🧾
          </Text>
          <Text style={[styles.receiptText, { color: palette.text }]}>
            {rollup.receiptsToday}{' '}
            {rollup.receiptsToday === 1 ? 'receipt' : 'receipts'} ·{' '}
            {formatCents(rollup.receiptsTotalCents)}
          </Text>
        </View>
      ) : null}

      {!hasAnyActivity && !isLoading ? (
        <Text style={[styles.emptyHint, { color: palette.muted }]}>
          Nothing captured yet today. Tap{' '}
          <Text style={{ color: palette.accent, fontWeight: '600' }}>
            + Point
          </Text>{' '}
          above to start a capture, or clock in from the Time tab.
        </Text>
      ) : null}

      {onCapture ? (
        <Pressable
          onPress={onCapture}
          accessibilityRole="button"
          accessibilityLabel="Capture a new data point on this job"
          style={({ pressed }) => [
            styles.captureBtn,
            {
              backgroundColor: palette.accent,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={styles.captureBtnText}>+ Capture</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface StatProps {
  glyph: string;
  label: string;
  value: number;
  palette: Palette;
}

function Stat({ glyph, label, value, palette }: StatProps) {
  const isZero = value === 0;
  return (
    <View
      style={[
        styles.statTile,
        {
          backgroundColor: 'transparent',
          opacity: isZero ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[styles.statGlyph, { color: palette.text }]}>{glyph}</Text>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

function formatHumanDate(yyyyMmDd: string): string {
  const t = Date.parse(`${yyyyMmDd}T00:00:00`);
  if (!Number.isFinite(t)) return yyyyMmDd;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatHoursMinutes(minutes: number): string {
  if (minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRollupSummary(r: JobTodayRollup): string {
  const parts = [
    `${formatHoursMinutes(r.minutesToday)} worked`,
    r.pointsToday > 0 ? `${r.pointsToday} points` : null,
    r.photosToday > 0 ? `${r.photosToday} photos` : null,
    r.videosToday > 0 ? `${r.videosToday} videos` : null,
    r.voiceToday > 0 ? `${r.voiceToday} voice memos` : null,
    r.notesToday > 0 ? `${r.notesToday} notes` : null,
    r.filesToday > 0 ? `${r.filesToday} files` : null,
    r.receiptsToday > 0
      ? `${r.receiptsToday} receipts ${formatCents(r.receiptsTotalCents)}`
      : null,
  ].filter(Boolean);
  return parts.join(', ') || 'no activity yet';
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillOk: {
    backgroundColor: '#D1FAE5',
  },
  statusPillText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  statusPillTextNeutral: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBlock: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  primaryValue: {
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 40,
  },
  primaryLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  statTile: {
    flexBasis: '32%',
    minWidth: 90,
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  statGlyph: {
    fontSize: 20,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  receiptStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  receiptGlyph: {
    fontSize: 16,
  },
  receiptText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'italic',
  },
  captureBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  captureBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
