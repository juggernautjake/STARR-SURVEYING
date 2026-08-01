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

  it('468 still asks relkind rather than guessing', () => {
    const sql = read('468_dnd_creatures_canonical.sql');
    expect(sql).toMatch(/relkind/);
  });
});

describe('a migration must not clobber a later one', () => {
  // 450 narrowed `dnd_sheet_edits_source_chk` to ai|manual|revert; 463 later widened it to include
  // library-grant and friends. 450's unconditional DROP-then-ADD reached forward, undid 463, and was
  // then refused by Postgres because real `library-grant` rows existed. On an empty database the chain is
  // fine — which is exactly why nobody saw it.
  it('450 adds its constraint only if none exists', () => {
    const sql = read('450_dnd_sheet_edit_batches.sql');
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+dnd_sheet_edits_source_chk/i);
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*\n?\s*SELECT\s+1\s+FROM\s+pg_constraint/i);
  });

  it('463 remains the authority on which sources are legal', () => {
    // The fix must not have been to widen 450 to match — that would be two files owning one rule, and
    // the next source added would go into whichever one the author happened to open.
    const sql = read('463_dnd_sheet_edits_sources.sql');
    for (const src of ['library-grant', 'homebrew-adopt', 'ig-edit']) expect(sql).toContain(src);
    // Comments stripped: 450 EXPLAINS why 463 owns the list, and must not also encode it. The explanation
    // is the point of the file; the duplicate rule would be the bug.
    const statements450 = read('450_dnd_sheet_edit_batches.sql')
      .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(statements450).not.toContain('library-grant');
  });
});
