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
    expect(src).toContain(".is('emailed_at', null)");
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
    expect(src).toMatch(/\{ \.\.\.content, is_read: false, read_at: null \}/);
    expect(src).toContain(".eq('source_type', 'phone_calls')");
  });

  it('the first bell is CLAIMED, so two webhooks at once cannot both file one (2026-10-06)', () => {
    // The old check was a read followed by an insert — two webhooks arriving together both saw
    // nothing and both inserted. The claim is one conditional UPDATE only one request can win.
    expect(src).toContain("claim(o.callId, 'belled_at')");
    expect(src).toMatch(/\.is\(column, null\)\.select\('id'\)/);
  });

  it('a revision only re-marks unread when it replaces a placeholder', () => {
    expect(src).toContain('wasPlaceholder');
  });

  it('marks it unread again, because the revision is the part worth reading', () => {
    expect(src).toContain('is_read: false');
  });

  it('returns before notifyMany, so no second row and no second push', () => {
    expectOrder(src, 'revised ${rows.length} existing bell rows', 'await notifyMany(recipients', 'revise path precedes the insert');
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

// ── Screening and junk (owner, 2026-10-06) ──────────────────────────────────────────────────────
// "make sure there is only one email and one notification sent for each call … spam callers and
// robo callers and people who don't answer at all." Junk tells nobody; a screened number that
// leaves a real message is told like anyone else.
describe('who hears about screened and junk calls', () => {
  function gate() {
    const sent: string[] = [];
    const claims: string[] = [];
    return {
      sent,
      claims,
      deps: {
        send: async () => { sent.push('sms'); return true; },
        email: async () => { sent.push('email'); return true; },
        inApp: async (_o: unknown, opts?: { reviseOnly?: boolean }) => { sent.push(opts?.reviseOnly ? 'bell-revise' : 'bell'); return 6; },
        claimEmail: async (id: string) => { claims.push(id); return true; },
        releaseEmail: async () => {},
        stamp: async () => {},
        env: { LEAD_SMS_RECIPIENTS: '+12545550111' },
      },
    };
  }
  const row = (p: Record<string, unknown>) => ({ is_test: false, transcript: [], transcript_status: 'completed', recording_duration: 30, duration_seconds: 40, ...p });

  it('a screened call with no message tells nobody, and is claimed so the sweep never mails it', async () => {
    const g = gate();
    const out = await notifyOwners({ ...CALL, answeredBy: 'none', call: row({ screened_as: 'voicemail', answered_by: 'none' }) as never }, g.deps);
    expect(g.sent).toEqual([]);
    expect(out).toEqual({ texted: 0, emailed: false, belled: 0 });
    expect(g.claims).toEqual(['c1']);
  });

  it('a screened number that leaves a real message is told exactly like any voicemail (fail-safe)', async () => {
    const g = gate();
    await notifyOwners({ ...CALL, answeredBy: 'voicemail', call: row({ screened_as: 'voicemail', answered_by: 'voicemail', voicemail_text: 'Hi this is Terry Glover about my survey on Elm Street' }) as never }, g.deps);
    expect(g.sent).toEqual(['bell', 'sms', 'email']);
  });

  it('a robocall that rang through retitles the existing bell and sends no email or text', async () => {
    const g = gate();
    await notifyOwners({ ...CALL, call: row({ answered_by: 'owner', transcript: [{ role: 'caller', text: 'Press 9 to opt out' }] }) as never }, g.deps);
    expect(g.sent).toEqual(['bell-revise']);
  });

  it('a call still waiting on its transcript rings the bell and holds the email', async () => {
    const g = gate();
    await notifyOwners({ ...CALL, call: row({ answered_by: 'owner', transcript: [], transcript_status: 'queued' }) as never }, g.deps);
    expect(g.sent).toEqual(['bell']);
    expect(g.claims).toEqual([]);
  });

  it('the sweep has the last word: on `final` the same call is mailed', async () => {
    const g = gate();
    await notifyOwners({ ...CALL, final: true, call: row({ answered_by: 'owner', transcript: [], transcript_status: 'queued' }) as never }, g.deps);
    expect(g.sent).toContain('email');
  });

  it('a lost claim means somebody else already sent it', async () => {
    const g = gate();
    await notifyOwners(CALL, { ...g.deps, claimEmail: async () => false });
    expect(g.sent).toEqual(['bell']);
  });

  it('no webhook stamps notified_at behind notifyOwners any more — the claim is the only stamp', () => {
    for (const f of ['lib/receptionist/finish.ts', 'app/api/twilio/status/route.ts', 'app/api/twilio/receptionist/machine/route.ts', 'app/api/twilio/receptionist/agent-ended/route.ts']) {
      expect(read(f), f).not.toMatch(/updateCall\([^)]*notified_at/);
    }
  });
});
