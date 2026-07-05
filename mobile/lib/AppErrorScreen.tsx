/**
 * App-level crash fallback.
 *
 * Rendered by the root `ErrorBoundary` export in `app/_layout.tsx` (an
 * expo-router convention) whenever a render throws anywhere in the tree.
 * Without this, a single component error white-screens the whole app with
 * no way out; with it, the surveyor sees a friendly message and a Retry
 * button that re-mounts the failed segment.
 *
 * Deliberately self-contained: it uses NO theme hooks or providers, because
 * the very thing that crashed might be a provider. Colors are the brand
 * navy + white (the same documented "pre/failed-provider literal" exception
 * the accept-invite splash uses — see mobile/STYLES_AUDIT.md), so it renders
 * correctly even if ThemePreferenceProvider is the thing that failed.
 */
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { logError } from './log';
import { brand } from './theme';

interface Props {
  error: Error;
  /** Provided by expo-router — re-renders (retries) the failed segment. */
  retry: () => void;
}

export function AppErrorScreen({ error, retry }: Props) {
  // Report once per mount so the office sees the crash in Sentry / the
  // error log even though the surveyor only sees the friendly copy.
  logError('app.errorBoundary', 'render crash caught by root boundary', error);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.glyph}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your saved work is safe on this
          device. Tap below to reload — if it keeps happening, close and
          reopen the app, and let the office know.
        </Text>
        {__DEV__ ? (
          <Text style={styles.detail} numberOfLines={6}>
            {error?.message ?? String(error)}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.button}
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Reload the app"
        >
          <Text style={styles.buttonText}>Reload</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.navyDeep },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  glyph: { fontSize: 48 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: {
    color: '#C7D0F0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
  detail: {
    color: '#8FA0D8',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 4,
  },
  button: {
    marginTop: 12,
    backgroundColor: brand.navy,
    minHeight: 56,
    paddingHorizontal: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
