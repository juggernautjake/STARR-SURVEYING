// __tests__/schema/org-scoping.test.ts — D1's tenant column, and the four ways it would be wrong.
//
// Owner decision D1: *"Ship single-tenant. Add `org_id` to the business tables NOW (nullable, defaulted
// to the Starr org) so the eventual multi-tenant migration is a backfill, not a rewrite."*
//
// The column is trivial. The CLASSIFICATION is the work, and it is the thing that rots — a table added
// next month lands in the default bucket, and the default has to be the safe one.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classify } from '@/scripts/audit-org-scoping.mjs';

const SEED = readFileSync(join(process.cwd(), 'seeds', '513_org_scoping.sql'), 'utf8');

describe('what must never be org-scoped', () => {
  it('the organizations table itself', () => {
    // A category error: an organisation does not belong to an organisation.
    expect(classify('organizations').bucket).toBe('platform');
    expect(SEED).not.toMatch(/ALTER TABLE organizations ADD/);
  });

  it('the operator console tables', () => {
    // Scoping the operator console to one customer defeats the console. `impersonation_sessions` is
    // the sharpest case — it exists precisely to cross an org boundary.
    for (const t of ['operator_users', 'impersonation_sessions', 'pending_operator_actions', 'releases']) {
      expect(classify(t).bucket, t).toBe('platform');
      expect(SEED, t).not.toMatch(new RegExp(`ALTER TABLE ${t} ADD`));
    }
  });

  it('shared reference catalogues', () => {
    // 254 Texas counties per customer is not multi-tenancy, it is duplication with extra steps — and
    // the first divergent copy is a support call about why one firm's county data is stale.
    for (const t of ['research_counties', 'problem_templates', 'fs_reference_docs', 'question_bank']) {
      expect(classify(t).bucket, t).toBe('reference');
    }
  });

  it('but COMPENSATION POLICY is tenant data, not reference data', () => {
    // Written after this test wrongly listed `seniority_brackets` as reference and failed. Worth
    // keeping as its own case, because the mistake is easy and the direction matters: pay bands, role
    // tiers and work-type rates LOOK like lookup tables — small, static, numeric — and they are each
    // firm's own compensation policy. Sharing them across tenants would publish one customer's pay
    // scale to another.
    for (const t of ['seniority_brackets', 'role_tiers', 'work_type_rates', 'pay_rate_standards']) {
      expect(classify(t).bucket, t).toBe('tenant');
    }
  });

  it('the D&D subsystem', () => {
    // A separate product with its own user table and access model, explicitly out of the audit's scope.
    // Scoping it to a surveying organisation would be meaningless.
    expect(classify('dnd_characters').bucket).toBe('dnd');
    expect(classify('dnd_map_nodes').bucket).toBe('dnd');
    expect(SEED).not.toMatch(/ALTER TABLE dnd_/);
  });

  it('per-user state', () => {
    // A bookmark follows the person, not the firm.
    for (const t of ['user_bookmarks', 'user_hub_layouts', 'flashcard_reviews']) {
      expect(classify(t).bucket, t).toBe('per-user');
    }
  });
});

describe('what must be', () => {
  it('the business tables the audit named', () => {
    for (const t of ['contacts', 'cad_folders', 'employee_profiles', 'payroll_runs', 'daily_time_logs']) {
      expect(classify(t).bucket, t).toBe('tenant');
      expect(SEED, t).toMatch(new RegExp(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS org_id`));
    }
  });

  it('an unrecognised table defaults to TENANT, which is the safe direction', () => {
    // A new table nobody classified is far more likely to be business data than a platform table or a
    // shared catalogue — and the cost of being wrong runs one way. An unnecessary nullable column is
    // dead weight; a missing one is a table that silently leaks between customers on the day a second
    // firm arrives.
    expect(classify('some_table_invented_next_month').bucket).toBe('tenant');
  });
});

describe('the shape of the change', () => {
  it('every column is NULLABLE with a real foreign key', () => {
    // NOT NULL with a default would silently stamp every future row with the Starr org — including rows
    // a second customer's code inserts. That is the exact bug multi-tenancy exists to prevent, shipped
    // early and invisibly.
    const alters = SEED.match(/ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS org_id[^;]*/g) ?? [];
    expect(alters.length).toBeGreaterThan(60);
    for (const a of alters) {
      expect(a, a).toMatch(/REFERENCES organizations\(id\)/);
      expect(a, a).not.toMatch(/NOT NULL/);
      expect(a, a).not.toMatch(/DEFAULT/);
    }
  });

  it('every scoped table gets an index, because a tenant filter is on every future query', () => {
    const alters = (SEED.match(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS org_id/g) ?? [])
      .map((s) => s.match(/ALTER TABLE (\w+)/)![1]);
    for (const t of alters) {
      expect(SEED, `${t} needs an org_id index`).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS idx_${t}_org`));
    }
  });

  it('the backfill REFUSES to guess once a second organisation exists', () => {
    // With two orgs a default is a guess, and a guess about which customer owns a row is the worst kind
    // of wrong: silent, plausible, and discovered by the other customer.
    expect(SEED).toMatch(/n_orgs <> 1/);
    expect(SEED).toMatch(/backfill SKIPPED/);
  });

  it('is idempotent — every statement is IF NOT EXISTS', () => {
    // The lesson from seeds 450 and 468: a seed that has never been run twice has never been tested.
    const stmts = SEED.match(/^(ALTER TABLE|CREATE INDEX)[^;]*/gm) ?? [];
    for (const s of stmts) expect(s, s).toMatch(/IF NOT EXISTS/);
  });
});
