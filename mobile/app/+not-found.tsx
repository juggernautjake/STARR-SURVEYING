import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * 404 fallback for unmatched routes. expo-router renders this any
 * time a deep link or in-app navigation hits a path that doesn't
 * resolve to a screen.
 */
export default function NotFoundScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <Text style={[styles.title, { color: palette.text }]}>This screen doesn&apos;t exist.</Text>
        <Link href="/jobs" style={[styles.link, { color: palette.accent }]}>
          Back to Jobs
        </Link>
      </View>
    </>
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
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  link: {
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
