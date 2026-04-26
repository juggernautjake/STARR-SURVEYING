/**
 * Data-point list row.
 *
 * Layout — matches the JobCard / ReceiptCard pattern (glove-friendly
 * minHeight, two-row title + subtitle):
 *   ┌──────────────────────────────────────────────────┐
 *   │ [BM]  BM06                          [📷 3]       │
 *   │      Found 3/4" iron rod, 18" deep              │
 *   │      32.06441, -97.30912 · 12 min ago           │
 *   └──────────────────────────────────────────────────┘
 *
 * The prefix tag uses the 179-code library color so the surveyor
 * can scan a list and locate "the IR points" at a glance.
 *
 * `mediaCount` is optional — caller passes it in (the parent screen
 * batches one query per visible point). Falsy hides the badge.
 */
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { lookupPrefix } from './dataPointCodes';
import type { FieldDataPoint } from './dataPoints';
import { colors } from './theme';

interface PointCardProps {
  point: FieldDataPoint;
  /** Photo / media count for the badge — defaults to 0 (badge hidden). */
  mediaCount?: number;
  onPress: () => void;
}

export function PointCard({ point, mediaCount, onPress }: PointCardProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const prefixInfo = lookupPrefix(point.code_category);
  const hasGps = point.device_lat != null && point.device_lon != null;

  const subtitleParts: string[] = [];
  if (point.description?.trim()) subtitleParts.push(point.description.trim());
  const metaParts: string[] = [];
  if (hasGps) {
    metaParts.push(
      `${point.device_lat?.toFixed(5)}, ${point.device_lon?.toFixed(5)}`
    );
  }
  metaParts.push(formatRelative(point.created_at));
  if (point.is_offset) metaParts.push('offset');
  if (point.is_correction) metaParts.push('correction');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open point ${point.name}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View
          style={[styles.tag, { backgroundColor: prefixInfo.color }]}
        >
          <Text style={styles.tagText}>{point.code_category ?? '—'}</Text>
        </View>
        <Text
          style={[styles.name, { color: palette.text }]}
          numberOfLines={1}
        >
          {point.name}
        </Text>
        {mediaCount && mediaCount > 0 ? (
          <Text style={[styles.mediaCount, { color: palette.muted }]}>
            📷 {mediaCount}
          </Text>
        ) : null}
      </View>

      {subtitleParts.length > 0 ? (
        <Text
          style={[styles.subtitle, { color: palette.text }]}
          numberOfLines={2}
        >
          {subtitleParts.join(' · ')}
        </Text>
      ) : null}

      <Text
        style={[styles.meta, { color: palette.muted }]}
        numberOfLines={1}
      >
        {metaParts.join(' · ')}
      </Text>
    </Pressable>
  );
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  mediaCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    fontSize: 12,
  },
});
