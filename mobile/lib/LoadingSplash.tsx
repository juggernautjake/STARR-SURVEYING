import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

import { colors } from './theme';

/**
 * Full-screen spinner used while the AuthProvider resolves its initial
 * session check from AsyncStorage. Kept extremely simple — Phase F0 #5
 * adds a real splash with the Starr logo via expo-splash-screen.
 */
export function LoadingSplash() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ActivityIndicator color={palette.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
