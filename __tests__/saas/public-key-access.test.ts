// __tests__/saas/public-key-access.test.ts
//
// The anon key ships in every browser bundle. On 2026-10-05 it could read staff messages, hours,
// Google Ads OAuth tokens and operator password hashes. seeds/665–668 closed that; this pins the
// shape of the fix so a later edit cannot quietly reopen it. The live check is
// `npm run audit:public-access` (it needs the database, so it is not run in CI).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Executable SQL only — the headers describe the old `TO public` grants in prose. */
const sql = (p: string) => read(p).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the public key reaches nothing private', () => {
  it('every public table gets RLS, dynamically, so a new table cannot slip through', () => {
    const s = sql('seeds/667_rls_on_every_public_table.sql');
    expect(s).toMatch(/NOT c\.relrowsecurity/);
    expect(s).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(s).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/);
  });

  it('elevated functions are not callable by anon', () => {
    const s = sql('seeds/668_revoke_public_security_definer_rpcs.sql');
    expect(s).toMatch(/p\.prosecdef/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });

  it('the formerly open policies now name the service role, never public', () => {
    for (const f of ['seeds/665_lock_hours_and_pay_rls.sql', 'seeds/666_lock_remaining_open_rls.sql']) {
      const s = sql(f);
      expect(s, f).toMatch(/TO service_role USING \(true\) WITH CHECK \(true\)/);
      expect(s, f).not.toMatch(/TO public/);
    }
    // The tables that held the worst of it.
    const s666 = read('seeds/666_lock_remaining_open_rls.sql');
    for (const t of ['messages', 'conversations', 'activity_log', 'error_reports', 'role_tiers']) {
      expect(s666).toContain(`('${t}',`);
    }
  });

  it('there is a one-command live audit', () => {
    expect(JSON.parse(read('package.json')).scripts['audit:public-access']).toBe('node scripts/audit-public-access.mjs');
  });
});
