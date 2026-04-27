import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Capture-tab nested stack — entry screen + per-point photo capture.
 *
 * The entry screen (index.tsx) creates the data point. After save,
 * the user lands on `[pointId]/photos.tsx` to attach photos / videos
 * / voice memos. F3 #3 replaces the current placeholder with the
 * real multi-photo capture flow.
 */
export default function CaptureStackLayout() {
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
      <Stack.Screen name="[pointId]/photos" />
      <Stack.Screen name="[pointId]/voice" />
    </Stack>
  );
}
