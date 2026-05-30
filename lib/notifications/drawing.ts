// lib/notifications/drawing.ts
//
// drawings-collaboration Slice 2 — pure builders for drawing-related
// notifications:
//   - buildDrawingAssignedNotification: fires from PATCH /api/admin/
//     cad/drawings when `assigned_to` lands on a (new, non-actor)
//     email. Targets the assignee.
//   - buildDrawingDueReminders: fires from the daily cron, mirroring
//     the assignment-reminders pattern (boundary-only at 3 / 1 / 0
//     days + one ping for overdue). Targets the assignee.
//   - buildDrawingNoteNotification: fires from POST /api/admin/cad/
//     drawings/{id}/notes (Slice 3) for each recipient.
//
// Every payload links to /admin/cad?job={jobId}&drawing={id} so the
// editor opens with the drawing already loaded. Dependency-free →
// unit-tested in node.

export interface DrawingAssignedInput {
  user_email: string;
  drawing_id: string;
  drawing_name?: string | null;
  job_id?: string | null;
  assigned_by?: string | null;
}

export interface DrawingNoteInput {
  user_email: string;
  drawing_id: string;
  drawing_name?: string | null;
  job_id?: string | null;
  author_email: string;
  body: string;
}

export interface DrawingDueRow {
  id?: string | null;
  name?: string | null;
  assigned_to?: string | null;
  due_date?: string | null; // YYYY-MM-DD
  job_id?: string | null;
}

export interface DrawingNotification {
  user_email: string;
  type: 'drawing';
  source_type: 'drawing_assigned' | 'drawing_note' | 'drawing_due';
  source_id: string;
  title: string;
  body: string;
  icon: string;
  link: string;
  escalation_level?: 'high' | 'normal';
}

/** Build the deep-link the CAD editor honors:
 *    /admin/cad?job=<jobId>&drawing=<drawingId>
 *  Omits the job param when we don't have one (a free-floating
 *  drawing). The bell renders this verbatim. */
export function drawingHref(drawingId: string, jobId?: string | null): string {
  if (jobId) return `/admin/cad?job=${jobId}&drawing=${drawingId}`;
  return `/admin/cad?drawing=${drawingId}`;
}

/** Default day-boundaries at which a not-yet-due drawing reminds. */
export const DRAWING_DUE_BOUNDARIES = [3, 1, 0];

function daysUntilDue(dueDate: string | null | undefined, nowMs: number): number | null {
  const m = dueDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate) : null;
  if (!m) return null;
  const dueUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date(nowMs);
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUtc - nowUtc) / 86_400_000);
}

function preview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > 140 ? `${trimmed.slice(0, 139)}…` : trimmed;
}

/** Drawing assigned to {user_email}. Returns null on missing email /
 *  drawing id. */
export function buildDrawingAssignedNotification(
  input: DrawingAssignedInput,
): DrawingNotification | null {
  const email = input.user_email?.trim().toLowerCase();
  const id = input.drawing_id?.trim();
  if (!email || !id) return null;
  const label = input.drawing_name?.trim() || 'a drawing';
  return {
    user_email: email,
    type: 'drawing',
    source_type: 'drawing_assigned',
    source_id: id,
    title: `🎯 You've been assigned ${label}`,
    body: input.assigned_by
      ? `${input.assigned_by} assigned this drawing to you. Open it in the CAD editor.`
      : `Open the drawing in the CAD editor.`,
    icon: '🎯',
    link: drawingHref(id, input.job_id),
  };
}

/** A note left on a drawing → fan out to each recipient. */
export function buildDrawingNoteNotification(
  input: DrawingNoteInput,
): DrawingNotification | null {
  const email = input.user_email?.trim().toLowerCase();
  const id = input.drawing_id?.trim();
  const body = input.body?.trim();
  if (!email || !id || !body) return null;
  const author = input.author_email?.trim() || 'Someone';
  const label = input.drawing_name?.trim() || 'a drawing';
  return {
    user_email: email,
    type: 'drawing',
    source_type: 'drawing_note',
    source_id: id,
    title: `💬 Note on ${label} from ${author}`,
    body: preview(body),
    icon: '💬',
    link: drawingHref(id, input.job_id),
  };
}

/**
 * Build the due-soon reminder payloads for a batch of assigned
 * drawings at `nowMs`. Mirrors the assignment-reminders contract:
 * skips rows without an assignee / id / due-date, only fires when
 * days-until-due is a boundary OR negative (overdue, one per run).
 */
export function buildDrawingDueReminders(
  rows: readonly DrawingDueRow[],
  nowMs: number,
  boundaries: readonly number[] = DRAWING_DUE_BOUNDARIES,
): DrawingNotification[] {
  const out: DrawingNotification[] = [];
  for (const r of rows) {
    const email = r.assigned_to?.trim().toLowerCase();
    const id = r.id?.trim();
    if (!email || !id) continue;

    const days = daysUntilDue(r.due_date, nowMs);
    if (days == null) continue;

    const overdue = days < 0;
    if (!overdue && !boundaries.includes(days)) continue;

    const label = r.name?.trim() || 'a drawing';
    const dueWhen =
      overdue ? `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` :
      days === 0 ? 'due today' :
      days === 1 ? 'due tomorrow' :
      `due in ${days} days`;

    out.push({
      user_email: email,
      type: 'drawing',
      source_type: 'drawing_due',
      source_id: id,
      title: overdue ? `⏰ ${label} is overdue` : `⏰ ${label} is ${dueWhen}`,
      body: `Open the drawing in the CAD editor to finish it.`,
      icon: '⏰',
      link: drawingHref(id, r.job_id),
      escalation_level: overdue ? 'high' : 'normal',
    });
  }
  return out;
}
