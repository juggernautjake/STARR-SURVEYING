/**
 * Per-job receipts rollup card — F2 #6.
 *
 * Shown on the mobile job detail screen. Surfaces the total spend
 * across non-rejected receipts and a category breakdown so the crew
 * can answer "how much have we spent on this job so far?" without
 * leaving the screen. F1 #3 / F1 polish wires the full Expenses
 * sub-tab; this card is the lightweight summary above it.
 */
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { categoryLabel } from './CategoryPicker';
import { formatCents } from './money';
import type { JobReceiptRollup } from './receipts';
import { type Palette, colors } from './theme';

interface ReceiptRollupCardProps {
  rollup: JobReceiptRollup;
  isLoading?: boolean;
  /** Called when the user taps the card — typically routes to the
   *  Money tab pre-filtered by this job (left as a future hook). */
  onPress?: () => void;
}

export function ReceiptRollupCard({ rollup, isLoading, onPress }: ReceiptRollupCardProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  if (isLoading && rollup.count === 0) {
    return (
      <View style={[styles.card, paletteCard(palette)]}>
        <Text style={[styles.label, { color: palette.muted }]}>Expenses</Text>
        <Text style={[styles.loading, { color: palette.muted }]}>Loading…</Text>
      </View>
    );
  }

  const Body = (
    <View style={[styles.card, paletteCard(palette)]}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: palette.muted }]}>Expenses</Text>
        <Text style={[styles.count, { color: palette.muted }]}>
          {rollup.count} {rollup.count === 1 ? 'receipt' : 'receipts'}
        </Text>
      </View>

      <Text style={[styles.total, { color: palette.text }]}>
        {formatCents(rollup.totalCents)}
      </Text>

      {rollup.byCategory.length === 0 ? (
        <Text style={[styles.empty, { color: palette.muted }]}>
          No receipts logged on this job yet. Snap one from the Money tab.
        </Text>
      ) : (
        <View style={styles.breakdown}>
          {rollup.byCategory.map((b) => (
            <View key={b.category} style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: palette.text }]}>
                {b.category === 'uncategorized'
                  ? 'Uncategorized'
                  : categoryLabel(b.category)}
              </Text>
              <Text style={[styles.breakdownCount, { color: palette.muted }]}>
                ×{b.count}
              </Text>
              <Text style={[styles.breakdownAmount, { color: palette.text }]}>
                {formatCents(b.cents)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  if (!onPress) return Body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Expenses ${formatCents(rollup.totalCents)} across ${rollup.count} receipts`}
    >
      {Body}
    </Pressable>
  );
}

function paletteCard(palette: Palette) {
  return {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  count: {
    fontSize: 12,
  },
  total: {
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  loading: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  breakdown: {
    marginTop: 4,
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
