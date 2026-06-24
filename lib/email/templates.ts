// lib/email/templates.ts
// Reusable email templates for the admin composer (doc 04, slice EM3). Each
// template carries a subject + body with square-bracket placeholders the sender
// edits before sending. Pure data + a tiny fill helper so it's unit-testable and
// reusable from any surface (composer today, automations later).

export interface EmailTemplate {
  id: string;
  label: string;
  description: string;
  subject: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'job-update',
    label: 'Job update',
    description: 'Let a customer know where their survey stands.',
    subject: 'Update on your survey — [Job Address]',
    body: [
      'Hi [Customer Name],',
      '',
      'Quick update on your project at [Job Address]: [status / what we did].',
      '',
      'Next, we plan to [next step] on or around [date]. We\'ll follow up if anything changes.',
      '',
      'Thanks,',
      'Starr Surveying',
    ].join('\n'),
  },
  {
    id: 'quote-follow-up',
    label: 'Quote follow-up',
    description: 'Nudge a lead who received a quote.',
    subject: 'Following up on your survey quote',
    body: [
      'Hi [Customer Name],',
      '',
      'I wanted to follow up on the quote we sent for [Job Address / scope]. Do you have any',
      'questions, or would you like to get on the schedule?',
      '',
      'Happy to adjust the scope if that helps. Just reply here and we\'ll take it from there.',
      '',
      'Thanks,',
      'Starr Surveying',
    ].join('\n'),
  },
  {
    id: 'schedule-reminder',
    label: 'Schedule reminder',
    description: 'Confirm an upcoming visit with a customer.',
    subject: 'Reminder: survey crew on-site [Date]',
    body: [
      'Hi [Customer Name],',
      '',
      'This is a reminder that our crew is scheduled to be on-site at [Job Address] on',
      '[Date] around [Time]. Please make sure the property is accessible (gates/animals).',
      '',
      'If you need to reschedule, just reply and let us know.',
      '',
      'Thanks,',
      'Starr Surveying',
    ].join('\n'),
  },
  {
    id: 'crew-dispatch',
    label: 'Crew dispatch (employee)',
    description: 'Send an assignment to a field employee.',
    subject: 'Assignment: [Job Address] on [Date]',
    body: [
      'Hi [Employee Name],',
      '',
      'You\'re assigned to [Job Address] on [Date], starting around [Time].',
      'Scope: [what to do]. Equipment: [equipment].',
      '',
      'Clock in when you arrive and message me with any issues.',
      '',
      'Thanks,',
      'Starr Surveying',
    ].join('\n'),
  },
];

/** Look up a template by id. Returns null when not found. */
export function getEmailTemplate(id: string): EmailTemplate | null {
  return EMAIL_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Replace `[Placeholder]` tokens with provided values (case-insensitive key
 * match on the inner text). Unmatched placeholders are left intact so the
 * sender still sees what to fill in.
 */
export function fillTemplate(text: string, values: Record<string, string> = {}): string {
  const lookup = new Map(Object.entries(values).map(([k, v]) => [k.trim().toLowerCase(), v]));
  return text.replace(/\[([^\]]+)\]/g, (whole, inner: string) => {
    const hit = lookup.get(inner.trim().toLowerCase());
    return hit != null && hit !== '' ? hit : whole;
  });
}
