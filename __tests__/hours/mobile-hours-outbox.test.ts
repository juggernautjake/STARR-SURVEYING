// __tests__/hours/mobile-hours-outbox.test.ts
//
// Mobile hours had never reached the office: a clock-out lived only in the phone's SQLite, and
// PowerSync (the only way off the phone) was never configured. These pin the fix — the phone posts
// each clock-out to the same hours API the web uses, signed with its Supabase token — plus the
// other hours defects found the same day.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMobileEntries, splitByLocalDay } from '../../mobile/lib/hoursEntries';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ENTRY = '11111111-2222-3333-4444-555555555555';

describe('a mobile clock-out becomes the rows the office approves', () => {
  it('one day, one row, keyed so a retry can never double-log', () => {
    const rows = buildMobileEntries({
      entryId: ENTRY,
      startedAt: new Date(2026, 9, 5, 8, 0).toISOString(),
      endedAt: new Date(2026, 9, 5, 16, 30).toISOString(),
      jobId: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ log_date: '2026-10-05', hours: 8.5, client_submission_id: `mobile:${ENTRY}:0` });
    expect(rows[0].description).toMatch(/mobile app/);
  });

  it('a shift past midnight is split on the phone’s own calendar', () => {
    expect(splitByLocalDay(new Date(2026, 9, 5, 22, 0).getTime(), new Date(2026, 9, 6, 1, 0).getTime()))
      .toEqual([{ date: '2026-10-05', hours: 2 }, { date: '2026-10-06', hours: 1 }]);
  });

  it('a free-text job number is not sent as a job id (the column is a uuid)', () => {
    const rows = buildMobileEntries({
      entryId: ENTRY, jobId: '26159',
      startedAt: new Date(2026, 9, 5, 8, 0).toISOString(), endedAt: new Date(2026, 9, 5, 9, 0).toISOString(),
    });
    expect(rows[0].job_id).toBeNull();
  });

  it('nothing for a clock that ran backwards', () => {
    expect(buildMobileEntries({
      entryId: ENTRY, jobId: null,
      startedAt: new Date(2026, 9, 5, 9, 0).toISOString(), endedAt: new Date(2026, 9, 5, 8, 0).toISOString(),
    })).toEqual([]);
  });

  it('the clock-out queues the hours, and the app keeps sending them', () => {
    const tracking = read('mobile/lib/timeTracking.ts');
    expect(tracking).toMatch(/await enqueueHours\(buildMobileEntries\(/);
    const outbox = read('mobile/lib/hoursOutbox.ts');
    expect(outbox).toMatch(/\/api\/admin\/time-logs/);
    expect(outbox).toMatch(/Authorization: `Bearer \$\{token\}`/);
    expect(read('mobile/app/_layout.tsx')).toMatch(/<HoursOutboxSync \/>/);
  });

  it('a row the server will never accept no longer jams every later upload', () => {
    const connector = read('mobile/lib/db/connector.ts');
    expect(connector).toMatch(/if \(!isPermanentRejection\(opErr\)\) throw opErr;/);
    expect(connector).toMatch(/parkRejectedOp\(/);
  });
});

describe('the hours API accepts the phone, and only real staff', () => {
  const caller = read('lib/hours/caller.ts');
  const route = read('app/api/admin/time-logs/route.ts');
  it('verifies the Supabase token server-side and requires a registered, approved account', () => {
    expect(caller).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
    expect(caller).toMatch(/flags\.is_banned \|\| flags\.is_approved === false/);
    expect(caller).toMatch(/\.eq\('email', email\)/);
  });
  it('GET and POST use it; edits and deletes stay web-only', () => {
    expect(route.match(/await resolveHoursCaller\(req\)/g)).toHaveLength(2);
  });
});

describe('the public key cannot touch pay', () => {
  const seed = read('seeds/665_lock_hours_and_pay_rls.sql');
  it('narrows every service_role_all_* policy to the service role', () => {
    for (const t of ['daily_time_logs', 'payout_log', 'pay_advance_requests', 'scheduled_bonuses', 'weekly_pay_periods']) {
      expect(seed).toContain(`'${t}'`);
    }
    expect(seed).toMatch(/FOR ALL TO service_role USING \(true\) WITH CHECK \(true\)/);
    // The header explains the old `TO public` rule in prose; only the executable SQL must not grant it.
    const sql = seed.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/TO public/);
  });
});

describe('the assistant can see your hours again', () => {
  const tools = read('lib/ai/tools.ts');
  it('reads columns that exist', () => {
    expect(tools).not.toMatch(/select\('work_date/);
    expect(tools).not.toMatch(/select\('clock_in_at/);
    expect(tools).toMatch(/\.gte\('log_date'/);
  });
});
