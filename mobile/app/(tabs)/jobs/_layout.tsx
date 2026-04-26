import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Jobs-tab nested stack. Lets the list (`index.tsx`) push the
 * detail screen (`[id].tsx`) without leaving the tab. The tab bar
 * stays visible the whole time so the user can bail to Time / $
 * etc. from any depth.
 *
 * Headers are off by default (each screen draws its own headline)
 * to keep visual hierarchy under the tab's control.
 */
export default function JobsStackLayout() {
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
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
