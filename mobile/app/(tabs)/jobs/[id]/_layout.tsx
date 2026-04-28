import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Per-job nested stack — job detail at /, per-point detail at
 * /points/{pointId}. F3 #4 + later phases (notes, files, expenses
 * sub-tabs) extend this.
 */
export default function JobStackLayout() {
  const scheme = useResolvedScheme();
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
      <Stack.Screen name="points/[pointId]" />
      <Stack.Screen name="notes/new" />
      <Stack.Screen name="files/[fileId]/preview" />
    </Stack>
  );
}
