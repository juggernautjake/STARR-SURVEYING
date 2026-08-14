// __tests__/jobs/job-event-recipients.test.ts — slice N1 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner: *"Every time something happens with a job that someone is assigned to, they should get a
// notification about that thing."*
//
// "Someone that is assigned to it" is the whole rule, and it has four edges that each look like a
// detail and each produce a complaint:
//
//   · somebody removed from the crew still hearing about the job — a leak, not a courtesy;
//   · somebody who DECLINED the assignment still being notified — how people learn to mute an app;
//   · the person who just did the thing being told they did it;
//   · the lead RPLS hearing nothing because nobody added them to the crew list.
//
// The stage-change helper this generalises handled the third and, by omission, none of the others.

import { describe, it, expect } from 'vitest';
import { jobRecipients, type JobTeamMemberRow } from '@/lib/notifications/job-event';

const m = (email: string, extra: Partial<JobTeamMemberRow> = {}): JobTeamMemberRow => ({
  user_email: email, removed_at: null, declined_at: null, ...extra,
});

describe('who hears about a job event', () => {
  it('is the active crew', () => {
    const out = jobRecipients([m('a@x.com'), m('b@x.com')], null, null);
    expect(out).toEqual(['a@x.com', 'b@x.com']);
  });

  it('excludes the person who did it', () => {
    const out = jobRecipients([m('a@x.com'), m('b@x.com')], null, 'a@x.com');
    expect(out).toEqual(['b@x.com']);
  });

  it('excludes the actor whatever the casing', () => {
    // Two rows for one person is the ordinary shape of this bug: the team row and the session email
    // rarely agree on case.
    const out = jobRecipients([m('Hank@X.com')], null, 'hank@x.com');
    expect(out).toEqual([]);
  });

  it('drops somebody who has been removed from the job', () => {
    const out = jobRecipients([m('a@x.com', { removed_at: '2026-08-01T00:00:00Z' }), m('b@x.com')], null, null);
    expect(out).toEqual(['b@x.com']);
  });

  it('drops somebody who declined the assignment', () => {
    // They said no. Continuing to notify them is exactly how a person starts ignoring the app.
    const out = jobRecipients([m('a@x.com', { declined_at: '2026-08-01T00:00:00Z' }), m('b@x.com')], null, null);
    expect(out).toEqual(['b@x.com']);
  });

  it('includes the lead RPLS even with no crew row', () => {
    // They are accountable for the job whether or not anybody remembered to add them to the crew.
    const out = jobRecipients([], 'rpls@x.com', null);
    expect(out).toEqual(['rpls@x.com']);
  });

  it('does not tell the lead RPLS twice when they are also on the crew', () => {
    const out = jobRecipients([m('rpls@x.com')], 'RPLS@x.com', null);
    expect(out).toEqual(['rpls@x.com']);
  });

  it('does not tell the lead RPLS when they are the actor', () => {
    const out = jobRecipients([m('a@x.com')], 'rpls@x.com', 'rpls@x.com');
    expect(out).toEqual(['a@x.com']);
  });

  it('de-dupes and keeps first-seen casing', () => {
    const out = jobRecipients([m('Hank@X.com'), m('hank@x.com')], null, null);
    expect(out).toEqual(['Hank@X.com']);
  });

  it('survives blank and null emails without emitting them', () => {
    const out = jobRecipients([m(''), { user_email: null }, m('  '), m('b@x.com')], null, null);
    expect(out).toEqual(['b@x.com']);
  });

  it('returns nothing rather than throwing on an empty job', () => {
    expect(jobRecipients([], null, null)).toEqual([]);
  });
});
