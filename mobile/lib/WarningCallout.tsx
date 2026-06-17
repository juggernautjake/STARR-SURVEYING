/**
 * mobile-and-customer-query-gap Slice S3 — shared "amber heads-up"
 * callout used by the receipt screens (and any future screen that
 * needs a friendly "we noticed a thing; here's context" banner).
 *
 * Replaces three hard-coded inline color literals
 * (#FEF3C7 / #D97706 / #92400E) across two screens that used to
 * carry their own copy of the warning palette. The colors now come
 * from `palette.warningCallout` so the same callout reads correctly
 * in light / dark / sun mode.
 *
 * Body text inherits the active palette's `text` color (white in
 * dark, deepest near-black in sun) so the body always stays legible
 * even when the title fights for brand attention.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

export interface WarningCalloutProps {
  /** Short, attention-grabbing title (typically with an emoji
   *  prefix — "🧾 Forget a receipt?"). */
  title: string;
  /** Longer body explaining the heads-up. Renders as a single text
   *  block; for multi-paragraph callers pass `\n\n`. */
  body: string;
  /** Optional testID for source-locking / e2e. */
  testID?: string;
}

export default function WarningCallout({ title, body, testID }: WarningCalloutProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  return (
    <View
      testID={testID ?? 'warning-callout'}
      style={[
        styles.container,
        {
          backgroundColor: palette.warningCallout.background,
          borderColor: palette.warningCallout.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: palette.warningCallout.title }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: palette.text }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
});
