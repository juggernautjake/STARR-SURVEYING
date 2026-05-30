// lib/notifications/assignment.ts
//
// Slice 2e of hub-widget-excellence-03-notifications. Pure payload
// builder for the "you've been assigned a task" notification. Replaces
// the route's hand-rolled inline insert (which ignored priority + due
// date) with a richer, testable payload. Used for both creation and
// admin reassignment. Dependency-free.

export interface AssignmentRow {
  id?: string | null;
  title?: string | null;
  priority?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
}

export interface AssignmentNotification {
  user_email: string;
  type: 'assignment';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'task_assignment';
  source_id: string | undefined;
  escalation_level: 'urgent' | 'high' | 'normal';
}

/**
 * Build the assignment notification addressed to the assignee. Returns
 * null when there's no assignee or title. Body carries the priority and
 * (when present) the due date; escalation tracks the priority.
 */
export function buildAssignmentNotification(
  assignment: AssignmentRow,
): AssignmentNotification | null {
  const user_email = assignment.assigned_to?.trim();
  const title = assignment.title?.trim();
  if (!user_email || !title) return null;

  const priority = assignment.priority?.trim() || 'normal';
  const due = isoDate(assignment.due_date);
  const escalation_level = priority === 'urgent' ? 'urgent' : priority === 'high' ? 'high' : 'normal';

  const body = [
    `Priority: ${priority}`,
    due ? `Due ${due}` : null,
  ].filter(Boolean).join(' · ');

  return {
    user_email,
    type: 'assignment',
    title: `📋 New Assignment: ${title}`,
    body,
    icon: '📋',
    link: '/admin/assignments',
    source_type: 'task_assignment',
    source_id: assignment.id ?? undefined,
    escalation_level,
  };
}

/** ISO date portion (timezone-stable) or '' when missing/unparseable. */
function isoDate(value?: string | null): string {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : '';
}
