// lib/hub/performance-budget.ts
//
// Performance budget guard. Counts "high-traffic" widgets (those that
// fetch on mount + auto-refresh) and warns the user when they're
// about to add a 9th to their layout.
//
// Slice 154 of customizable-hub-and-work-mode-2026-05-28.md.

import type { WidgetInstance } from './types';

/** Widget ids that perform a network fetch on mount + are likely to
 *  refresh periodically. Static catalog — easier than threading a
 *  flag through every widget definition. New widgets that hit the
 *  network should be added here. */
export const HIGH_TRAFFIC_WIDGET_IDS: ReadonlySet<string> = new Set([
  'my-jobs', 'my-pay', 'pto-balance', 'today-schedule',
  'pending-receipts', 'pending-time-off', 'team-status',
  'messages', 'open-discussions', 'mentions-inbox',
  'recent-announcements', 'class-assignments', 'roadmap-progress',
  'flashcards-due', 'quiz-history', 'recommended-lessons',
  'streak-counter', 'hours-this-week', 'equipment-out-today',
  'maintenance-due', 'low-consumables', 'vehicles-status',
  'recent-drawings', 'drawings-in-progress', 'active-research-projects',
  'pipeline-status', 'assignments-due', 'crew-calendar',
  'field-data-pending', 'job-activity-feed', 'pending-hours',
  'monthly-revenue', 'outstanding-invoices', 'weather',
  'mileage-tracker', 'sun-calculator',
]);

/** Max number of high-traffic widgets before we surface a warning. */
export const PERFORMANCE_BUDGET_LIMIT = 8;

/** Returns the current number of high-traffic widgets on the layout. */
export function highTrafficWidgetCount(widgets: WidgetInstance[]): number {
  return widgets.filter((w) => HIGH_TRAFFIC_WIDGET_IDS.has(w.type)).length;
}

/** Returns true when adding a widget of the given type would push the
 *  layout over the performance budget. Use this to gate the Add-Widget
 *  modal's confirm dialog. */
export function wouldExceedBudget(widgets: WidgetInstance[], addingType: string): boolean {
  if (!HIGH_TRAFFIC_WIDGET_IDS.has(addingType)) return false;
  return highTrafficWidgetCount(widgets) >= PERFORMANCE_BUDGET_LIMIT;
}
