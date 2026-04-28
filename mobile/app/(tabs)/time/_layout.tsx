import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Time-tab nested stack. Lets the index screen push the pick-job
 * modal (presented as a full screen for one-handed reach per plan
 * §7.1 rule 1, not as a card-modal). Tab bar stays visible.
 */
export default function TimeStackLayout() {
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
        name="pick-job"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen name="edit/[id]" />
    </Stack>
  );
}
