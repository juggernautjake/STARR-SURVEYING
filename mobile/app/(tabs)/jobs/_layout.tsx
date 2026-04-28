import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

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
      <Stack.Screen name="[id]" />
      <Stack.Screen
        name="search"
        options={{
          // Modal feel — slides up from the bottom — for the
          // search-screen entry from the jobs list. Surveyors
          // dismiss with the Cancel button at the top, which
          // pops back to wherever they came from.
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
