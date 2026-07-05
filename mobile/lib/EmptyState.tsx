/**
 * Shared empty / no-data state for lists + detail screens (S3e).
 *
 * Screens previously hand-rolled an inline `<View><Text>title</Text>
 * <Text>body</Text></View>` for "no jobs yet", "no receipts", etc., each
 * with its own local styles — so spacing, type scale, and color drifted
 * screen to screen. This centralizes that into one themed component:
 * optional glyph, a title, an optional message, and an optional action
 * button. (Distinct from `<Placeholder>`, which marks an entire
 * not-yet-built screen.)
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { controls, colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface EmptyStateProps {
  title: string;
  message?: string;
  /** Optional emoji/glyph shown above the title. */
  glyph?: string;
  /** Simple call-to-action button (rendered with the accent color). Use
   *  `children` instead when you need a specific shared <Button> variant. */
  action?: { label: string; onPress: () => void };
  /** Custom action node (e.g. an app <Button variant="secondary" />).
   *  Rendered in the action slot; takes precedence over `action`. */
  children?: ReactNode;
}

export function EmptyState({ title, message, glyph, action, children }: EmptyStateProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  return (
    <View style={styles.root} accessibilityRole="summary">
      {glyph ? <Text style={styles.glyph}>{glyph}</Text> : null}
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: palette.muted }]}>{message}</Text>
      ) : null}
      {children ? (
        <View style={styles.actionSlot}>{children}</View>
      ) : action ? (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: palette.accent }]}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  glyph: { fontSize: 40, marginBottom: 2 },
  actionSlot: { marginTop: 8, minWidth: 200 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
  action: {
    marginTop: 8,
    minHeight: controls.height,
    paddingHorizontal: controls.paddingHButton,
    borderRadius: controls.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
