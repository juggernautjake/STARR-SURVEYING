import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationBanner } from '@/lib/NotificationBanner';
import { AuthProvider } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';
import { logInfo, logWarn } from '@/lib/log';
import {
  type AdminPingSourceType,
  deepLinkForSourceType,
  markPingRead,
  parsePingLink,
  useAdminPingDispatcher,
} from '@/lib/notificationsInbox';
import Sentry, { initSentry } from '@/lib/sentry';
import { useUploadQueueDrainer } from '@/lib/uploadQueue';
import { usePowerSync } from '@powersync/react';

// Module-load side effects (must run BEFORE any provider mounts):
//
//   1. initSentry() — wraps the JS runtime with crash reporting so a
//      failure during AuthProvider/DatabaseProvider init still gets
//      captured. No-op when EXPO_PUBLIC_SENTRY_DSN is missing.
//   2. preventAutoHideAsync() — keeps the native splash visible while
//      AuthProvider + DatabaseProvider finish their initial setup.
//      DatabaseProvider calls SplashScreen.hideAsync() the moment
//      SQLite is open, so we go native splash → ready UI with no
//      empty-screen flash. Per plan §7.1 rule 4 ("speed over
//      decoration").
initSentry();

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (hot-reload, etc.) — safe to ignore.
});

/**
 * Foreground notification handler — when an admin ping (or any local
 * notification) fires while the app is in the foreground, suppress
 * the OS-level banner because the in-app NotificationBanner is
 * already showing the message. Sound + badge still fire so the user
 * gets the audible cue. When backgrounded, expo-notifications uses
 * the OS defaults (full banner + sound + badge).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Provider stack ordering matters:
 *   1. SafeAreaProvider — outer; insets are needed by everyone below
 *   2. AuthProvider     — supplies useAuth() to DatabaseProvider so it
 *                         can connect/disconnect with session changes
 *   3. DatabaseProvider — opens local SQLite, wires PowerSync; renders
 *                         a splash while init() runs (one-time, fast)
 *   4. Stack            — actual screens
 *
 * Wrapped in Sentry.wrap so component-tree info attaches to crash
 * reports. Sentry.wrap is a passthrough when initSentry no-op'd
 * (no DSN configured), so dev still works without a Sentry account.
 */
/**
 * Empty-fragment component that mounts useUploadQueueDrainer inside
 * the DatabaseProvider's children — usePowerSync needs a parent
 * <PowerSyncContext>. Drainer fires on app launch + every network
 * restore; survives offline capture sessions.
 */
function UploadQueueDrainer() {
  useUploadQueueDrainer();
  return null;
}

/**
 * Mount-once dispatcher: watches the notifications table for fresh
 * admin pings, fires the OS local-notification banner, and flips
 * delivered_at on each row so the dispatcher dashboard reflects
 * delivery state. See lib/notificationsInbox.ts.
 */
function AdminPingDispatcher() {
  useAdminPingDispatcher();
  return null;
}

/**
 * Routes when the user taps an OS-level admin-ping notification (cold
 * start, background, or foreground). The action JSON on the row tells
 * us where to go; if missing we just mark the row read and let the
 * user land wherever they were.
 *
 * Lives inside the DatabaseProvider so usePowerSync resolves; we need
 * the SQLite handle to flip read_at + look up the action column.
 */
function NotificationResponseHandler() {
  const db = usePowerSync();
  const router = useRouter();

  useEffect(() => {
    // Cold-start case: app was killed when the OS surfaced the
    // notification, then the user tapped it to launch us. The
    // response is queued for us via getLastNotificationResponseAsync.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch((err) => {
        logWarn(
          'notificationsInbox.responseHandler',
          'getLastNotificationResponseAsync failed',
          err
        );
      });

    // Live case: user taps a notification while app is alive.
    const sub = Notifications.addNotificationResponseReceivedListener(
      handleResponse
    );

    return () => sub.remove();

    async function handleResponse(
      response: Notifications.NotificationResponse
    ) {
      const data = response.notification.request.content.data as {
        kind?: string;
        notification_id?: string;
        source_type?: string | null;
        link?: string | null;
      } | null;

      if (!data || data.kind !== 'admin-ping' || !data.notification_id) {
        // Not one of ours (e.g. an F1 #7 still-working prompt).
        // F1 #7's response isn't tracked through this path.
        return;
      }

      logInfo('notificationsInbox.responseHandler', 'tap', {
        notification_id: data.notification_id,
        source_type: data.source_type,
      });

      // Mark read so the inbox reflects engagement.
      await markPingRead(db, data.notification_id);

      // Resolve destination. source_type is the strongest signal —
      // we mapped well-known web event ids ('log_hours', 'submit_week',
      // 'hours_decision') to mobile routes in deepLinkForSourceType.
      // Fall back to parsing the `link` column for unknown source_types.
      const deepLink =
        deepLinkForSourceType(
          (data.source_type ?? null) as AdminPingSourceType | null
        ) ?? parsePingLink(data.link ?? null);
      if (!deepLink?.pathname) return;

      try {
        if (deepLink.params) {
          router.push({
            pathname: deepLink.pathname as never,
            params: deepLink.params,
          });
        } else {
          router.push(deepLink.pathname as never);
        }
      } catch (err) {
        logWarn('notificationsInbox.responseHandler', 'route push failed', err, {
          pathname: deepLink.pathname,
        });
      }
    }
  }, [db, router]);

  return null;
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <DatabaseProvider>
          <UploadQueueDrainer />
          <AdminPingDispatcher />
          <NotificationResponseHandler />
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="+not-found" />
          </Stack>
          {/*
           * Banner overlays the active screen — render it AFTER the
           * Stack so it sits on top of every route. The component is
           * absolutely-positioned + only renders when an unread ping
           * exists, so it has zero cost when there's nothing to show.
           */}
          <NotificationBanner />
        </DatabaseProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
