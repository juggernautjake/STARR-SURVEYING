// lib/notifications/time-off-decision.ts
//
// Slice 2b of hub-widget-excellence-03-notifications. Pure payload
// builder for the "your time-off request was approved/denied"
// notification. Dependency-free so it's unit-testable; the route maps
// the payload through `notify`.

export interface TimeOffRequestRow {
  assigned_to?: string | null;
  title?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface TimeOffDecisionNotification {
  user_email: string;
  type: 'approval';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'time_off_decision';
}

/**
 * Build the approve/deny notification for a time-off request, addressed
 * to the requester (`assigned_to`). Returns null when there's no
 * requester to notify. `approved` selects the copy/icon.
 */
export function buildTimeOffDecisionNotification(
  request: TimeOffRequestRow,
  approved: boolean,
): TimeOffDecisionNotification | null {
  const user_email = request.assigned_to?.trim();
  if (!user_email) return null;

  const status = approved ? 'approved' : 'denied';
  const statusTitle = approved ? 'Approved' : 'Denied';
  const icon = approved ? '✅' : '🚫';
  const range = formatDateRange(request.start_time, request.end_time);

  return {
    user_email,
    type: 'approval',
    title: `${icon} Time off ${statusTitle}`,
    body: range
      ? `Your time-off request for ${range} was ${status}.`
      : `Your time-off request was ${status}.`,
    icon,
    link: '/admin/time-off',
    source_type: 'time_off_decision',
  };
}

/** "2026-05-30" for a single day, "2026-05-30 – 2026-06-02" for a span.
 *  Uses the ISO date portion so it's timezone-stable. */
function formatDateRange(startIso?: string | null, endIso?: string | null): string {
  const start = isoDate(startIso);
  const end = isoDate(endIso);
  if (!start) return '';
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}

function isoDate(iso?: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : '';
}
