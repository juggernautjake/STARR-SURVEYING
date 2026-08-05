// lib/push/admin-push.ts — deliver a business-app notification to a person's phone.
//
// The in-app bell (lib/notifications.ts) already writes the durable row and already decides WHO gets
// it. This is the other half: taking that same row to the recipient's registered devices as a Web
// Push, so it lands on the lock screen and the home-screen icon even when the app is closed.
//
// It is deliberately shaped like the studio's sender (lib/voice/notifications.ts → deliverPush): the
// durable row is the notification, push is a best-effort delivery attempt on top of it. A failed push
// costs a `last_failure_at`, never a lost lead — which is why every path here swallows its own errors
// and this function never throws into the caller. An API route that saved a timesheet must not 500
// because a push endpoint returned 410.

import { supabaseAdmin } from '@/lib/supabase';
import { sendPush } from '@/lib/push/web-push';

export interface AdminPushInput {
  title: string;
  body?: string | null;
  /** Deep link opened when the banner is tapped. Defaults to the hub. */
  href?: string | null;
  /** Notification kind, used only to collapse repeats in the tray (the SW's `tag`). */
  type?: string | null;
}

interface AdminSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number | null;
}

/**
 * The recipient's current unread bell count — the number that belongs on the app icon.
 *
 * Counted from the notifications table, not tracked separately, so the badge is always a VIEW of the
 * real unread set (the same rule the hub badges follow). The row this push is about has already been
 * inserted by the caller, so it is included in the count.
 */
async function unreadCountFor(userEmail: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_email', userEmail)
    .eq('is_read', false)
    .eq('is_dismissed', false);
  return count ?? 0;
}

/**
 * Best-effort Web Push to every live device a user has registered. Never throws.
 *
 * Resolves the email to a `registered_users.id` (the subscription FK), loads that user's live
 * subscriptions, and sends one payload carrying the unread count for the icon badge. Applies the same
 * failure policy as the studio: a `gone` endpoint (404/410) is disabled immediately; a transient
 * failure only increments a counter, and it takes three consecutive strikes to disable — so one push
 * service outage cannot unsubscribe a whole crew at once.
 */
export async function sendAdminPush(userEmail: string, input: AdminPushInput): Promise<void> {
  try {
    const { data: user } = await supabaseAdmin
      .from('registered_users')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();
    const userId = (user as { id?: string } | null)?.id;
    if (!userId) return;

    const { data: subs } = await supabaseAdmin
      .from('admin_push_subscriptions')
      .select('id, endpoint, p256dh, auth, failure_count')
      .eq('user_id', userId)
      .is('disabled_at', null);

    const live = (subs ?? []) as AdminSubRow[];
    if (!live.length) return;

    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? '',
      href: input.href ?? '/admin/me',
      type: input.type ?? 'general',
      unreadCount: await unreadCountFor(userEmail),
    });

    const results = await sendPush(live, payload);

    await Promise.all(
      results.map(async ({ sub, result }) => {
        if (result.ok) {
          await supabaseAdmin
            .from('admin_push_subscriptions')
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq('id', sub.id);
          return;
        }
        const failures = (sub.failure_count ?? 0) + 1;
        await supabaseAdmin
          .from('admin_push_subscriptions')
          .update({
            failure_count: failures,
            last_failure_at: new Date().toISOString(),
            disabled_at: result.gone || failures >= 3 ? new Date().toISOString() : null,
          })
          .eq('id', sub.id);
      }),
    );
  } catch {
    // The bell row is already written; push is the best-effort half and its failure is never the
    // caller's problem.
  }
}

/** Fan out to several recipients, each with their own device list and their own unread count. */
export async function sendAdminPushMany(userEmails: readonly string[], input: AdminPushInput): Promise<void> {
  // Deduped so a caller that lists the same approver twice does not double-push them.
  const unique = [...new Set(userEmails.filter(Boolean))];
  await Promise.all(unique.map((email) => sendAdminPush(email, input)));
}
