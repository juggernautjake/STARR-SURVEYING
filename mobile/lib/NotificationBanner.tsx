/**
 * In-app banner for admin → user pings (notifications table rows).
 *
 * Mounts above every screen via app/_layout.tsx and only renders when
 * there's an active unread ping. The OS-level banner from
 * expo-notifications fires too (via useAdminPingDispatcher) — these
 * two banners cover the foreground (in-app) and background (OS)
 * cases respectively.
 *
 * Interactions:
 *   - Tap the banner   → mark read, route via source_type → deep-link
 *                        table, fall back to parsing the link column.
 *   - Tap "×"          → dismiss (hide without marking read; admin
 *                        sees "user dismissed" in their dashboard).
 *
 * Iconography priority:
 *   1. The row's `icon` column (web admins set emoji glyphs there).
 *   2. source_type → glyph map below (mobile-known sub-categories).
 *   3. fallback ℹ.
 *
 * Escalation colouring:
 *   urgent / critical render with the danger palette so the user sees
 *   the banner is high priority even at a glance.
 */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePowerSync } from '@powersync/react';

import {
  type AdminPingSourceType,
  deepLinkForSourceType,
  dismissPing,
  markPingRead,
  parsePingLink,
  useActiveAdminPing,
} from './notificationsInbox';
import { colors } from './theme';

/**
 * source_type → glyph fallback. Used when the row's `icon` column is
 * null (older web rows) or empty.
 */
const SOURCE_TYPE_GLYPH: Partial<Record<AdminPingSourceType, string>> = {
  log_hours: '⏱',
  submit_week: '✓',
  admin_direct: '📢',
  hours_decision: '🗓',
  job_assignment: '🔧',
  task_assignment: '📋',
};

export function NotificationBanner() {
  const ping = useActiveAdminPing();
  const db = usePowerSync();
  const router = useRouter();
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  if (!ping) return null;

  const isUrgent =
    ping.escalation_level === 'urgent' ||
    ping.escalation_level === 'critical';

  // Pick the best icon: prefer the row's explicit `icon` column,
  // fall back to the source_type map, then to ℹ.
  const glyph =
    ping.icon ||
    SOURCE_TYPE_GLYPH[ping.source_type as AdminPingSourceType] ||
    'ℹ';

  const onTap = async () => {
    // Mark first so the in-app banner closes immediately even if the
    // route push hits a slow load. The reactive query then advances
    // to the next unread ping (or hides the banner entirely).
    await markPingRead(db, ping.id);

    // Resolve destination: source_type wins; fall back to parsing the
    // link string (web URLs are mapped to mobile equivalents inside
    // parsePingLink).
    const deepLink =
      deepLinkForSourceType(ping.source_type as AdminPingSourceType) ??
      parsePingLink(ping.link);

    if (deepLink?.pathname) {
      try {
        if (deepLink.params) {
          router.push({
            pathname: deepLink.pathname as never,
            params: deepLink.params,
          });
        } else {
          router.push(deepLink.pathname as never);
        }
      } catch {
        // Bad pathname — banner already closed; nothing else to do.
      }
    }
  };

  const onDismiss = async () => {
    await dismissPing(db, ping.id);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} pointerEvents="box-none">
      <View
        style={[
          styles.container,
          {
            backgroundColor: palette.surface,
            borderColor: isUrgent ? palette.danger : palette.accent,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable
          onPress={onTap}
          style={styles.tappable}
          accessibilityRole="button"
          accessibilityLabel={`${ping.title}. ${ping.body ?? ''} Tap to open.`}
        >
          <Text
            style={[
              styles.icon,
              { color: isUrgent ? palette.danger : palette.accent },
            ]}
          >
            {glyph}
          </Text>
          <View style={styles.body}>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: palette.text }]}
            >
              {ping.title}
            </Text>
            {ping.body ? (
              <Text
                numberOfLines={2}
                style={[styles.bodyText, { color: palette.muted }]}
              >
                {ping.body}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={12}
        >
          <Text style={[styles.dismissText, { color: palette.muted }]}>×</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Floating overlay that sits above the active screen but lets touches
  // outside the banner pass through to the screen behind.
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  tappable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
    marginRight: 12,
    width: 26,
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 17,
  },
  dismissBtn: {
    paddingLeft: 12,
    paddingVertical: 4,
  },
  dismissText: {
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 24,
  },
});
