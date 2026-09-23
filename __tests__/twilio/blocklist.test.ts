// __tests__/twilio/blocklist.test.ts — the calls the business line refuses.
//
// Owner, 2026-09-23, after four robocalls in one day: "the call should not go through and it should
// be blocked automatically if it has been put on the list."
//
// Two properties matter more than the rest: a blocked caller never reaches the phone, and a
// customer is never refused because a lookup went wrong.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normaliseNumber, isBlocked, noteBlockHit } from '@/lib/receptionist/blocklist';

function db(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'update', 'limit']) {
    b[op] = (...a: unknown[]) => { calls.push(`${op}:${String(a[0] ?? '')}`); return op === 'limit' ? Promise.resolve({ data: rows, error: null }) : b; };
  }
  b.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  return { client: { from: (t: string) => { calls.push(`from:${t}`); return b; } }, calls };
}

describe('the number a person types and the number Twilio sends are the same number', () => {
  it('normalises every shape to E.164', () => {
    // Without this a rule sits in the table looking blocked while every call sails through.
    for (const raw of ['(318) 209-1951', '318-209-1951', '3182091951', '13182091951', '+1 318 209 1951']) {
      expect(normaliseNumber(raw)).toBe('+13182091951');
    }
  });

  it('leaves a browser or SIP caller alone rather than mangling it into a phone number', () => {
    // `browser:starr` and `client:jacob@…` are in phone_calls too. Stripping their non-digits would
    // turn them into a number that could accidentally match a rule.
    expect(normaliseNumber('browser:starr')).toBe('browser:starr');
    expect(normaliseNumber('client:jacobmaddux@starr-surveying.com')).toBe('client:jacobmaddux@starr-surveying.com');
    expect(normaliseNumber('')).toBe('');
  });
});

describe('who gets refused', () => {
  const RULE = { id: 'r1', number: '+13182091951', pattern: null, reason: 'robocall', notes: null };

  it('blocks an exact number however the caller ID is formatted', async () => {
    const { client } = db([RULE]);
    expect((await isBlocked(client, '+13182091951')).blocked).toBe(true);
    expect((await isBlocked(client, '(318) 209-1951')).blocked).toBe(true);
  });

  it('blocks a prefix, because the campaign rotates its caller ID', async () => {
    // The two numbers that prompted this played ONE recording with ONE opt-out number from two
    // unrelated area codes. Blocking a single number is always a step behind that.
    const { client } = db([{ id: 'r2', number: null, pattern: '+1318209', reason: 'robocall', notes: null }]);
    const v = await isBlocked(client, '+13182091234');
    expect(v.blocked).toBe(true);
    expect(v.why).toContain('pattern');
  });

  it('lets everyone else through', async () => {
    const { client } = db([RULE]);
    expect((await isBlocked(client, '+12545550100')).blocked).toBe(false);
  });

  it('never blocks a browser caller', async () => {
    const { client } = db([RULE]);
    expect((await isBlocked(client, 'browser:starr')).blocked).toBe(false);
  });

  it('only consults active rules', async () => {
    const { client, calls } = db([RULE]);
    await isBlocked(client, '+13182091951');
    // Unblocking deactivates rather than deletes, so an inactive rule is still in the table and
    // must not still be blocking.
    expect(calls).toContain('eq:active');
  });
});

describe('it fails OPEN, always', () => {
  it('a thrown lookup lets the call through', async () => {
    const broken = { from: () => { throw new Error('connection reset'); } };
    // A robocall that gets through once is an annoyance. A customer refused because a lookup timed
    // out is a lost job, and nobody would ever know why they stopped calling.
    expect((await isBlocked(broken, '+13182091951')).blocked).toBe(false);
  });

  it('no database means no blocking', async () => {
    expect((await isBlocked(null, '+13182091951')).blocked).toBe(false);
  });

  it('a failed hit-count update does not throw into the call handler', async () => {
    const broken = { from: () => { throw new Error('nope'); } };
    await expect(noteBlockHit(broken, 'r1')).resolves.toBeUndefined();
  });
});

describe('the call is refused before the phone rings', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'app/api/twilio/receptionist/route.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('checks the block list before dialling the owner', () => {
    const check = src.indexOf('await isBlocked(');
    const dialAt = src.indexOf('const owner = ownerPhone()');
    expect(check).toBeGreaterThan(-1);
    expect(dialAt).toBeGreaterThan(-1);
    // The whole point of a block is that his phone does not ring.
    expect(check).toBeLessThan(dialAt);
  });

  it('still records the call, so a block is visible and a mistake is recoverable', () => {
    // A blocked call that left no trace looks exactly like a quiet day — and a number blocked by
    // error would show up as nothing at all rather than as a customer who stopped getting through.
    expect(src).toContain("answered_by: 'blocked'");
    expect(src).toContain('startCall(');
    const start = src.indexOf('startCall(');
    expect(start).toBeLessThan(src.indexOf('await isBlocked('));
  });

  it('marks it notified, so no later webhook emails about a call we refused', () => {
    // Recording, transcript and status callbacks all fire after this and each can notify.
    expect(src).toContain('notified_at');
  });

  it('rejects rather than hangs up, so the dialler reads a dead line and we are not billed', () => {
    expect(src).toContain('<Reject');
    expect(src).not.toContain('<Hangup/></Response>');
  });
});
