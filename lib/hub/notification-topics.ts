// lib/hub/notification-topics.ts
//
// WHICH WIDGET DOES AN EVENT BELONG TO?
// ═════════════════════════════════════
//
// *"If an employee submits hours, for whoever needs to be notified about that event, then if they
// have that widget or quick action on their hub, it should have a notification icon. This should
// work for jobs and stuff too."*
//
// The spine of the hub badge. It maps a notification `type` to the widgets and quick actions that
// represent it, so a badge can be drawn on the right tile.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
//
// It does NOT decide who gets notified. That is already decided where the notification is written —
// hours go to admins who can approve, research goes to its initiator, and so on. Re-deriving
// recipients here would be a second, drifting copy of that decision, which is the defect this whole
// codebase keeps finding. A badge is a *view* of notifications that already exist, filtered to the
// tile they belong on.
//
// It is also not the system of record. Somebody without the Hours widget still gets the hours
// notification in their bell — the widget badge is a convenience on top, not a gate. So a `type`
// with no widget mapping is fine: it simply shows nowhere on the hub and everywhere it already did.
//
// ── KEYED ON `type`, NOT PARSED FROM TEXT ───────────────────────────────────────────────────────
//
// The map keys off the stored notification `type`, an enum-like string set at the write site. It
// never reads the title or body — matching on prose is how a wording change silently unhooks a
// badge. When a new notification type is introduced, add it here in the same change.

/** Widget ids come from lib/hub/widgets/<name>/index.tsx; quick-action ids from quick-actions-catalog.ts. */
export interface Topic {
  widgetIds: readonly string[];
  quickActionIds: readonly string[];
}

/**
 * type → the tiles it belongs on.
 *
 * Grouped by the owner's five areas. A single event can light up more than one tile — an hours
 * submission belongs on both the pending-hours queue and the approvals widget — and that is
 * correct: they are different views of the same thing.
 */
export const NOTIFICATION_TOPICS: Readonly<Record<string, Topic>> = {
  // ── Hours ──
  hours_submitted: { widgetIds: ['pending-hours', 'approvals', 'hours-this-week'], quickActionIds: [] },
  hours_resubmitted: { widgetIds: ['pending-hours', 'approvals', 'hours-this-week'], quickActionIds: [] },
  hours_decision: { widgetIds: ['hours-this-week', 'my-pay'], quickActionIds: [] },
  hours_pay_decided: { widgetIds: ['my-pay', 'hours-this-week'], quickActionIds: [] },

  // ── Pay ──
  payout_queued: { widgetIds: ['my-pay', 'money'], quickActionIds: [] },
  payout_prepared: { widgetIds: ['money', 'my-pay'], quickActionIds: [] },
  payout: { widgetIds: ['my-pay', 'money'], quickActionIds: [] },
  pay_stub: { widgetIds: ['my-pay'], quickActionIds: [] },
  pay_raise: { widgetIds: ['my-pay'], quickActionIds: [] },
  pay_raise_recorded: { widgetIds: ['my-pay'], quickActionIds: [] },
  pay_advance_decision: { widgetIds: ['my-pay'], quickActionIds: [] },
  advance_requested: { widgetIds: ['approvals', 'money'], quickActionIds: [] },
  payment: { widgetIds: ['money', 'outstanding-invoices'], quickActionIds: [] },

  // ── Invoices ──
  invoice: { widgetIds: ['outstanding-invoices', 'money'], quickActionIds: [] },
  invoice_paid: { widgetIds: ['outstanding-invoices', 'money'], quickActionIds: [] },
  invoice_overdue: { widgetIds: ['outstanding-invoices', 'money'], quickActionIds: [] },

  // ── Jobs ──
  job: { widgetIds: ['my-jobs', 'job-activity-feed'], quickActionIds: ['new-job'] },
  job_assignment: { widgetIds: ['my-jobs', 'job-activity-feed'], quickActionIds: [] },
  job_update: { widgetIds: ['my-jobs', 'job-activity-feed'], quickActionIds: [] },
  job_stage: { widgetIds: ['my-jobs', 'job-activity-feed', 'pipeline-status'], quickActionIds: [] },
  job_team: { widgetIds: ['my-jobs', 'job-activity-feed'], quickActionIds: [] },
  assignment: { widgetIds: ['my-jobs', 'assignments-due'], quickActionIds: [] },

  // ── Employee / approvals ──
  approval: { widgetIds: ['approvals'], quickActionIds: ['approve-receipts'] },
  pay_advance_requests: { widgetIds: ['approvals'], quickActionIds: [] },

  // ── Receipts ──
  missing_receipt: { widgetIds: ['pending-receipts'], quickActionIds: ['capture-receipt'] },

  // ── Research ──
  research_complete: { widgetIds: ['active-research-projects', 'pipeline-status'], quickActionIds: [] },
  property_search: { widgetIds: ['active-research-projects', 'pipeline-status'], quickActionIds: [] },
};

/** Every widget id that any topic maps to. Used to know which tiles are badge-eligible at all. */
export const BADGE_ELIGIBLE_WIDGETS: ReadonlySet<string> = new Set(
  Object.values(NOTIFICATION_TOPICS).flatMap((t) => t.widgetIds),
);

/** Every quick-action id that any topic maps to. */
export const BADGE_ELIGIBLE_QUICK_ACTIONS: ReadonlySet<string> = new Set(
  Object.values(NOTIFICATION_TOPICS).flatMap((t) => t.quickActionIds),
);

/** The notification types that map to a given widget. Inverse of the map, for the count query. */
export function typesForWidget(widgetId: string): string[] {
  return Object.entries(NOTIFICATION_TOPICS)
    .filter(([, topic]) => topic.widgetIds.includes(widgetId))
    .map(([type]) => type);
}

/** The notification types that map to a given quick action. */
export function typesForQuickAction(actionId: string): string[] {
  return Object.entries(NOTIFICATION_TOPICS)
    .filter(([, topic]) => topic.quickActionIds.includes(actionId))
    .map(([type]) => type);
}

export interface UnreadCount {
  type: string;
  count: number;
}

/**
 * Given a person's unread counts by type, total the ones that belong to each of their widgets.
 *
 * Pure, so the badge arithmetic is testable without a database. `widgetIds` is what the person
 * actually has on their hub — a badge is per-person and per-widget, so a widget they do not have
 * contributes nothing here even if the events exist.
 *
 * A `type` appearing under two widgets is counted under BOTH — they are different views, and each
 * should reflect its own share. It is not double-counting within one widget: a `Map` de-dupes types
 * per widget so the same type listed twice in a topic (it never is, but defensively) cannot inflate.
 */
export function badgeCountsForWidgets(
  unreadByType: readonly UnreadCount[],
  widgetIds: readonly string[],
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const c of unreadByType) counts.set(c.type, (counts.get(c.type) ?? 0) + Math.max(0, c.count | 0));

  const out: Record<string, number> = {};
  for (const widgetId of widgetIds) {
    const types = new Set(typesForWidget(widgetId));
    let total = 0;
    for (const type of types) total += counts.get(type) ?? 0;
    if (total > 0) out[widgetId] = total;
  }
  return out;
}
