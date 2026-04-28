/**
 * Receipt list row.
 *
 * Layout per plan §7.1 (glove-friendly minimum 60px tap target):
 *   ┌────────────────────────────────────────┐
 *   │  Vendor name              $42.18       │
 *   │  category · job · note    [status]     │
 *   └────────────────────────────────────────┘
 *
 * Status chips:
 *   - 'pending' (extraction queued/running): "AI working…"
 *   - 'pending' (extraction done):           "Pending review"
 *   - 'approved':                             "Approved"
 *   - 'rejected':                             "Rejected"
 *   - 'exported':                             "Exported"
 *
 * Tap navigates to the detail / edit screen (F2 #4). For F2 #2 the
 * onPress is wired but the destination is a placeholder; the row
 * still renders correctly as soon as the user has at least one
 * captured receipt.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryLabel } from './CategoryPicker';
import { type Palette, colors } from './theme';
import { formatCents } from './money';
import { formatLocalShortDate } from './timeFormat';
import type { Receipt } from './receipts';

interface ReceiptCardProps {
  receipt: Receipt;
  /** Display name for the linked job, when any. Resolved by the
   *  parent screen via useJob(receipt.job_id) — passing it down
   *  keeps the card pure (no useQuery per row). */
  jobName?: string | null;
  onPress: () => void;
}

export function ReceiptCard({ receipt, jobName, onPress }: ReceiptCardProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const vendor = receipt.vendor_name?.trim() || '(awaiting AI extraction)';
  const total = formatCents(receipt.total_cents);
  const dateLabel = formatLocalShortDate(
    (receipt.transaction_at ?? receipt.created_at ?? '').slice(0, 10)
  );

  const subtitleParts = [
    receipt.category ? categoryLabel(receipt.category) : null,
    jobName?.trim() || null,
    dateLabel || null,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');

  const status = statusInfo(receipt, palette);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open receipt from ${vendor}, ${total}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text
          style={[styles.vendor, { color: palette.text }]}
          numberOfLines={1}
        >
          {vendor}
        </Text>
        <Text style={[styles.total, { color: palette.text }]}>{total}</Text>
      </View>

      <View style={styles.footerRow}>
        <Text
          style={[styles.subtitle, { color: palette.muted }]}
          numberOfLines={1}
        >
          {subtitle || ' '}
        </Text>
        <View style={[styles.chip, { borderColor: status.color }]}>
          <Text style={[styles.chipText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

interface StatusInfoView {
  label: string;
  color: string;
}

function statusInfo(receipt: Receipt, palette: Palette): StatusInfoView {
  if (
    receipt.status === 'pending' &&
    (receipt.extraction_status === 'queued' ||
      receipt.extraction_status === 'running')
  ) {
    return { label: 'AI working…', color: palette.accent };
  }
  if (receipt.status === 'pending' && receipt.extraction_status === 'failed') {
    return { label: 'Needs your input', color: palette.danger };
  }
  // Possible-duplicate from the worker's dedup pass — prioritised
  // over the regular review badge so the user sees the bigger ask
  // first. Cleared once the user picks keep / discard.
  if (
    receipt.status === 'pending' &&
    receipt.dedup_match_id &&
    !receipt.dedup_decision
  ) {
    // Amber matches the detail-screen banner colour so visual
    // continuity tells the user "same thing you saw on the list."
    return { label: '⚠ Possible duplicate', color: '#92400E' };
  }
  // Extraction landed but the user hasn't confirmed yet — Batch Z
  // "review-before-save" badge.
  if (
    receipt.status === 'pending' &&
    receipt.extraction_status === 'done' &&
    !receipt.user_reviewed_at
  ) {
    return { label: '👀 Tap to review', color: palette.accent };
  }
  switch (receipt.status) {
    case 'pending':
      return { label: 'Pending review', color: palette.muted };
    case 'approved':
      return { label: 'Approved', color: palette.success };
    case 'rejected':
      return {
        label:
          receipt.dedup_decision === 'discard'
            ? 'Discarded as dup'
            : 'Rejected',
        color: palette.danger,
      };
    case 'exported':
      return { label: 'Exported', color: palette.muted };
    default:
      return { label: receipt.status ?? 'Unknown', color: palette.muted };
  }
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  vendor: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subtitle: {
    flex: 1,
    fontSize: 13,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
