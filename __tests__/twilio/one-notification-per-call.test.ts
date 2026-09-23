// __tests__/twilio/one-notification-per-call.test.ts — one call, one email, one bell row.
//
// Owner, 2026-09-23: "whenever someone calls, we get 2-3 emails and 2-3 app notifications. What is
// up with that? I want it so that these notifications are all consolidated into one email and one
// notification."
//
// ── WHAT WAS MEASURED ───────────────────────────────────────────────────────────────────────────
//
// Counted on the live notifications table: exactly 12 rows per call — 2 for each of the 6 people
// with an intake role — on every call in the log. A single call fires several webhooks and each
// inserted its own row.
//
// The two are NOT interchangeable, which is the whole difficulty. The dial webhook fires first with
// "Answered by Hank, 287 seconds. The recording and a summary follow once it is transcribed"; the
// transcript webhook fires minutes later with "Chrissy at Riverway Title called about Starr's 2020
// survey (job 20178) for Lot…". Keeping the first and dropping the second would consolidate to one
// notification and throw away the only one worth reading. So:
//
//   the bell   — one row, REVISED in place when better information arrives
//   the email  — one, and it WAITS for a summary worth sending
//
// These tests hold both ends of that: nothing sends twice, and nothing useful is lost by holding.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { notifyOwners, mailUnnotifiedCalls } from '@/lib/receptionist/notify';
import { expectOrder } from '../helpers/expect-order';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** Records what each channel was asked to do, so a test can assert on absence as well as presence. */
function spy(opts: { notified?: boolean } = {}) {
  const sent: string[] = [];
  const stamped: string[] = [];
  return {
    sent,
    stamped,
    deps: {
      send: async ({ to }: { to: string }) => { sent.push(`sms:${to}`); return true; },
      email: async () => { sent.push('email'); return true; },
      inApp: async () => { sent.push('bell'); return 6; },
      alreadyNotified: async () => opts.notified ?? false,
      stamp: async (id: string) => { stamped.push(id); },
      env: { LEAD_SMS_RECIPIENTS: '+12545550111' },
    },
  };
}

const CALL = { from: '+17132664676', facts: {}, summary: 'Chrissy at Riverway Title called about the 2020 survey.', callId: 'c1', answeredBy: 'owner' as const };

describe('a call that has already been emailed about does not get emailed again', () => {
  it('the later webhook rings the bell and nothing else', async () => {
    const s = spy({ notified: true });
    const out = await notifyOwners(CALL, s.deps);
    // The bell still runs — that is how the row gets REVISED with the better summary.
    expect(s.sent).toEqual(['bell']);
    expect(out).toEqual({ texted: 0, emailed: false, belled: 6 });
  });

  it('the first one does send, so the gate is the stamp and not a silenced notifier', async () => {
    const s = spy({ notified: false });
    const out = await notifyOwners(CALL, s.deps);
    expect(s.sent).toContain('email');
    expect(s.sent).toContain('sms:+12545550111');
    expect(out.emailed).toBe(true);
  });
});

describe('the email waits for a summary worth sending', () => {
  it('a provisional outcome rings the bell but mails nobody', async () => {
    // "Answered by Hank, 287 seconds. The recording and a summary follow once it is transcribed."
    // is not what the owner should find in his inbox when the real summary is four minutes away.
    const s = spy();
    const out = await notifyOwners({ ...CALL, summary: 'Answered by Hank, 287 seconds.', provisional: true }, s.deps);
    expect(s.sent).toEqual(['bell']);
    expect(out.emailed).toBe(false);
    // And critically: nothing is stamped, so the call is still owed an email.
    expect(s.stamped).toEqual([]);
  });

  it('the transcript that follows it does mail, because it is not provisional', async () => {
    const s = spy();
    await notifyOwners(CALL, s.deps);
    expect(s.sent).toContain('email');
  });
});

describe('the stamp is only claimed for something that actually went out', () => {
  it('stamps after a successful send', async () => {
    const s = spy();
    await notifyOwners(CALL, s.deps);
    expect(s.stamped).toEqual(['c1']);
  });

  it('does NOT stamp when every channel failed', async () => {
    // Stamping on the way in would mark the call handled and lose it: no email, and the sweep
    // would skip it forever because the stamp says somebody was told.
    const stamped: string[] = [];
    const out = await notifyOwners(CALL, {
      send: async () => false, email: async () => false, inApp: async () => 6,
      alreadyNotified: async () => false, stamp: async (id: string) => { stamped.push(id); },
      env: { LEAD_SMS_RECIPIENTS: '+12545550111' },
    });
    expect(out.emailed).toBe(false);
    expect(stamped).toEqual([]);
  });
});

describe('a held email is not a lost call', () => {
  it('the sweep exists and is run by the cron that already ticks for transcripts', () => {
    const cron = read('app/api/cron/receptionist-transcripts/route.ts');
    expect(cron).toContain('mailUnnotifiedCalls');
    // After the import, so a transcript that landed this tick is already written and the sweep
    // sends the real summary rather than its fallback text.
    expectOrder(cron, 'importAgentConversations(', 'mailUnnotifiedCalls()', 'sweep runs after the import');
  });

  it('it only looks at calls that have ended and were never mailed about', () => {
    const src = read('lib/receptionist/notify.ts');
    expect(src).toContain(".is('notified_at', null)");
    expect(src).toContain(".not('ended_at', 'is', null)");
  });

  it('survives a database that throws rather than failing the cron', async () => {
    // It runs inside a cron that also imports transcripts; a throw here must not cost that.
    await expect(mailUnnotifiedCalls({ olderThanMinutes: 20 })).resolves.toHaveProperty('swept');
  });
});

describe('the bell revises its row instead of adding one', () => {
  const src = read('lib/receptionist/notify.ts');

  it('updates the rows already filed against this call', () => {
    expect(src).toMatch(/\.update\(\{ \.\.\.content, is_read: false, read_at: null \}\)/);
    expect(src).toContain(".eq('source_type', 'phone_calls')");
  });

  it('marks it unread again, because the revision is the part worth reading', () => {
    expect(src).toContain('is_read: false');
  });

  it('returns before notifyMany, so no second row and no second push', () => {
    expectOrder(src, 'revised ${already.length} existing bell rows', 'await notifyMany(recipients', 'revise path precedes the insert');
  });
});

describe('the webhook that produces the placeholder says so', () => {
  it('after-dial marks its notification provisional', () => {
    // Without this flag the placeholder is indistinguishable from a real summary and wins the
    // email by arriving first — which is the bug this whole file is about.
    expect(read('app/api/twilio/receptionist/after-dial/route.ts')).toContain('provisional: true');
  });

  it('and no longer stamps notified_at itself, which would suppress the real summary', () => {
    const src = read('app/api/twilio/receptionist/after-dial/route.ts');
    expect(src).not.toContain('notified_at');
  });

  it('the substantive webhooks do not claim to be provisional', () => {
    for (const f of ['app/api/twilio/transcript/route.ts', 'lib/receptionist/finish.ts', 'app/api/twilio/receptionist/voicemail/route.ts']) {
      expect(read(f), `${f} must not be provisional`).not.toContain('provisional');
    }
  });
});

describe('a blocked call is still told to nobody', () => {
  it('it stamps notified_at when it refuses the call, so the sweep never mails about it', () => {
    // The sweep looks for calls with no stamp. A blocked call is completed and never emailed —
    // exactly the shape the sweep hunts for — so the stamp is what keeps it out.
    expect(read('app/api/twilio/receptionist/route.ts')).toContain('notified_at');
  });
});
