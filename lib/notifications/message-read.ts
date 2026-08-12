// lib/notifications/message-read.ts — reading a message anywhere clears its bell notification. N3.
//
// Owner, 2026-08-11:
//   *"if the user checks the notification in the little message pop up element at the bottom right
//   and reviews the new message(s), then this should be registered as them having seen the
//   notification and the notification bell should not show the notification for those now checked
//   messages anymore. IF there is a red notification bubble on the notification bell just to show
//   that a message is waiting to be viewed, and the user views that message by any means possible
//   on the website/app, then that notification bubble on the notification bell should disappear."*
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
//
// N1 turned out to be already built: `messages/send` calls `notifyMany`, so a message already
// creates a bell row AND a push (which is what sets the home-screen badge). The break was on the
// OTHER side. `messages/read` marked `message_read_receipts` and `conversation_participants
// .last_read_at` — and never touched the `notifications` table. So the message was read and the
// bell still said it was not.
//
// That is the "two sources of truth for has-this-been-seen" problem the plan predicted, and it is
// why the badge got stuck: two independent read flags, only one of which anything cleared.
//
// ── THE JOIN KEY IS `source_id`, NOT `thread_id`, AND THAT IS THE WHOLE STORY ───────────────────
//
// The obvious key looked like `thread_id`, because `messages/send` was setting
// `thread_id: conversation_id` on every message notification. It turns out that column carries a
// FOREIGN KEY to `admin_discussion_threads` — the discussion board, not the messenger — so every
// one of those inserts was failing with a 23503 and being swallowed by the route's own
// "a notification must never block a message" catch.
//
// So there was nothing to match on, because there were no rows: message notifications had never
// been created at all. `messages/send` no longer sets `thread_id`, and the key here is `source_id`,
// which is the MESSAGE id and has been correct all along.
//
// Everything is scoped to `type = 'message'` so clearing a conversation can never mark an unrelated
// notification — a payout, an hours decision — as read.

import { supabaseAdmin } from '@/lib/supabase';

/**
 * Mark this user's unread `message` notifications as read, for the given message ids.
 *
 * Both read shapes funnel here — the full page marks a whole conversation (and passes that
 * conversation's message ids), the floating messenger marks individual messages. One function for
 * both, because a badge that clears on one surface and not another is worse than one that never
 * clears: it looks fixed.
 *
 * Best-effort by design. It is called from the read paths, and somebody who has just read their
 * messages must not see an error because a bell row would not update. Failures are logged, never
 * thrown — the message really was read, and the worst case is a stale badge the next read clears.
 *
 * Returns how many rows were cleared, so a caller can report it and a test can assert it did
 * something.
 */
export async function clearMessageNotificationsByMessageIds(
  userEmail: string,
  messageIds: string[],
): Promise<number> {
  if (!userEmail || messageIds.length === 0) return 0;
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_email', userEmail)
    .eq('type', 'message')
    .in('source_id', messageIds)
    .eq('is_read', false)
    .select('id');
  if (error) {
    console.warn('[message-read] could not clear bell notifications by message id', {
      userEmail,
      count: messageIds.length,
      error: error.message,
    });
    return 0;
  }
  return (data ?? []).length;
}
