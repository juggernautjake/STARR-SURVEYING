/**
 * ScreenHeader — shared header primitive for every mobile screen.
 *
 * Replaces the five different hand-rolled tab-index headers (Jobs,
 * Money, Time, Me, Gear) and the four different alignment
 * strategies used by detail-screen headers (heading + Cancel /
 * heading + Back). Locks the type scale, baseline alignment, hit
 * targets, and spacing to a single layout so adjacent rows snap
 * into place regardless of which screen they live on.
 *
 * Usage:
 *
 *   <ScreenHeader title="Jobs" subtitle={`${count}`} right={<SearchButton />} />
 *   <ScreenHeader back title="New Point" right={<CancelButton />} />
 *
 * The `back` shortcut renders a left-side chevron + label that
 * pops the navigation stack. For custom left content (e.g. an X
 * icon, a hamburger), pass `left={<X />}` instead.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

export interface ScreenHeaderProps {
  /** Page title. Title Case. Single line. */
  title: string;
  /** Optional short subtitle / count rendered to the right of the
   *  title at smaller weight. */
  subtitle?: string;
  /** When true, renders a `‹ Back` chevron on the left that calls
   *  `router.back()`. Overridden by `left` when both are set. */
  back?: boolean;
  /** Custom left-side slot. Use this for non-standard left
   *  affordances (close X, hamburger, etc.). */
  left?: ReactNode;
  /** Right-side action(s). Typically a single Pressable or a
   *  small icon row. */
  right?: ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  back,
  left,
  right,
}: ScreenHeaderProps) {
  const router = useRouter();
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const leftSlot =
    left ??
    (back ? (
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={({ pressed }) => [
          styles.backBtn,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.backText, { color: palette.accent }]}>
          ‹ Back
        </Text>
      </Pressable>
    ) : null);

  return (
    <View style={styles.row} accessibilityRole="header">
      {leftSlot ? <View style={styles.leftSlot}>{leftSlot}</View> : null}
      <View style={styles.titleBlock}>
        <Text
          style={[styles.title, { color: palette.text }]}
          numberOfLines={1}
          accessibilityRole="text"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: palette.muted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.rightSlot}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    minHeight: 56,
  },
  // Slots are zero-flex so the title block consumes the rest of
  // the row. Each child slot uses justify-content to keep its
  // content snapped to the right edge.
  leftSlot: {
    flexShrink: 0,
  },
  rightSlot: {
    flexShrink: 0,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Title + subtitle align baselines. flexShrink lets the title
  // truncate before crowding the right slot.
  titleBlock: {
    flexShrink: 1,
    flexGrow: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
