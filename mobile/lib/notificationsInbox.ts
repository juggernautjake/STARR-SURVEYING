/**
 * Admin → user notifications inbox (table-backed pings).
 *
 * Per the user's resilience requirement: "the admin/dispatcher needs
 * to be able to notify the user that they need to log their hours."
 * This file is the mobile half of that loop — the admin web app
 * INSERTs a row (via the existing lib/notifications.ts notify()
 * helper or the new POST /api/admin/notifications), PowerSync
 * delivers it to the targeted device, and this module:
 *
 *   1. Subscribes to fresh, undelivered, unexpired rows via PowerSync.
 *   2. Fires a local expo-notifications banner so the OS notification
 *      center surfaces the message even when Starr Field is closed.
 *   3. Flips delivered_at on the row so the dispatcher can see
 *      "delivered ✓" in the admin Team page.
 *   4. Returns the most-recent unread row to the in-app
 *      NotificationBanner UI via useActiveAdminPing().
 *   5. Exposes markRead + dismiss helpers — both are column-restricted
 *      writes (RLS GRANT in seeds/222) so the call must succeed.
 *
 * Schema details (seeds/222_starr_field_notifications.sql):
 *
 *   The mobile inbox shares the web admin's `notifications` table —
 *   we DON'T have a parallel mobile-only table. Identity is
 *   `user_email` (the web admin's primary key) plus a UUID mirror
 *   `target_user_id` that PowerSync sync rules scope by. RLS allows
 *   filtering on either, so mobile uses target_user_id when
 *   available + falls back to user_email for race-safe reads.
 *
 *   Lifecycle uses the existing booleans (is_read, is_dismissed)
 *   plus paired timestamp columns added by seeds/222 (read_at,
 *   dismissed_at, delivered_at). Mobile writes both halves so the
 *   web admin's NotificationBell UI continues to work unchanged.
 *
 * Companion file:
 *
 *   - lib/notifications.ts — local-only schedule/cancel wrapper for
 *     the F1 #7 "still working?" prompts. Reused here for the
 *     OS-banner side of the admin ping flow.
 *
 * Lifecycle ASCII:
 *
 *   admin clicks "Ping" ─────► INSERT notifications row
 *                                       │
 *                                       ▼
 *   PowerSync syncs to device ──► useUnreadAdminPings() picks up row
 *                                       │
 *                                       ▼
 *   useAdminPingDispatcher() ──► fire local banner + UPDATE delivered_at
 *                                       │
 *                                       ▼
 *   user taps banner ──► markRead() ──► row's is_read+read_at flip
 *                                       │
 *                                       ▼
 *   admin sees "read ✓" in Team page
 */
import { useEffect, useRef } from 'react';
import { usePowerSync, useQuery } from '@powersync/react';

import { useAuth } from './auth';
import { logError, logInfo, logWarn } from './log';
import { schedule as scheduleLocalNotification } from './notifications';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Sub-category that drives mobile-side iconography + auto-routing.
 * The web `type` column carries the high-level category (assignment,
 * reminder, payment); `source_type` is the fine-grained event id and
 * is what mobile keys on for special-case display + deep-links.
 */
export type AdminPingSourceType =
  | 'log_hours'
  | 'submit_week'
  | 'admin_direct'
  | 'hours_decision'
  // Other web-emitted source_types render as plain message banners:
  | 'job_assignment'
  | 'task_assignment'
  | 'job_stage'
  | 'reminder'
  | (string & {});

export interface AdminPing {
  id: string;
  user_email: string | null;
  target_user_id: string | null;
  type: string | null;
  source_type: AdminPingSourceType | null;
  source_id: string | null;
  title: string;
  body: string | null;
  icon: string | null;
  /** Web URL or in-app route. Strings starting with '/(tabs)/' or
   *  'starr-field://' are interpreted as Expo Router pathnames. */
  link: string | null;
  escalation_level: string | null;
  thread_id: string | null;
  is_read: number; // 0/1
  is_dismissed: number; // 0/1
  read_at: string | null;
  dismissed_at: string | null;
  delivered_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ── Reactive query hooks ─────────────────────────────────────────────────────

/**
 * Reactive list of unread + non-dismissed + non-expired pings for the
 * current user, newest first. Drives the in-app banner stack.
 *
 * Filters by either target_user_id (UUID) or user_email — the web
 * admin's older code paths wrote user_email only, and the seeds/222
 * trigger fills target_user_id, but a freshly inserted row may still
 * be in flight. Matching on either is race-safe.
 */
export function useUnreadAdminPings(): AdminPing[] {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const { data } = useQuery<AdminPing>(
    `SELECT id, user_email, target_user_id, type, source_type, source_id,
            title, body, icon, link, escalation_level, thread_id,
            is_read, is_dismissed, read_at, dismissed_at, delivered_at,
            expires_at, created_at
       FROM notifications
      WHERE (target_user_id = ? OR user_email = ?)
        AND is_read = 0
        AND is_dismissed = 0
        AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ORDER BY created_at DESC`,
    userId && email ? [userId, email] : []
  );

  return data ?? [];
}

/**
 * Convenience: the single most-recent unread ping. The banner UI shows
 * one at a time; users dismiss / mark-read to advance the stack.
 */
export function useActiveAdminPing(): AdminPing | null {
  const pings = useUnreadAdminPings();
  return pings[0] ?? null;
}

/** Total count for tab-badge / Me-tab unread indicator. */
export function useUnreadAdminPingCount(): number {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const { data } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notifications
      WHERE (target_user_id = ? OR user_email = ?)
        AND is_read = 0
        AND is_dismissed = 0
        AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    userId && email ? [userId, email] : []
  );

  return data?.[0]?.count ?? 0;
}

// ── Mark-delivered dispatcher hook ───────────────────────────────────────────

/**
 * Mount-once hook (top-level layout) that watches for newly-arrived
 * pings, fires a local OS banner for each, and flips delivered_at.
 * Idempotent — uses an in-memory Set of already-handled ids to dedupe
 * across re-renders.
 *
 * The OS banner is what the user actually sees when the app is
 * backgrounded. When foregrounded, the in-app NotificationBanner from
 * useActiveAdminPing() takes over (and the OS banner is suppressed by
 * setNotificationHandler in app/_layout.tsx).
 */
export function useAdminPingDispatcher(): void {
  const db = usePowerSync();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const { data: undelivered } = useQuery<AdminPing>(
    `SELECT id, user_email, target_user_id, type, source_type, source_id,
            title, body, icon, link, escalation_level, thread_id,
            is_read, is_dismissed, read_at, dismissed_at, delivered_at,
            expires_at, created_at
       FROM notifications
      WHERE (target_user_id = ? OR user_email = ?)
        AND delivered_at IS NULL
        AND is_dismissed = 0
        AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ORDER BY created_at ASC`,
    userId && email ? [userId, email] : []
  );

  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || !undelivered || undelivered.length === 0) return;

    let cancelled = false;

    (async () => {
      for (const row of undelivered) {
        if (cancelled) return;
        if (handledRef.current.has(row.id)) continue;
        handledRef.current.add(row.id);

        // Fire the OS-level banner. Schedule for "1 second from now"
        // because expo-notifications needs a future date; treat that
        // as effectively immediate. If permission is denied this
        // silently no-ops — the in-app banner still shows.
        await scheduleLocalNotification({
          identifier: `admin-ping-${row.id}`,
          fireAt: new Date(Date.now() + 1_000),
          title: row.title,
          body: row.body ?? '',
          data: {
            kind: 'admin-ping',
            notification_id: row.id,
            source_type: row.source_type,
            link: row.link,
          },
        }).catch((err) => {
          logWarn('notificationsInbox.dispatcher', 'schedule threw', err, {
            notification_id: row.id,
          });
        });

        // Flip delivered_at — column-level GRANT (seeds/222) allows this
        // owner write. We DON'T touch is_read here; the user hasn't
        // engaged yet.
        try {
          const now = new Date().toISOString();
          await db.execute(
            `UPDATE notifications SET delivered_at = ? WHERE id = ?`,
            [now, row.id]
          );
          logInfo('notificationsInbox.dispatcher', 'delivered', {
            notification_id: row.id,
            source_type: row.source_type,
          });
        } catch (err) {
          // Don't remove from handledRef — retrying would dupe-fire
          // the OS banner. The mark-delivered side will retry on next
          // app launch via the same query (delivered_at still null).
          logError(
            'notificationsInbox.dispatcher',
            'mark-delivered failed',
            err,
            { notification_id: row.id }
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, userId, email, undelivered]);
}

// ── Owner-side mutations ─────────────────────────────────────────────────────

/**
 * Mark a ping as read. Called when the user taps the in-app banner OR
 * the OS notification (the response handler in _layout.tsx routes to
 * the link target and calls markRead). Writes BOTH is_read=1 AND
 * read_at — the existing web NotificationBell renders is_read, while
 * the timestamp lets the dispatcher see WHEN the user engaged.
 *
 * Idempotent — re-marking is a no-op (UPDATE ... WHERE is_read = 0).
 */
export async function markPingRead(
  db: ReturnType<typeof usePowerSync>,
  id: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE notifications
          SET is_read = 1, read_at = ?
        WHERE id = ? AND is_read = 0`,
      [now, id]
    );
    logInfo('notificationsInbox.markRead', 'marked read', {
      notification_id: id,
    });
  } catch (err) {
    logError('notificationsInbox.markRead', 'failed', err, {
      notification_id: id,
    });
  }
}

/**
 * Dismiss a ping (swipe-away on the in-app banner). Hides it from the
 * inbox without marking it read — the admin can see "delivered but not
 * read; user dismissed at HH:MM" in the dashboard.
 */
export async function dismissPing(
  db: ReturnType<typeof usePowerSync>,
  id: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db.execute(
      `UPDATE notifications
          SET is_dismissed = 1, dismissed_at = ?
        WHERE id = ? AND is_dismissed = 0`,
      [now, id]
    );
    logInfo('notificationsInbox.dismiss', 'dismissed', {
      notification_id: id,
    });
  } catch (err) {
    logError('notificationsInbox.dismiss', 'failed', err, {
      notification_id: id,
    });
  }
}

// ── link-string interpretation ───────────────────────────────────────────────

export interface PingDeepLink {
  pathname: string;
  params?: Record<string, string>;
}

/**
 * Parse the `link` column into a mobile-routable deep-link OR null
 * when the link belongs to the web admin only ('/admin/...' URLs).
 *
 * Conventions we understand:
 *   - 'starr-field://path?...'        — explicit mobile deep-link
 *   - '/(tabs)/time'                  — Expo Router pathname
 *   - '/(tabs)/jobs/[id]?id=...'      — pathname with ?id= query
 *   - '/admin/my-hours'               — web-only, mapped to (tabs)/time
 *   - everything else                 — null (banner shows but no nav)
 *
 * source_type also drives auto-routing for known mobile destinations,
 * so this fallback only fires when source_type isn't recognised.
 */
export function parsePingLink(link: string | null): PingDeepLink | null {
  if (!link) return null;

  // 1) Explicit mobile scheme.
  if (link.startsWith('starr-field://')) {
    const url = safeParseUrl(link);
    if (!url) return null;
    return {
      pathname: url.pathname || '/',
      params: queryToParams(url.search),
    };
  }

  // 2) Expo Router pathname (in-app).
  if (link.startsWith('/(tabs)/') || link.startsWith('/(auth)/')) {
    const [pathname, search] = splitQuery(link);
    return { pathname, params: queryToParams(search) };
  }

  // 3) Web URL — map a few common ones to mobile equivalents.
  const webMap: Record<string, string> = {
    '/admin/my-hours': '/(tabs)/time',
    '/admin/my-pay': '/(tabs)/money',
    '/admin/jobs': '/(tabs)/jobs',
  };
  for (const [webPath, mobilePath] of Object.entries(webMap)) {
    if (link === webPath || link.startsWith(`${webPath}/`)) {
      return { pathname: mobilePath };
    }
  }

  // 4) Unknown — banner shows, tap is a no-op.
  return null;
}

/**
 * source_type → mobile deep-link, used as the primary routing signal
 * (more reliable than parsing arbitrary strings out of `link`).
 */
export function deepLinkForSourceType(
  sourceType: AdminPingSourceType | null
): PingDeepLink | null {
  switch (sourceType) {
    case 'log_hours':
      return { pathname: '/(tabs)/time' };
    case 'submit_week':
      return { pathname: '/(tabs)/time' };
    case 'hours_decision':
      return { pathname: '/(tabs)/time' };
    case 'admin_direct':
      // No specific destination — admin's free-text message stands
      // alone. Banner closes on tap; no nav.
      return null;
    default:
      return null;
  }
}

function safeParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function splitQuery(s: string): [string, string] {
  const i = s.indexOf('?');
  if (i < 0) return [s, ''];
  return [s.slice(0, i), s.slice(i + 1)];
}

function queryToParams(search: string): Record<string, string> | undefined {
  // Tolerate either "?foo=bar" (URL.search) or "foo=bar" (split form).
  const stripped = search.startsWith('?') ? search.slice(1) : search;
  if (!stripped) return undefined;
  const out: Record<string, string> = {};
  for (const pair of stripped.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return Object.keys(out).length ? out : undefined;
}
