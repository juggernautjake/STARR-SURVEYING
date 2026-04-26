import { router, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { useReceipt, useReceiptPhotoUrl } from '@/lib/receipts';
import { formatCents } from '@/lib/money';
import { colors } from '@/lib/theme';

/**
 * Receipt detail — F2 #2 ships a read-only preview so the user can
 * verify their photo uploaded and see extraction state. F2 #4 replaces
 * this with a full edit form (vendor, totals, category, tax flag,
 * notes, line items).
 */
export default function ReceiptDetailScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { id } = useLocalSearchParams<{ id: string }>();
  const { receipt, isLoading } = useReceipt(id);
  const photoUrl = useReceiptPhotoUrl(receipt);

  if (isLoading) return <LoadingSplash />;

  if (!receipt) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Receipt not found
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            This receipt may have been deleted, or hasn&apos;t synced to this
            device yet.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.heading, { color: palette.text }]}
            numberOfLines={2}
          >
            {receipt.vendor_name?.trim() || 'Receipt'}
          </Text>
          <Text style={[styles.total, { color: palette.text }]}>
            {formatCents(receipt.total_cents)}
          </Text>
        </View>

        <Text style={[styles.subtitle, { color: palette.muted }]}>
          {receipt.extraction_status === 'queued' ||
          receipt.extraction_status === 'running'
            ? 'AI extraction is running — vendor, total, and category land here when it finishes.'
            : receipt.extraction_status === 'failed'
              ? 'AI extraction failed. Edit the fields manually below (F2 #4).'
              : 'Captured. Edit form lands in F2 #4.'}
        </Text>

        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={[styles.photo, { borderColor: palette.border }]}
            resizeMode="contain"
            accessibilityLabel="Receipt photo"
          />
        ) : (
          <View
            style={[
              styles.photoPlaceholder,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.photoPlaceholderText, { color: palette.muted }]}>
              Loading photo…
            </Text>
          </View>
        )}

        <View style={styles.backButton}>
          <Button
            variant="secondary"
            label="Back to receipts"
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  heading: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  total: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    marginTop: 24,
  },
});
