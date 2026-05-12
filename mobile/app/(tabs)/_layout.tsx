import { Redirect, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureFab } from '@/lib/CaptureFab';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { ScannerFab } from '@/lib/ScannerFab';
import { useAuth } from '@/lib/auth';
import { useIsEquipmentManager } from '@/lib/myRoles';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

const TAB_BAR_HEIGHT = 64;

/**
 * Tab bar shell — five tabs per STARR_FIELD_MOBILE_APP_PLAN.md §7.2:
 *   [ Jobs ] [ Capture ] [ Time ] [ $ ] [ Me ]
 *
 * The Capture tab renders as a floating action button (CaptureFab)
 * that protrudes above the bar — that's the "always reachable big
 * button" the plan calls for. Long-press on it is a stub for the
 * F3 quick-capture flow.
 *
 * Session guard: anyone who lands here without a session gets bounced
 * to /(auth)/sign-in. Belt-and-suspenders with app/index.tsx —
 * handles deep links that target a tab directly.
 */
export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { isEquipmentManager } = useIsEquipmentManager();
  const insets = useSafeAreaInsets();

  // Dark-mode default per plan §7.1 rule 7 (battery-aware). Matches
  // the default in lib/Placeholder.tsx so the tab bar and screen
  // backgrounds agree on first render.
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  if (loading) return <LoadingSplash />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.border,
            // Grow the bar by the device's bottom safe-area inset so
            // labels sit above the home indicator instead of touching
            // it. The FAB lifts 18 px above this bar via negative
            // margin in CaptureFab; allowFontScaling+overflow keep
            // iOS from clipping the protruding circle.
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
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
            // Hide the default label — the FAB is the affordance.
            tabBarLabel: () => null,
            tabBarButton: (props) => <CaptureFab {...props} />,
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
            title: 'Money',
            tabBarIcon: ({ color }) => <TabGlyph color={color} label="$" />,
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: 'Account',
            tabBarIcon: ({ color }) => <TabGlyph color={color} label="👤" />,
          }}
        />
        {/* Equipment tab — role-gated 6th slot. Always declared so
            deep links resolve, but `href: null` hides it from the
            tab bar for non-EM users. The tab&apos;s own screen
            also enforces role gating defensively. */}
        <Tabs.Screen
          name="gear"
          options={{
            title: 'Equipment',
            tabBarIcon: ({ color }) => <TabGlyph color={color} label="🛠" />,
            href: isEquipmentManager ? '/(tabs)/gear' : null,
          }}
        />
      </Tabs>

      {/* F10.8 — persistent scanner FAB. Renders only when the
          surveyor has any active check-out. bottomInset clears the
          tab bar so the green circle floats above it without
          blocking the tab buttons. */}
      <ScannerFab bottomInset={TAB_BAR_HEIGHT + 16} />
    </View>
  );
}

function TabGlyph({ color, label }: { color: string; label: string }) {
  return <Text style={{ color, fontSize: 22 }}>{label}</Text>;
}
