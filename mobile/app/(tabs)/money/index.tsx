import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { ReceiptCard } from '@/lib/ReceiptCard';
import { useReceipts, type Receipt } from '@/lib/receipts';
import {
  tabletContainerStyle,
  useResponsiveLayout,
} from '@/lib/responsive';
import { colors } from '@/lib/theme';

/**
 * Money tab — F2 #2 ships the list shell.
 *
 * Reverse-chrono receipts list. Tapping the "+ Add receipt" button
 * pushes the capture modal (camera + crop + upload). Tapping a row
 * navigates to the detail / edit screen (F2 #4) — for F2 #2 the
 * route exists but the screen is a placeholder; tap doesn't crash.
 *
 * Per-job + per-period rollups land in F2 #8; CSV export in F2 #9.
 */
export default function MoneyScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { receipts, isLoading } = useReceipts();
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  if (isLoading && receipts.length === 0) return <LoadingSplash />;

  const onAddReceipt = () => router.push('/(tabs)/money/capture');

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, tabletStyle]}>
        <Text style={[styles.heading, { color: palette.text }]}>Receipts</Text>
        <Text style={[styles.count, { color: palette.muted }]}>
          {receipts.length}
        </Text>
      </View>

      {receipts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            No receipts yet
          </Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Snap your first receipt — Starr Field auto-extracts the vendor,
            total, and category so you don&apos;t have to retype anything.
          </Text>
          <View style={styles.emptyButton}>
            <Button
              label="+ Add receipt"
              onPress={onAddReceipt}
              accessibilityHint="Opens the camera to capture a new receipt"
            />
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={receipts}
            keyExtractor={keyForReceipt}
            renderItem={({ item }) => (
              <ReceiptCard
                receipt={item}
                onPress={() => router.push(`/(tabs)/money/${item.id}`)}
              />
            )}
            contentContainerStyle={[styles.listContent, tabletStyle]}
            showsVerticalScrollIndicator={false}
          />
          <View
            style={[
              styles.fabBar,
              { backgroundColor: palette.surface, borderTopColor: palette.border },
            ]}
          >
            <Button
              label="+ Add receipt"
              onPress={onAddReceipt}
              accessibilityHint="Opens the camera to capture a new receipt"
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function keyForReceipt(receipt: Receipt): string {
  return receipt.id ?? '';
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
  },
  count: {
    fontSize: 15,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    width: '100%',
    maxWidth: 320,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  fabBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
});
