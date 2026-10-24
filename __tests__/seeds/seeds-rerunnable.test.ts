// __tests__/seeds/seeds-rerunnable.test.ts — the seed set must survive being applied twice.
//
// "Apply all the seeds" is this project's rebuild path. On 2026-08-01 that path was broken in two
// places, and both were invisible until someone actually ran it against a live database rather than an
// empty one: `scripts/apply-seeds.mjs` stopped at file 274 of 305, and then at 292 of 305.
//
// Neither failure could be reached from a fresh database, which is the whole reason they survived. On an
// empty schema every seed in the chain succeeds; the breakage only appears once the ROWS and OBJECTS the
// later seeds create are already there. **A seed that has never been run twice has never been tested.**
//
// This file cannot prove re-runnability — only a live apply can, and one was done — but it pins the two
// patterns that caused it so they cannot come back silently.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEEDS = join(process.cwd(), 'seeds');
const files = readdirSync(SEEDS).filter((f) => f.endsWith('.sql'));
const read = (f: string) => readFileSync(join(SEEDS, f), 'utf8');

describe('DROP VIEW IF EXISTS is not a way to ask "whatever kind of view this is"', () => {
  // `DROP VIEW IF EXISTS x` skips only when NOTHING of that name exists. Against a materialized view it
  // raises `42809 "x" is not a view`, and `DROP MATERIALIZED VIEW` does the same against a plain one — so
  // writing both, in either order, is guaranteed to fail in one of the two states. Only `relkind` can
  // answer the question.
  it('no seed drops the same relation as both a view and a materialized view', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const sql = read(f);
      const plain = [...sql.matchAll(/DROP\s+VIEW\s+IF\s+EXISTS\s+([\w.]+)/gi)].map((m) => m[1].toLowerCase());
      const mat = new Set(
        [...sql.matchAll(/DROP\s+MATERIALIZED\s+VIEW\s+IF\s+EXISTS\s+([\w.]+)/gi)].map((m) => m[1].toLowerCase()),
      );
      for (const name of plain) if (mat.has(name)) offenders.push(`${f}: ${name}`);
    }
    expect(offenders, 'these always fail on the second run — ask pg_class.relkind instead').toEqual([]);
  });

});
