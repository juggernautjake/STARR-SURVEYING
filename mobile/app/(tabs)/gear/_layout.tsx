import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Gear-tab nested stack. Phase F10.8 — role-gated 6th tab for
 * Equipment Manager mobile flows (§5.12.9.2). v1 ships only the
 * index dashboard; future drilldowns (per-unit detail, calibration
 * detail, scan-to-check-out) hook in here as additional Stack
 * screens.
 *
 * The tab visibility itself is gated in `(tabs)/_layout.tsx` —
 * the Stack here just defines the nav stack for whatever is
 * actually rendered.
 */
export default function GearStackLayout() {
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
    </Stack>
  );
}
