// __tests__/seeds/fk-targets-exist-in-order.test.ts
//
// A seed may not reference a table that no seed creates, or one created by a LATER seed.
//
// ── WHY THIS IS WORTH A TEST ────────────────────────────────────────────────────────────────────
//
// Seeds are applied in filename order by `scripts/apply-seeds.mjs`, and a `REFERENCES` to a table
// that does not exist yet is a hard Postgres error. Nothing in this repo catches it: seeds are not
// executed by the suite, `tsc` never sees them, and the failure surfaces **on the owner's machine,
// at the moment they run the one command that unblocks a feature**. That is the worst place to
// discover an ordering mistake, and it reads as "your seeds are broken" rather than "seed 573 came
// before seed 323".
//
// This was written while checking whether seeds 572/573 would actually apply — the owner's single
// blocking action for F1b/F2b. They do. The check is kept because verifying it by hand, per seed,
// is exactly the kind of thing that gets skipped on the seed that finally breaks it.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK ─────────────────────────────────────────────────────────
//
// Not a SQL parser and not a substitute for applying them. It answers one question — does the target
// table exist by the time this seed runs — because that is the ordering failure this layout invites.
// Column existence, type compatibility and constraint validity all still need a real database.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SEEDS = join(__dirname, '..', '..', 'seeds');

/** Numbered seeds only, in the order `apply-seeds.mjs` runs them. */
const files = readdirSync(SEEDS)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

const seedNumber = (f: string): number => parseInt(f.split('_')[0], 10);

/**
 * Tables this schema does not create and must not be expected to.
 *
 * `users` is Supabase's `auth.users`, which exists before any seed runs. Listed explicitly rather
 * than pattern-matched, so a genuine `public.users` typo would still be caught.
 */
const EXTERNAL_TABLES = new Set(['users']);

/** table name → the number of the first seed that creates it. */
function creationMap(): Map<string, number> {
  const created = new Map<string, number>();
  for (const f of files) {
    const sql = readFileSync(join(SEEDS, f), 'utf8');
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
      const table = m[1].toLowerCase();
      if (!created.has(table)) created.set(table, seedNumber(f));
    }
  }
  return created;
}

describe('seed foreign keys resolve in apply order', () => {
  const created = creationMap();

  it('found the seeds and the tables they create', () => {
    // Vacuous-pass guard. Both assertions below iterate these; empty scans would pass forever while
    // an ordering bug sat waiting for the next `apply-seeds` run.
    expect(files.length).toBeGreaterThan(300);
    expect(created.size).toBeGreaterThan(200);
  });

  it('finds REFERENCES clauses at all', () => {
    // The other half of the instrument: a regex that matched no foreign keys would also pass.
    const total = files.reduce(
      (n, f) => n + [...readFileSync(join(SEEDS, f), 'utf8').matchAll(/REFERENCES\s+/gi)].length,
      0,
    );
    expect(total).toBeGreaterThan(50);
  });

  it('never references a table created later, or not at all', () => {
    const problems: string[] = [];
    for (const f of files) {
      const sql = readFileSync(join(SEEDS, f), 'utf8');
      const n = seedNumber(f);
      for (const m of sql.matchAll(/REFERENCES\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi)) {
        const table = m[1].toLowerCase();
        if (EXTERNAL_TABLES.has(table)) continue;
        const at = created.get(table);
        if (at === undefined) {
          problems.push(`${f} → REFERENCES ${table}, which no seed creates`);
        } else if (at > n) {
          problems.push(`${f} → REFERENCES ${table}, created later in seed ${at}`);
        }
      }
    }
    expect(
      [...new Set(problems)],
      problems.length
        ? `These seeds will fail when applied in order:\n  ${[...new Set(problems)].join('\n  ')}\n\n` +
          `Move the CREATE TABLE earlier, or renumber the seed that needs it. The error would ` +
          `otherwise appear only when someone runs scripts/apply-seeds.mjs.`
        : undefined,
    ).toEqual([]);
  });

  it('covers the two seeds the finance work is blocked on', () => {
    // Named because they are the owner's next action, and a general sweep that quietly stopped
    // including them would remove the reason this file was written.
    expect(files).toContain('572_payment_cards.sql');
    expect(files).toContain('573_cost_recoveries.sql');
  });
});
