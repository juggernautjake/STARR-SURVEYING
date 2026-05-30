// lib/hub/widgets/_shared/widget-links.ts
//
// Slice 2 of hub-widget-excellence-02-shared-infra. The single source
// of truth for every widget's "Go to…" footer destination + the
// row-level deep-link builders. Centralizing here means a route change
// is one edit, and a "no dead links" audit (master checklist criterion
// 2) can run against this map.
//
// All routes were verified to exist in the 2026-05-30 route audit (see
// the master doc). Per the user ("most widgets, not all"), launcher /
// ambient / pure-stat widgets are listed in WIDGETS_WITHOUT_LINK and
// intentionally get NO footer link.
//
// Pure data + string builders only — no React, no fetch — so the whole
// thing is trivially unit-testable.

export interface WidgetGoToTarget {
  /** Canonical destination route for the widget's domain. */
  href: string;
  /** Label rendered as "Go to {label} →". */
  label: string;
}

/** widget id → its canonical "Go to…" footer destination. Only widgets
 *  that own a domain page appear here. */
export const WIDGET_LINKS: Readonly<Record<string, WidgetGoToTarget>> = {
  // work
  // hub-widget-routing 2026-05-30 — `my-jobs` widget's "Go to…" link
  // points at the org-wide `/admin/jobs` page (the main jobs list)
  // instead of the personal `/admin/my-jobs` filter. The widget's
  // header still shows the user's own jobs; the footer link gives
  // them a one-click jump to every job they can see.
  'my-jobs': { href: '/admin/jobs', label: 'jobs' },
  'assignments-due': { href: '/admin/assignments', label: 'assignments' },
  'field-data-pending': { href: '/admin/field-data', label: 'field data' },
  'job-activity-feed': { href: '/admin/jobs', label: 'jobs' },
  // time-pay
  'my-pay': { href: '/admin/my-pay', label: 'my pay' },
  'hours-this-week': { href: '/admin/my-hours', label: 'my hours' },
  'pto-balance': { href: '/admin/time-off', label: 'time off' },
  // financial
  'monthly-revenue': { href: '/admin/finances', label: 'finances' },
  'outstanding-invoices': { href: '/admin/billing/invoices', label: 'invoices' },
  // office
  'pending-hours': { href: '/admin/hours-approval', label: 'hours approval' },
  'pending-receipts': { href: '/admin/receipts', label: 'receipts' },
  'pending-time-off': { href: '/admin/time-off', label: 'time-off approvals' },
  // equipment
  'equipment-out-today': { href: '/admin/equipment/today', label: 'equipment' },
  'low-consumables': { href: '/admin/equipment/consumables', label: 'consumables' },
  'maintenance-due': { href: '/admin/equipment/maintenance', label: 'maintenance' },
  'vehicles-status': { href: '/admin/vehicles', label: 'vehicles' },
  // cad
  'recent-drawings': { href: '/admin/cad', label: 'the CAD editor' },
  'drawings-in-progress': { href: '/admin/cad', label: 'the CAD editor' },
  'crew-calendar': { href: '/admin/schedule', label: 'the schedule' },
  // research
  'active-research-projects': { href: '/admin/research', label: 'research' },
  'pipeline-status': { href: '/admin/research/pipeline', label: 'the research pipeline' },
  // learning
  'class-assignments': { href: '/admin/learn', label: 'learning' },
  'recommended-lessons': { href: '/admin/learn/modules', label: 'lessons' },
  'roadmap-progress': { href: '/admin/learn/roadmap', label: 'the roadmap' },
  'flashcards-due': { href: '/admin/learn/flashcards', label: 'flashcards' },
  'quiz-history': { href: '/admin/learn/quiz-history', label: 'quiz history' },
  // communication
  messages: { href: '/admin/messages', label: 'messages' },
  'open-discussions': { href: '/admin/discussions', label: 'discussions' },
  'mentions-inbox': { href: '/admin/messages', label: 'messages' },
  'recent-announcements': { href: '/admin/announcements', label: 'announcements' },
  // operational
  'mileage-tracker': { href: '/admin/mileage', label: 'mileage' },
  'team-status': { href: '/admin/team', label: 'the team' },
  // personal
  'today-schedule': { href: '/admin/schedule', label: 'the schedule' },
  'recent-activity': { href: '/admin/timeline', label: 'the timeline' },
};

/** Widgets that intentionally have NO "Go to…" footer link: launchers
 *  (they ARE shortcuts), ambient tools, and pure gamification stats. */
export const WIDGETS_WITHOUT_LINK: ReadonlySet<string> = new Set<string>([
  'quick-actions',
  'pinned-pages',
  'bookmarks',
  'weather',
  'sun-calculator',
  'daily-briefing',
  'streak-counter',
]);

/** The canonical "Go to…" target for a widget, or null when the widget
 *  is intentionally link-less (or unknown). */
export function widgetGoToTarget(widgetId: string): WidgetGoToTarget | null {
  return WIDGET_LINKS[widgetId] ?? null;
}

// ─── Row-level deep-link builders ──────────────────────────────────────
// Each widget row that maps to a detail page uses one of these so the
// row → page route is defined once.

/** A job row → its detail page. */
export function jobHref(jobId: string): string {
  return `/admin/jobs/${jobId}`;
}

/** A drawing/job row → the CAD editor with that job loaded. */
export function cadJobHref(jobId: string): string {
  return `/admin/cad?job=${encodeURIComponent(jobId)}`;
}

/** A message/conversation row → that thread. */
export function conversationHref(conversationId: string): string {
  return `/admin/messages/${conversationId}`;
}

/** A lesson row → that lesson inside its module. */
export function lessonHref(moduleId: string, lessonId: string): string {
  return `/admin/learn/modules/${moduleId}/${lessonId}`;
}

/** An equipment row → its detail page. */
export function equipmentHref(equipmentId: string): string {
  return `/admin/equipment/${equipmentId}`;
}

/** A teammate row → their profile (keyed by email per the route). */
export function teamMemberHref(email: string): string {
  return `/admin/team/${encodeURIComponent(email)}`;
}

/** A research-project row → its detail page. */
export function researchProjectHref(projectId: string): string {
  return `/admin/research/${projectId}`;
}
