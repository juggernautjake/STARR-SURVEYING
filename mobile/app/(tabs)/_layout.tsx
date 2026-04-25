import { Redirect, Tabs } from 'expo-router';
import { Text, useColorScheme } from 'react-native';

import { LoadingSplash } from '@/lib/LoadingSplash';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/**
 * Tab bar shell — five tabs per STARR_FIELD_MOBILE_APP_PLAN.md §7.2:
 *   [ Jobs ] [ Capture ] [ Time ] [ $ ] [ Me ]
 *
 * Capture is the floating big button (planned styling, not yet
 * implemented). Most tabs are placeholders in Phase F0; each lands
 * in F1+ as feature work catches up.
 *
 * Session guard: anyone who lands here without a session gets bounced
 * to /(auth)/sign-in. This is belt-and-suspenders with app/index.tsx
 * — handles deep links that target a tab directly.
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();

  // Dark-mode default per plan §7.1 rule 7 (battery-aware). Matches
  // the default in lib/Placeholder.tsx so the tab bar and screen
  // backgrounds agree on first render.
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  if (loading) return <LoadingSplash />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

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
