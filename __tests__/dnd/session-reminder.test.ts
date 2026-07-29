// __tests__/dnd/session-reminder.test.ts — "we play tomorrow" into Discord (P10-4b).
//
// The second half of P10-4. The deciding is pure so it can be tested against a FIXED CLOCK rather than by
// waiting a day — the sending is deliberately unobservable, so the choosing must not be.
//
// The interesting assertions are all about the word "tomorrow", which is a calendar word rather than a
// 24-hour interval. A session at 7pm Friday is "tomorrow" from any time on Thursday, including 11pm; a
// timestamp comparison calls that 20 hours and files it under "today".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sessionsToRemind, reminderToDiscordMessage, localDay, localTime, REMINDER_TIMEZONE,
  type ReminderSession,
} from '@/lib/dnd/session-reminder';
import { tallyRsvps } from '@/lib/dnd/rsvp';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** 2026-07-29 is a Wednesday. All times below are UTC unless the assertion says otherwise. */
const NOW = new Date('2026-07-29T18:00:00.000Z'); // 1pm Central
const session = (over: Partial<ReminderSession> = {}): ReminderSession => ({
  id: 's1', campaign_id: 'c1', title: 'The Sunless Road', scheduled_at: '2026-07-30T00:00:00.000Z', ...over,
});

describe('which sessions get a reminder', () => {
  it('the day before and the day of — and nothing else', () => {
    const rows = [
      session({ id: 'today', scheduled_at: '2026-07-30T00:00:00.000Z' }),    // 7pm Jul 29 Central
      session({ id: 'tomorrow', scheduled_at: '2026-07-31T00:00:00.000Z' }), // 7pm Jul 30 Central
      session({ id: 'in-three', scheduled_at: '2026-08-02T00:00:00.000Z' }),
      session({ id: 'yesterday', scheduled_at: '2026-07-29T00:00:00.000Z' }),
    ];
    expect(sessionsToRemind(rows, NOW).map((r) => `${r.sessionId}:${r.bucket}`))
      .toEqual(['today:today', 'tomorrow:tomorrow']);
  });

  it('LATE ON THE EVE STILL COUNTS AS "TOMORROW"', () => {
    // 11pm Central on the 29th, for a session at 7pm on the 30th — 20 hours away. A `< 24h` rule files
    // this under "today" and tells the table they play tonight.
    const lateNow = new Date('2026-07-30T04:00:00.000Z'); // 11pm Jul 29 Central
    const out = sessionsToRemind([session({ scheduled_at: '2026-07-31T00:00:00.000Z' })], lateNow);
    expect(out).toHaveLength(1);
    expect(out[0].bucket).toBe('tomorrow');
  });

  it('and early on the day counts as "today", however many hours away it is', () => {
    // 8am Central for a 7pm session — 11 hours. Same day, so: today.
    const earlyNow = new Date('2026-07-29T13:00:00.000Z');
    const out = sessionsToRemind([session({ scheduled_at: '2026-07-30T00:00:00.000Z' })], earlyNow);
    expect(out[0].bucket).toBe('today');
  });

  it('skips a session already marked done', () => {
    expect(sessionsToRemind([session({ status: 'done' })], NOW)).toEqual([]);
    expect(sessionsToRemind([session({ status: 'live' })], NOW)).toHaveLength(1);
    expect(sessionsToRemind([session({ status: 'prep' })], NOW)).toHaveLength(1);
  });

  it('skips an unscheduled session, because there is nothing to announce', () => {
    expect(sessionsToRemind([session({ scheduled_at: null })], NOW)).toEqual([]);
    expect(sessionsToRemind([session({ scheduled_at: 'not a date' })], NOW)).toEqual([]);
  });

  it('today’s reminders sort before tomorrow’s, then by clock time', () => {
    const rows = [
      session({ id: 'b', scheduled_at: '2026-07-31T02:00:00.000Z' }),
      session({ id: 'a', scheduled_at: '2026-07-31T00:00:00.000Z' }),
      session({ id: 'now', scheduled_at: '2026-07-30T01:00:00.000Z' }),
    ];
    expect(sessionsToRemind(rows, NOW).map((r) => r.sessionId)).toEqual(['now', 'a', 'b']);
  });

  it('and survives junk without throwing', () => {
    expect(sessionsToRemind([], NOW)).toEqual([]);
    expect(sessionsToRemind(undefined as unknown as ReminderSession[], NOW)).toEqual([]);
    expect(sessionsToRemind([null as unknown as ReminderSession], NOW)).toEqual([]);
  });
});

describe('the timezone is the campaign’s day, not UTC’s', () => {
  it('localDay reports the CENTRAL date, which differs from UTC late in the evening', () => {
    // 1am UTC on the 30th is still 8pm on the 29th in Chicago. Bucketing on the UTC date would post
    // "tomorrow" to a table that plays tonight.
    expect(localDay('2026-07-30T01:00:00.000Z')).toBe('2026-07-29');
    expect(localDay('2026-07-30T18:00:00.000Z')).toBe('2026-07-30');
  });

  it('and the default is recorded rather than implied', () => {
    expect(REMINDER_TIMEZONE).toBe('America/Chicago');
  });

  it('an override is honoured, so a future per-campaign timezone is a parameter, not a rewrite', () => {
    expect(localDay('2026-07-30T01:00:00.000Z', 'UTC')).toBe('2026-07-30');
    const out = sessionsToRemind([session({ scheduled_at: '2026-07-30T01:00:00.000Z' })], NOW, 'UTC');
    expect(out[0].bucket).toBe('tomorrow'); // 30th in UTC, 29th in Chicago
  });

  it('and a bad date yields empty rather than "Invalid Date"', () => {
    expect(localDay('nonsense')).toBe('');
    expect(localTime('nonsense')).toBe('');
  });
});

describe('the message', () => {
  const [today] = sessionsToRemind([session({ scheduled_at: '2026-07-30T00:00:00.000Z' })], NOW);

  it('leads with when, and names the session', () => {
    const m = reminderToDiscordMessage(today, { campaignName: 'Wednesday Table' });
    expect(m.content).toContain('**Today');
    expect(m.content).toContain('The Sunless Road');
    expect(m.content).toContain('Wednesday Table');
    // 00:00 UTC is 7pm Central.
    expect(m.content).toContain('7:00 PM');
  });

  it('THE RSVP LINE IS WHY YOU SEND THIS AT ALL', () => {
    // "We play tomorrow" is a calendar's job. "Two of you haven't answered" is what gets a reply.
    const tally = tallyRsvps(
      [{ user_id: 'u1', status: 'yes' }, { user_id: 'u2', status: 'maybe' }],
      ['u1', 'u2', 'u3', 'u4'],
    );
    const m = reminderToDiscordMessage(today, { tally });
    expect(m.content).toContain('1 yes');
    expect(m.content).toContain('1 maybe');
    expect(m.content).toContain('haven’t answered');
  });

  it('and is OMITTED rather than faked when there is no tally', () => {
    // "0 yes" would read as nobody coming, which is a different and much worse message than saying
    // nothing about attendance.
    expect(reminderToDiscordMessage(today, {}).content).not.toContain('yes');
    expect(reminderToDiscordMessage(today, { tally: null }).content).not.toContain('yes');
    const empty = tallyRsvps([], []);
    expect(reminderToDiscordMessage(today, { tally: empty }).content).not.toContain('No members yet');
  });

  it('a campaign name is optional', () => {
    expect(reminderToDiscordMessage(today, {}).content).toContain('The Sunless Road');
  });
});

describe('the cron', () => {
  const route = read('app/api/cron/dnd-session-reminders/route.ts');

  it('is Bearer-gated on CRON_SECRET, like every other cron here', () => {
    expect(route).toContain('`Bearer ${expected}`');
    expect(route).toContain("status: 401");
    // A missing secret must not mean "no auth required".
    expect(route).toMatch(/if \(!expected\)[\s\S]{0,200}status: 500/);
  });

  it('pulls a bounded window rather than the whole table', () => {
    expect(route).toContain("gte('scheduled_at', fromIso)");
    expect(route).toContain("lte('scheduled_at', toIso)");
  });

  it('only posts to campaigns that configured a webhook', () => {
    expect(route).toContain('if (!campaign?.discord_webhook_url) continue;');
  });

  it('and degrades when seeds 460/461 are not applied', () => {
    // Both columns arrive with seeds the owner has not run. A cron that 500s on every run because of that
    // is noise that trains people to ignore cron failures.
    expect(route).toMatch(/discord_webhook_url column missing/);
    expect(route).toMatch(/seed 460 not applied/);
  });

  it('is registered in vercel.json, or it never runs', () => {
    // The whole feature is a scheduled job. Without this line it is an endpoint nobody calls — the same
    // "authored but not wired" shape this audit keeps finding, in its scheduled form.
    const vercel = read('vercel.json');
    expect(vercel).toContain('/api/cron/dnd-session-reminders');
    const cfg = JSON.parse(vercel) as { crons: { path: string; schedule: string }[] };
    const entry = cfg.crons.find((c) => c.path === '/api/cron/dnd-session-reminders');
    expect(entry?.schedule).toBe('0 15 * * *');
  });

  it('and every cron entry points at a route that exists', () => {
    // Derived rather than asserted for this one path: a schedule pointing at a deleted route fails
    // silently, forever.
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string }[] };
    for (const c of cfg.crons) {
      const file = join(process.cwd(), `app${c.path}/route.ts`);
      expect(() => readFileSync(file, 'utf8'), `${c.path} has no route file`).not.toThrow();
    }
  });
});
