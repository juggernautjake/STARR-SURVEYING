import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationBanner } from '@/lib/NotificationBanner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';
import { logInfo, logWarn } from '@/lib/log';
import { reconcileTrackingOnLaunch } from '@/lib/locationTracker';
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
 * Foreground notification handler.
 *
 * Per-kind behaviour:
 *
 *   - admin-ping rows (data.kind === 'admin-ping'): the in-app
 *     NotificationBanner overlay is already showing the message, so
 *     we suppress the OS banner to avoid double-display. Sound + badge
 *     still fire so the user gets the audible cue.
 *
 *   - F1 #7 still-working prompts and any other local-only schedule
 *     (lib/notifications.ts schedule()) WITHOUT data.kind: show the
 *     full OS banner — there's no in-app overlay for those, so
 *     suppressing would silently swallow the prompt.
 *
 * This handler is module-level (per expo-notifications API) so it
 * runs before any provider mounts. The data field is set by every
 * call to scheduleLocalNotification, so the discriminator is reliable.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { kind?: string }
      | null
      | undefined;
    const isAdminPing = data?.kind === 'admin-ping';
    return {
      // Admin pings have an in-app banner already; everything else
      // (still-working prompts, future schedules) shows the OS banner.
      shouldShowBanner: !isAdminPing,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
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
 * Reconcile the background-tracking task with the current clock-in
 * state on every cold start + auth change. Handles the "phone died
 * mid-shift, app re-launched the next morning" case from the user's
 * resilience requirements: if there's still an open job_time_entries
 * row, restart the task so background pings resume; if there isn't,
 * stop any orphaned task.
 *
 * Lives inside the DatabaseProvider so usePowerSync resolves.
 */
function LocationTrackerReconciler() {
  const db = usePowerSync();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const userEmail = session?.user.email ?? null;

  useEffect(() => {
    if (!userId || !userEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const open = await db.getOptional<{ id: string }>(
          `SELECT id FROM job_time_entries
            WHERE user_email = ? AND ended_at IS NULL
            LIMIT 1`,
          [userEmail]
        );
        if (cancelled) return;
        await reconcileTrackingOnLaunch({
          openEntry: open ?? null,
          userId,
          userEmail,
        });
      } catch (err) {
        logWarn(
          'locationTracker.reconciler',
          'launch reconcile failed',
          err
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, userId, userEmail]);

  return null;
}

/**
 * Routes when the user taps an OS-level admin-ping notification (cold
 * start, background, or foreground). Source_type → mobile route map
 * lives in lib/notificationsInbox.ts; this component just dispatches
 * to it after marking the row read.
 *
 * Dedup is process-wide (handledResponseIds) — getLastNotificationResponseAsync
 * returns the same response on every cold start until the OS evicts
 * it from its delivered-notifications list. Without the guard, we'd
 * route the user to /(tabs)/time on every app launch after they
 * once tapped a log-hours ping. The Set is scoped to this JS runtime
 * so a fresh process gets a single re-route (and the row is already
 * marked read by the previous run, so even that re-route is harmless).
 *
 * Lives inside the DatabaseProvider so usePowerSync resolves; we need
 * the SQLite handle to flip read_at.
 */
const handledResponseIds = new Set<string>();

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

      // Dedup: the same response arrives via getLastNotificationResponseAsync
      // on every cold start until the OS evicts the notification.
      // Skip if we've already routed for this id in this JS runtime.
      if (handledResponseIds.has(data.notification_id)) {
        return;
      }
      handledResponseIds.add(data.notification_id);

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
          <LocationTrackerReconciler />
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
