import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Me-tab nested stack. Hosts the Me index + drilldowns:
 *   - uploads.tsx — stuck-uploads triage (failed photos / receipts that
 *                   never landed; surfaces the resilience safety net so
 *                   the user can see + retry + discard).
 */
export default function MeStackLayout() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="uploads" />
    </Stack>
  );
}
