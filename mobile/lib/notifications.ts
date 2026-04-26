/**
 * Local notifications wrapper around expo-notifications.
 *
 * F1 #7 only schedules LOCAL notifications (no remote push) — the
 * "still working?" prompts at 10h and 14h are pure timer-driven
 * reminders. Remote push (e.g. dispatcher messages, approval
 * status) is a Phase F2+ feature.
 *
 * Permission contract:
 *   - We auto-request the first time we'd schedule something
 *     (`ensureNotificationPermission`).
 *   - If denied, every subsequent schedule call silently no-ops.
 *     Clock-in still works; the user just doesn't get reminders.
 *   - Re-checking on every schedule lets the user re-grant via
 *     device settings without restarting the app.
 *
 * Scheduling contract:
 *   - We use string identifiers tied to the calling domain (e.g.
 *     `still-working-10h-{entryId}`) so cancel calls precisely
 *     target what we scheduled — never touch other apps' or other
 *     features' notifications.
 *   - All errors are swallowed + logged. Notifications are a
 *     convenience; failures must NOT cascade into business logic.
 */
import * as Notifications from 'expo-notifications';

import { logInfo, logWarn } from './log';

let permissionPromise: Promise<boolean> | null = null;

/**
 * Check or request notification permission. Cached for the app
 * lifetime — once granted (or denied), we don't re-prompt the user
 * within the same session. Returns true iff we can schedule.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        if (existing.status === 'granted') {
          logInfo('notifications.ensurePermission', 'already granted');
          return true;
        }
        // canAskAgain is false when the user previously hard-denied
        // (must go to device settings). Don't badger them.
        if (existing.status === 'denied' && !existing.canAskAgain) {
          logInfo('notifications.ensurePermission', 'hard-denied; cannot re-prompt');
          return false;
        }

        const requested = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        const granted = requested.status === 'granted';
        logInfo('notifications.ensurePermission', 'prompt result', {
          status: requested.status,
          granted,
        });
        return granted;
      } catch (err) {
        logWarn('notifications.ensurePermission', 'permission check failed', err);
        return false;
      }
    })();
  }
  return permissionPromise;
}

/**
 * Snapshot of the OS permission state for surfacing in the Me tab.
 * Distinct from `ensureNotificationPermission()` which prompts the
 * user — this is a passive read.
 *
 * - 'granted'  → notifications will display.
 * - 'undetermined' → user hasn't been asked yet (we'll prompt on
 *                    first schedule call).
 * - 'denied_can_ask' → user denied earlier but iOS/Android still
 *                      permits a re-prompt; we'll re-prompt on next
 *                      schedule call (rare path).
 * - 'denied_hard' → user must enable in Settings — we prompt them
 *                   to deep-link via Linking.openSettings().
 */
export type NotificationPermissionState =
  | 'granted'
  | 'undetermined'
  | 'denied_can_ask'
  | 'denied_hard';

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionState> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return 'granted';
    if (existing.status === 'undetermined') return 'undetermined';
    return existing.canAskAgain ? 'denied_can_ask' : 'denied_hard';
  } catch (err) {
    logWarn('notifications.getStatus', 'permission read failed', err);
    return 'undetermined';
  }
}

/**
 * Imperative request — fronts ensureNotificationPermission() with a
 * cache-busting reset so the Me tab can re-prompt after the user
 * returns from Settings (where they may have flipped the switch
 * outside our process).
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  // Bust the cached promise so a re-prompt actually re-evaluates the
  // OS state. Without this, a user who hard-denied at install and
  // later granted in Settings would still see "denied" because the
  // first-call promise resolved to false.
  permissionPromise = null;
  await ensureNotificationPermission();
  return getNotificationPermissionStatus();
}

export interface ScheduleArgs {
  /** Stable id so the matching cancel() targets the right notification. */
  identifier: string;
  /** When to fire. Past dates are silently dropped. */
  fireAt: Date;
  title: string;
  body: string;
  /** Arbitrary payload, surfaced via tap-handler. */
  data?: Record<string, unknown>;
}

/**
 * Schedule a one-shot local notification. Returns true on success,
 * false if permission was denied OR the date is in the past.
 */
export async function schedule(args: ScheduleArgs): Promise<boolean> {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    logInfo('notifications.schedule', 'no permission — skip', {
      identifier: args.identifier,
    });
    return false;
  }

  if (args.fireAt.getTime() <= Date.now()) {
    logInfo('notifications.schedule', 'fireAt in past — skip', {
      identifier: args.identifier,
      fire_at: args.fireAt.toISOString(),
    });
    return false;
  }

  try {
    // Cancel any existing notification with this id first; otherwise
    // we end up with stacked dupes if the caller re-schedules.
    await Notifications.cancelScheduledNotificationAsync(args.identifier).catch(() => {
      // Not-found is fine — first-time schedule.
    });

    await Notifications.scheduleNotificationAsync({
      identifier: args.identifier,
      content: {
        title: args.title,
        body: args.body,
        sound: 'default',
        data: args.data ?? {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: args.fireAt,
      },
    });
    logInfo('notifications.schedule', 'scheduled', {
      identifier: args.identifier,
      fire_at: args.fireAt.toISOString(),
    });
    return true;
  } catch (err) {
    logWarn('notifications.schedule', 'schedule failed', err, {
      identifier: args.identifier,
      fire_at: args.fireAt.toISOString(),
    });
    return false;
  }
}

/**
 * Cancel a scheduled notification by id. Safe to call when nothing
 * is scheduled under that id.
 */
export async function cancel(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (err) {
    // Most failures here are benign — clock-out cancels a notification
    // that never scheduled because permission was denied at clock-in.
    // logWarn captures real native-bridge failures (Sentry) without
    // bubbling to the caller; the cancel is best-effort UX.
    logWarn('notifications.cancel', 'cancel failed', err, { identifier });
  }
}
