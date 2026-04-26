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
        if (existing.status === 'granted') return true;
        // canAskAgain is false when the user previously hard-denied
        // (must go to device settings). Don't badger them.
        if (existing.status === 'denied' && !existing.canAskAgain) return false;

        const requested = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        return requested.status === 'granted';
      } catch (err) {
        console.warn('[notifications] permission check failed:', err);
        return false;
      }
    })();
  }
  return permissionPromise;
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
  if (!granted) return false;

  if (args.fireAt.getTime() <= Date.now()) return false;

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
    return true;
  } catch (err) {
    console.warn('[notifications] schedule failed:', err);
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
    // The id likely never existed (clock-out fired without an
    // earlier clock-in's notifications having been scheduled).
    // Silent — this happens routinely if permission was denied at
    // clock-in time.
    void err;
  }
}
