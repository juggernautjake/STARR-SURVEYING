import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

interface PlaceholderProps {
  title: string;
  caption: string;
  reference?: string;
}

/**
 * Phase F0 placeholder for unimplemented tab screens. Renders the
 * tab title, a one-line caption explaining when the feature lands,
 * and (optionally) the spec section that documents it.
 *
 * Removing the placeholder = implementing the feature. Search the
 * repo for `Placeholder` to see what's still stubbed.
 */
export function Placeholder({ title, caption, reference }: PlaceholderProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.caption, { color: palette.muted }]}>{caption}</Text>
      {reference ? (
        <Text style={[styles.ref, { color: palette.accent }]}>
          See STARR_FIELD_MOBILE_APP_PLAN.md {reference}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  caption: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  ref: {
    fontSize: 13,
    fontFamily: 'Menlo',
  },
});
