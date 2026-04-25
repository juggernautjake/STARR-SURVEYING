import { Tabs } from 'expo-router';
import { Text, useColorScheme } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Tab bar shell — five tabs per STARR_FIELD_MOBILE_APP_PLAN.md §7.2:
 *   [ Jobs ] [ Capture ] [ Time ] [ $ ] [ Me ]
 *
 * Capture is the floating big button (planned styling, not yet
 * implemented). All five are placeholders in Phase F0; they render
 * empty screens with a label until each feature lands in F1+.
 */
export default function TabsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const palette = colors[scheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
        headerStyle: {
          backgroundColor: palette.surface,
        },
        headerTintColor: palette.text,
      }}
    >
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <TabGlyph color={color} label="📋" />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: 'Capture',
          tabBarIcon: ({ color }) => <TabGlyph color={color} label="📍" />,
        }}
      />
      <Tabs.Screen
        name="time"
        options={{
          title: 'Time',
          tabBarIcon: ({ color }) => <TabGlyph color={color} label="⏱" />,
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: '$',
          tabBarIcon: ({ color }) => <TabGlyph color={color} label="$" />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color }) => <TabGlyph color={color} label="👤" />,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ color, label }: { color: string; label: string }) {
  return <Text style={{ color, fontSize: 22 }}>{label}</Text>;
}
