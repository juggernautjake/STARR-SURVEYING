/**
 * Per-job equipment loadout preview card.
 *
 * Phase F10.8 — §5.12.9.1. Surveyors arriving at a job (or the
 * cage in the morning) want a one-glance answer to "what gear am
 * I taking out?" — name + state badge + calibration pill, with a
 * "yours" badge on rows checked out to them specifically. Mobile
 * mirror of the web admin's loadout panel.
 *
 * Data comes from `useJobLoadout(jobId, myUserId)` — a single
 * SQL query against PowerSync's local SQLite that JOINs
 * equipment_reservations to equipment_inventory in one round-trip.
 * Reactive: the card updates as the EM / dispatcher reserves /
 * cancels equipment.
 *
 * Hidden gracefully when the job has zero active reservations
 * (no card rendered at all — surveyors don't need a "no gear yet"
 * placeholder cluttering the detail screen).
 */
import { StyleSheet, Text, View } from 'react-native';

import type { JobLoadoutItem, JobLoadoutSummary } from './equipment';
import { type Palette } from './theme';

interface JobLoadoutCardProps {
  loadout: JobLoadoutSummary;
  palette: Palette;
  isLoading?: boolean;
}

export function JobLoadoutCard({
  loadout,
  palette,
  isLoading,
}: JobLoadoutCardProps) {
  if (loadout.total === 0 && !isLoading) {
    return null;
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      accessibilityLabel={`Loadout: ${loadout.total} item${loadout.total === 1 ? '' : 's'} reserved, ${loadout.myCount} yours.`}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.muted }]}>
          Loadout
        </Text>
        <Text style={[styles.headerCount, { color: palette.text }]}>
          {loadout.total} item{loadout.total === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <SummaryStat
          label="yours"
          value={loadout.myCount}
          palette={palette}
          highlight={loadout.myCount > 0}
        />
        <SummaryStat
          label="held"
          value={loadout.heldCount}
          palette={palette}
        />
        <SummaryStat
          label="checked out"
          value={loadout.checkedOutCount}
          palette={palette}
        />
      </View>

      {loadout.calibrationOverdueCount > 0 ? (
        <View style={[styles.banner, styles.bannerRed]}>
          <Text style={styles.bannerText}>
            ⚠ {loadout.calibrationOverdueCount} cert
            {loadout.calibrationOverdueCount === 1 ? '' : 's'} overdue —
            don&apos;t roll out without re-cert
          </Text>
        </View>
      ) : null}

      {loadout.calibrationDueSoonCount > 0 ? (
        <View style={[styles.banner, styles.bannerAmber]}>
          <Text style={[styles.bannerText, styles.bannerTextAmber]}>
            🛠 {loadout.calibrationDueSoonCount} cert
            {loadout.calibrationDueSoonCount === 1 ? '' : 's'} due within
            7d — schedule recal
          </Text>
        </View>
      ) : null}

      {loadout.overrideCount > 0 ? (
        <View style={[styles.banner, styles.bannerBlue]}>
          <Text style={[styles.bannerText, styles.bannerTextBlue]}>
            ▴ {loadout.overrideCount} override
            {loadout.overrideCount === 1 ? '' : 's'} — EM bypassed an
            availability conflict
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {loadout.items.slice(0, 8).map((item) => (
          <LoadoutRow
            key={item.reservation_id}
            item={item}
            palette={palette}
          />
        ))}
        {loadout.items.length > 8 ? (
          <Text style={[styles.overflowHint, { color: palette.muted }]}>
            +{loadout.items.length - 8} more — open the admin loadout
            page for the full list.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface SummaryStatProps {
  label: string;
  value: number;
  palette: Palette;
  highlight?: boolean;
}

function SummaryStat({
  label,
  value,
  palette,
  highlight,
}: SummaryStatProps) {
  return (
    <View style={styles.summaryStat}>
      <Text
        style={[
          styles.summaryStatValue,
          {
            color: highlight ? '#047857' : palette.text,
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.summaryStatLabel, { color: palette.muted }]}>
        {label}
      </Text>
    </View>
  );
}

interface LoadoutRowProps {
  item: JobLoadoutItem;
  palette: Palette;
}

function LoadoutRow({ item, palette }: LoadoutRowProps) {
  const calStatus = computeCalibrationStatus(item.next_calibration_due_at);
  return (
    <View
      style={[
        styles.row,
        { borderColor: palette.border },
        item.is_mine === 1 ? styles.rowMine : null,
      ]}
    >
      <View style={styles.rowMain}>
        <Text
          style={[styles.rowName, { color: palette.text }]}
          numberOfLines={1}
        >
          {item.equipment_name ?? '(no name)'}
        </Text>
        {item.equipment_qr_code_id ? (
          <Text
            style={[styles.rowMeta, { color: palette.muted }]}
            numberOfLines={1}
          >
            {item.equipment_qr_code_id}
            {item.equipment_category ? ` · ${item.equipment_category}` : ''}
          </Text>
        ) : item.equipment_category ? (
          <Text
            style={[styles.rowMeta, { color: palette.muted }]}
            numberOfLines={1}
          >
            {item.equipment_category}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowChips}>
        {item.is_mine === 1 ? (
          <View style={[styles.chip, styles.chipMine]}>
            <Text style={styles.chipMineText}>yours</Text>
          </View>
        ) : null}
        <View style={stateChipStyle(item.state)}>
          <Text style={stateChipTextStyle(item.state)}>
            {item.state.replace(/_/g, ' ')}
          </Text>
        </View>
        {calStatus !== 'ok' ? (
          <View
            style={[
              styles.chip,
              calStatus === 'overdue'
                ? styles.chipCalOverdue
                : styles.chipCalSoon,
            ]}
          >
            <Text
              style={
                calStatus === 'overdue'
                  ? styles.chipCalOverdueText
                  : styles.chipCalSoonText
              }
            >
              {calStatus === 'overdue' ? 'cal lapsed' : 'cal due'}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function computeCalibrationStatus(
  nextDueIso: string | null
): 'ok' | 'soon' | 'overdue' {
  if (!nextDueIso) return 'ok';
  const dueMs = Date.parse(nextDueIso);
  if (!Number.isFinite(dueMs)) return 'ok';
  const nowMs = Date.now();
  if (dueMs < nowMs) return 'overdue';
  if (dueMs - nowMs <= 7 * 24 * 60 * 60 * 1000) return 'soon';
  return 'ok';
}

function stateChipStyle(state: string) {
  switch (state) {
    case 'held':
      return [styles.chip, styles.chipHeld];
    case 'checked_out':
      return [styles.chip, styles.chipCheckedOut];
    case 'in_transit':
      return [styles.chip, styles.chipInTransit];
    default:
      return [styles.chip, styles.chipNeutral];
  }
}

function stateChipTextStyle(state: string) {
  switch (state) {
    case 'held':
      return styles.chipHeldText;
    case 'checked_out':
      return styles.chipCheckedOutText;
    case 'in_transit':
      return styles.chipInTransitText;
    default:
      return styles.chipNeutralText;
  }
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
    alignItems: 'baseline',
    marginBottom: 10,
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryStat: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  summaryStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  bannerRed: { backgroundColor: '#FEE2E2' },
  bannerAmber: { backgroundColor: '#FEF3C7' },
  bannerBlue: { backgroundColor: '#DBEAFE' },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F1D1D',
  },
  bannerTextAmber: { color: '#78350F' },
  bannerTextBlue: { color: '#1E3A8A' },
  list: {
    marginTop: 4,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowMine: {
    borderLeftWidth: 3,
    borderLeftColor: '#15803D',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  rowChips: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '50%',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipMine: { backgroundColor: '#DCFCE7' },
  chipMineText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipHeld: { backgroundColor: '#DBEAFE' },
  chipHeldText: {
    color: '#1E3A8A',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipCheckedOut: { backgroundColor: '#1D3095' },
  chipCheckedOutText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipInTransit: { backgroundColor: '#FEF3C7' },
  chipInTransitText: {
    color: '#78350F',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipNeutral: { backgroundColor: '#F3F4F6' },
  chipNeutralText: {
    color: '#374151',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipCalOverdue: { backgroundColor: '#FEE2E2' },
  chipCalOverdueText: {
    color: '#7F1D1D',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipCalSoon: { backgroundColor: '#FEF3C7' },
  chipCalSoonText: {
    color: '#78350F',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  overflowHint: {
    fontSize: 11,
    fontStyle: 'italic',
    paddingHorizontal: 4,
    marginTop: 4,
  },
});
