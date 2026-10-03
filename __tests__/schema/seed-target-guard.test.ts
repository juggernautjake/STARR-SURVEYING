// __tests__/schema/seed-target-guard.test.ts — the seeder can reach staging, and cannot wipe
// production by accident (platform audit §8.2).
//
// `seeds/000_reset.sql` TRUNCATEs every table. Until 2026-08-01 `apply-seeds.mjs` could resolve
// exactly one connection — production — and `npm run db:seed:reset` fired that TRUNCATE against it
// with no confirmation of any kind. Nothing had run it yet. That is not the same as it being safe.
//
// It is also why the audit's staging item sat undone: bootstrapping a second database meant editing
// `.env.local`, running the seeds, and remembering to change it back, with the destructive flag one
// forgotten edit away from the live business.
//
// These run the real script as a subprocess with --plan-only, so every case stops BEFORE connecting
// to anything. (They used --dry-run until 2026-10-03, which does connect: the "allowed" cases were
// logging in to production on every local run, and could not pass in CI at all.)
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'apply-seeds.mjs');

// The script prefers the environment over .env.local, so every run gets this stand-in for
// production. Nothing here connects, so it never has to be real — and the suite no longer needs (or
// reads) the real production URL, which CI does not have.
const PROD_URL = 'postgresql://postgres:secret@db.prod-stand-in.supabase.co:5432/postgres';

function run(args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SUPABASE_DB_URL: PROD_URL },
    }), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
  }
}

describe('--reset against production', () => {
  it('is refused, and says what to do instead', () => {
    const { out, code } = run(['--reset', '--plan-only']);
    expect(code, 'must exit non-zero').toBe(2);
    expect(out).toMatch(/REFUSING to run 000_reset\.sql against PRODUCTION/);
    // A refusal that does not name the alternative just gets worked around, usually by editing
    // .env.local — which is the exact manoeuvre this guard exists to make unnecessary.
    expect(out).toMatch(/--target staging --reset/);
    expect(out).toMatch(/--yes-truncate-production/);
  });

  it('is refused even when production is typed out as an explicit --target URL', () => {
    // The obvious way around the guard, and the one most likely to be reached for in a hurry. Compared
    // by host + database, since credentials and pooler ports differ between equivalent URLs.
    // Same host and database as production, different credentials and pooler port.
    const url = 'postgresql://other:pw@db.prod-stand-in.supabase.co:6543/postgres';
    const { out, code } = run(['--target', url, '--reset', '--plan-only']);
    expect(code).toBe(2);
    expect(out).toMatch(/REFUSING/);
  });

  it('is allowed with the explicit flag, because it is sometimes genuinely right', () => {
    // A guard with no way through is a guard that gets deleted. This one costs a deliberate sentence.
    const { out, code } = run(['--reset', '--yes-truncate-production', '--plan-only']);
    expect(code, out).toBe(0);
    expect(out).toMatch(/INCLUDING 000_reset/);
  });
});

describe('targeting', () => {
  it('leaves the ordinary production seed run untouched', () => {
    // The non-destructive path is the one used constantly; making it prompt or refuse would have
    // traded a rare catastrophe for daily friction, and friction is what gets guards removed.
    const { out, code } = run(['--plan-only']);
    expect(code, out).toBe(0);
    expect(out).toMatch(/Target: SUPABASE_DB_URL \(production\)/);
    expect(out).toMatch(/000_reset excluded/);
  });

  it('names the target on every run, so the destination is never inferred', () => {
    expect(run(['--plan-only']).out).toMatch(/⚠ PRODUCTION/);
  });

  it('rejects an unrecognised target rather than falling back to production', () => {
    // Falling back would be the dangerous default: a typo in `--target stagng` would silently seed
    // the live database.
    const { out, code } = run(['--target', 'prod', '--plan-only']);
    expect(code).toBe(2);
    expect(out).toMatch(/Unknown --target "prod"/);
  });

  it('explains how to create staging when STAGING_DB_URL is missing', () => {
    // The remaining half of §8.2 is owner-gated — somebody has to create the Supabase project. The
    // script should hand them the next command rather than a bare "not set".
    const { out, code } = run(['--target', 'staging', '--plan-only']);
    expect(code).toBe(2);
    expect(out).toMatch(/STAGING_DB_URL not set/);
    expect(out).toMatch(/--target staging --reset/);
  });
});
