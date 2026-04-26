/**
 * Floating action button for the Capture tab, per plan §7.2:
 *
 *   Tab bar (always visible):
 *     [ Jobs ]  [ Capture ]  [ Time ]  [ $ ]  [ Me ]
 *                 ↑ floating big button, always reachable
 *                   long-press = capture without job
 *
 * Renders as the `tabBarButton` for the Capture screen instead of the
 * default flat tab item. Lifts above the tab bar via negative margin
 * so the circle protrudes; uses elevation/shadow so it reads as a
 * "real" FAB.
 *
 * onPress fires whatever the Tabs navigator hands us (which is a
 * navigation to the Capture screen — no extra logic needed). The
 * long-press is a stub today; the actual "quick-capture without job"
 * flow lands in F3 alongside data-point capture (§5.3).
 */
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  Alert,
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { colors } from './theme';

const FAB_SIZE = 64;
const FAB_LIFT = 18;

export function CaptureFab(props: BottomTabBarButtonProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  // Forward the actual GestureResponderEvent so the navigator's
  // animation/haptic hooks see the real gesture.
  const handlePress = (e: GestureResponderEvent) => {
    props.onPress?.(e);
  };

  const handleLongPress = () => {
    Alert.alert(
      'Quick capture',
      'Capture without selecting a job — this gesture lights up in Phase F3 alongside data-point capture (plan §5.3).'
    );
  };

  return (
    // Wrapper view receives the tab bar's slot — keep it flex-1 so
    // the FAB centers in its column without distorting siblings.
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capture"
        accessibilityHint="Tap to start a new data-point capture; long-press for quick capture without a job"
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: palette.accent,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <Text style={styles.glyph}>📍</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    marginTop: -FAB_LIFT,
    alignItems: 'center',
    justifyContent: 'center',
    // Cross-platform shadow:
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  glyph: {
    fontSize: 30,
    color: '#FFFFFF',
  },
});
