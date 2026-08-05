// app/api/admin/hub/badges/route.ts
//
// UNREAD COUNTS FOR THE HUB, PER WIDGET
// ═════════════════════════════════════
//
// *"If they have that widget or quick action on their hub, it should have a notification icon."*
//
//   GET → { widgets: { [widgetId]: count }, quickActions: { [actionId]: count } }
//
// The badge feed. It reads the signed-in person's OWN unread notifications, groups them by type, and
// maps each type onto the widgets and quick actions it belongs to (`lib/hub/notification-topics.ts`).
//
// ── IT IS A VIEW, NOT A NEW READ-MODEL ──────────────────────────────────────────────────────────
//
// "Unread" is the notification's own state (`is_read = false AND is_dismissed = false`) — the same
// predicate the bell uses. This does not invent a second notion of read. Opening the widget clears
// the badge only in that it clears the underlying notifications through the existing read path; there
// is nothing to keep in sync here.
//
// It also does not decide recipients: it only ever reads `user_email = me`. Who gets a notification
// was settled where the notification was written. This endpoint cannot show somebody a badge for an
// event they were never notified about, which is the property that keeps the badge honest.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  NOTIFICATION_TOPICS,
  badgeCountsForWidgets,
  typesForQuickAction,
  BADGE_ELIGIBLE_QUICK_ACTIONS,
  type UnreadCount,
} from '@/lib/hub/notification-topics';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only the types the hub can badge — no reason to pull raise-history or lesson-complete rows the
  // hub has nowhere to show. Keeps the query small and the mapping the single source of what counts.
  const badgeableTypes = Object.keys(NOTIFICATION_TOPICS);

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('type')
    .eq('user_email', session.user.email)
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .in('type', badgeableTypes);

  // Named, not swallowed: a badge feed that silently returns nothing looks exactly like "all caught
  // up", which is the wrong thing to imply when the query failed.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tally by type.
  const byType = new Map<string, number>();
  for (const row of (data ?? []) as { type: string }[]) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  }
  const unreadByType: UnreadCount[] = [...byType.entries()].map(([type, count]) => ({ type, count }));

  // Every badge-eligible widget, so the client can key off exactly the ones a person has on their
  // hub. `badgeCountsForWidgets` already omits zero totals.
  const allWidgetIds = [...new Set(Object.values(NOTIFICATION_TOPICS).flatMap((t) => t.widgetIds))];
  const widgets = badgeCountsForWidgets(unreadByType, allWidgetIds);

  const quickActions: Record<string, number> = {};
  for (const actionId of BADGE_ELIGIBLE_QUICK_ACTIONS) {
    const total = typesForQuickAction(actionId).reduce((sum, type) => sum + (byType.get(type) ?? 0), 0);
    if (total > 0) quickActions[actionId] = total;
  }

  return NextResponse.json({ widgets, quickActions });
}, { routeName: 'hub/badges' });
