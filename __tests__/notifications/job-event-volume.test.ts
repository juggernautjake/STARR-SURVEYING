// __tests__/notifications/job-event-volume.test.ts — slices N1 and N4 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Two rules, both of which fail by making somebody hear nothing:
//
//   · who is on this job — the resolver that replaced `resolveStageRecipients`, which had never
//     heard of `removed_at` or `declined_at` and so notified people who had left;
//   · how loudly — an unrecognised preference must never resolve to silence, because a typo that
//     stops somebody being told is a bug nobody can see from either end.

import { describe, it, expect } from 'vitest';
import { jobRecipients, type JobTeamMemberRow } from '@/lib/notifications/job-event';
import {
  channelFor, routeRecipients, indexPrefs, composeDigest, isDigestHour,
  DEFAULT_JOB_EVENT_CHANNELS,
} from '@/lib/notifications/job-prefs';

const member = (email: string, extra: Partial<JobTeamMemberRow> = {}): JobTeamMemberRow =>
  ({ user_email: email, removed_at: null, declined_at: null, ...extra });

describe('who is on this job', () => {
  it('is the active crew plus the lead RPLS, without the actor', () => {
    const out = jobRecipients(
      [member('crew@x.com'), member('hand@x.com'), member('boss@x.com')],
      'rpls@x.com',
      'boss@x.com',
    );
    expect(out).toEqual(['crew@x.com', 'hand@x.com', 'rpls@x.com']);
  });

  it('drops somebody who has been removed from the job', () => {
    // Telling them is a leak, not a courtesy — and this is the case the old stage-change resolver
    // got wrong, because it was handed a flat list of emails with no state on them.
    const out = jobRecipients(
      [member('crew@x.com'), member('gone@x.com', { removed_at: '2026-08-01T00:00:00Z' })],
      null, 'boss@x.com',
    );
    expect(out).toEqual(['crew@x.com']);
  });

  it('drops somebody who declined', () => {
    // They said no. Continuing to notify them is how notifications get muted.
    const out = jobRecipients(
      [member('crew@x.com'), member('nope@x.com', { declined_at: '2026-08-01T00:00:00Z' })],
      null, 'boss@x.com',
    );
    expect(out).toEqual(['crew@x.com']);
  });

  it('includes the lead RPLS with no job_team row at all', () => {
    // They are accountable for the job whether or not anybody added them to the crew list.
    expect(jobRecipients([], 'rpls@x.com', 'boss@x.com')).toEqual(['rpls@x.com']);
  });

  it('does not notify the lead RPLS about their own action', () => {
    expect(jobRecipients([member('crew@x.com')], 'rpls@x.com', 'RPLS@x.com')).toEqual(['crew@x.com']);
  });

  it('de-dupes case-insensitively, keeping first-seen casing', () => {
    const out = jobRecipients(
      [member('Crew@X.com'), member('crew@x.com'), member('  ')],
      'CREW@x.com', 'boss@x.com',
    );
    expect(out).toEqual(['Crew@X.com']);
  });

  it('excludes anybody already told individually', () => {
    // Adding somebody to a crew sends THEM "you are on this job" and the crew "somebody joined".
    // Without this they get both; the dodge of passing them as the actor silences the wrong person
    // and lets the real actor notify themselves.
    const out = jobRecipients(
      [member('crew@x.com'), member('new@x.com')],
      null, 'admin@x.com', ['new@x.com'],
    );
    expect(out).toEqual(['crew@x.com']);
  });

  it('takes an empty exclusion list without excluding everybody', () => {
    expect(jobRecipients([member('crew@x.com')], null, 'a@x.com', [])).toEqual(['crew@x.com']);
    expect(jobRecipients([member('crew@x.com')], null, 'a@x.com', [null, undefined, ''])).toEqual(['crew@x.com']);
  });
});

describe('how loudly', () => {
  it('interrupts for the things that change your day', () => {
    for (const kind of ['stage_changed', 'schedule_changed', 'briefing_published', 'team_changed'] as const) {
      expect(DEFAULT_JOB_EVENT_CHANNELS[kind], kind).toBe('immediate');
    }
  });

  it('digests the log of somebody working', () => {
    // These are the ones that arrive four at a time. Nothing is dropped — they land in one message.
    for (const kind of ['file_uploaded', 'photo_uploaded', 'receipt_linked', 'briefing_appended'] as const) {
      expect(DEFAULT_JOB_EVENT_CHANNELS[kind], kind).toBe('digest');
    }
  });

  it('defaults nothing to off', () => {
    // `off` loses information. It is a choice somebody makes, never one the product makes for them.
    expect(Object.values(DEFAULT_JOB_EVENT_CHANNELS)).not.toContain('off');
  });

  it('honours a stored preference over the default', () => {
    expect(channelFor('file_uploaded', { user_email: 'a@x.com', channels: { file_uploaded: 'immediate' } }))
      .toBe('immediate');
    expect(channelFor('stage_changed', { user_email: 'a@x.com', channels: { stage_changed: 'off' } }))
      .toBe('off');
  });

  it('falls back to the default for a kind the row has never heard of', () => {
    // The whole reason `channels` is a sparse JSONB map: an event added next month is configured
    // the day it ships, rather than unset for everybody until somebody backfills a column.
    expect(channelFor('briefing_published', { user_email: 'a@x.com', channels: { file_uploaded: 'off' } }))
      .toBe('immediate');
  });

  it('never silences somebody because of a bad stored value', () => {
    // A typo, a half-written migration, a client sending "Immediate". Failing closed here means a
    // person stops being told and nobody finds out.
    for (const bad of ['Immediate', 'silent', '', 'null', 'DIGEST']) {
      expect(channelFor('stage_changed', { user_email: 'a@x.com', channels: { stage_changed: bad } }), bad)
        .toBe('immediate');
    }
  });

  it('gives an unknown event kind the loud default rather than dropping it', () => {
    expect(channelFor('something_new_nobody_added_here', null)).toBe('immediate');
  });

  it('splits a crew by what each of them asked for', () => {
    const prefs = indexPrefs([
      { user_email: 'quiet@x.com', channels: { file_uploaded: 'off' } },
      { user_email: 'LOUD@x.com', channels: { file_uploaded: 'immediate' } },
    ]);
    const routed = routeRecipients(['quiet@x.com', 'loud@x.com', 'default@x.com'], 'file_uploaded', prefs);
    expect(routed.off).toEqual(['quiet@x.com']);
    expect(routed.immediate).toEqual(['loud@x.com']);
    // No preference row → the code default, which for a file upload is the digest.
    expect(routed.digest).toEqual(['default@x.com']);
  });

  it('matches a preference to a person whatever the casing', () => {
    // `job_team` and a settings page written months apart do not agree about capitalisation, and a
    // preference that silently fails to apply reads as the setting being ignored.
    const prefs = indexPrefs([{ user_email: 'Hank@X.com', channels: { stage_changed: 'off' } }]);
    expect(routeRecipients(['HANK@x.com'], 'stage_changed', prefs).off).toEqual(['HANK@x.com']);
  });
});

describe('the digest', () => {
  const line = (title: string, at: string, link = '/admin/jobs/1') =>
    ({ kind: 'file_uploaded', title, link, created_at: at });

  it('is nothing at all when nothing was queued', () => {
    expect(composeDigest([])).toBeNull();
  });

  it('names the job when everything happened on one', () => {
    const d = composeDigest([
      line('2026-014 · Hensley — file added', '2026-08-14T15:00:00Z'),
      line('2026-014 · Hensley — photo added', '2026-08-14T16:00:00Z'),
    ])!;
    expect(d.title).toContain('2026-014 · Hensley');
    expect(d.title).toContain('2 updates');
    // The job is named once in the title, so the lines do not repeat it.
    expect(d.body).toBe('· file added\n· photo added');
  });

  it('counts the jobs when they are spread across several', () => {
    // "3 things happened" on one job and across three jobs are different situations, and the reader
    // is deciding whether to pick up the phone at all.
    const d = composeDigest([
      line('A — file added', '2026-08-14T15:00:00Z'),
      line('B — photo added', '2026-08-14T16:00:00Z'),
    ])!;
    expect(d.title).toBe('2 updates on 2 jobs today');
    expect(d.body).toContain('A\n· file added');
    expect(d.body).toContain('B\n· photo added');
  });

  it('reads "1 update" rather than "1 updates"', () => {
    expect(composeDigest([line('A — file added', '2026-08-14T15:00:00Z')])!.title).toContain('1 update today');
  });

  it('links to the most recent thing, not to a list page', () => {
    const d = composeDigest([
      line('A — first', '2026-08-14T15:00:00Z', '/admin/jobs/first'),
      line('A — last', '2026-08-14T18:00:00Z', '/admin/jobs/last'),
    ])!;
    expect(d.link).toBe('/admin/jobs/last');
  });

  it('orders by when things happened, not by the order they were read', () => {
    const d = composeDigest([
      line('A — second', '2026-08-14T18:00:00Z'),
      line('A — first', '2026-08-14T15:00:00Z'),
    ])!;
    expect(d.body.indexOf('first')).toBeLessThan(d.body.indexOf('second'));
  });

  it('survives a title with no job prefix', () => {
    const d = composeDigest([line('something happened', '2026-08-14T15:00:00Z')])!;
    expect(d.title).toContain('1 update');
    expect(d.body).toContain('something happened');
  });
});

describe('when the digest goes out', () => {
  it('is 5pm for somebody who never chose', () => {
    expect(isDigestHour(17, null)).toBe(true);
    expect(isDigestHour(9, null)).toBe(false);
  });

  it('is the hour they chose', () => {
    expect(isDigestHour(7, { user_email: 'a@x.com', digest_hour: 7 })).toBe(true);
    expect(isDigestHour(17, { user_email: 'a@x.com', digest_hour: 7 })).toBe(false);
  });

  it('handles midnight as an hour rather than as a missing value', () => {
    // `digest_hour: 0` is falsy. A `||` fallback here would silently move everybody who chose
    // midnight to 5pm, and they would report it as the setting not saving.
    expect(isDigestHour(0, { user_email: 'a@x.com', digest_hour: 0 })).toBe(true);
    expect(isDigestHour(17, { user_email: 'a@x.com', digest_hour: 0 })).toBe(false);
  });

  it('falls back to 5pm for an impossible hour rather than never sending', () => {
    expect(isDigestHour(17, { user_email: 'a@x.com', digest_hour: 99 })).toBe(true);
    expect(isDigestHour(17, { user_email: 'a@x.com', digest_hour: -3 })).toBe(true);
  });
});
