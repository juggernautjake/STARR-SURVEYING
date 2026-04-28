import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Money-tab nested stack — receipts list + capture modal + detail.
 *
 * The capture screen is presented modally so the OS camera/library
 * picker animates over the list cleanly and a back-swipe returns to
 * the list with the new pending receipt visible at the top.
 *
 * F2 #4 will add the per-receipt detail / edit screen at `[id].tsx`.
 */
export default function MoneyStackLayout() {
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
      <Stack.Screen
        name="capture"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
