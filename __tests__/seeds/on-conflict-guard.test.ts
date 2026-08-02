// A seed's `ON CONFLICT DO NOTHING` must have something to conflict WITH.
//
// Seed 529's finding: the clause fires only when a unique constraint is actually violated. A table
// whose only unique index is a primary key on `gen_random_uuid()` can never be violated by a fresh
// INSERT, so the clause is decoration — and nine such seeds had quietly inserted their reference
// data on every run since February. Production held 153 seniority brackets for 9 real ones, 459
// rewards for 27, and 1,125 duplicate exam questions.
//
// Nothing failed. The seeds succeeded, the tests passed, and the only visible symptom was a React
// key warning on a page nobody had opened with the console up. So this is a static guard: every
// bare `ON CONFLICT DO NOTHING` must target a table that some seed gives a unique index or
// constraint to.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SEEDS = path.join(process.cwd(), 'seeds');
const files = fs.readdirSync(SEEDS).filter((f) => f.endsWith('.sql')).sort();
const sqlByFile = new Map(files.map((f) => [f, fs.readFileSync(path.join(SEEDS, f), 'utf8')]));

/** Statements, roughly. Splitting on `;` at end-of-line is enough: this looks only at whether an
 *  INSERT and an ON CONFLICT are in the same statement, and no seeded VALUES list contains one. */
function statements(sql: string): string[] {
  return sql.split(/;\s*\r?\n/);
}

/** Tables any seed gives a non-primary-key unique index or constraint. */
function tablesWithUniqueness(): Set<string> {
  const out = new Set<string>();
  for (const sql of sqlByFile.values()) {
    for (const m of sql.matchAll(/CREATE\s+UNIQUE\s+INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+\S+\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      out.add(m[1]!.toLowerCase());
    }
    // `UNIQUE (a, b)` inside a CREATE TABLE, and `ADD CONSTRAINT … UNIQUE`.
    for (const m of sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi)) {
      const [, table, body] = m;
      if (/\bUNIQUE\s*\(/i.test(body!) || /\bUNIQUE\b(?!\s*\()/i.test(body!.replace(/PRIMARY KEY/gi, ''))) {
        out.add(table!.toLowerCase());
      }
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)[\s\S]{0,200}?ADD\s+CONSTRAINT\s+\S+\s+UNIQUE/gi)) {
      out.add(m[1]!.toLowerCase());
    }
  }
  return out;
}

describe('a bare ON CONFLICT DO NOTHING has something to conflict with', () => {
  const unique = tablesWithUniqueness();

  it('every seeded INSERT that relies on the bare clause targets a table with a unique key', () => {
    const offenders: string[] = [];
    for (const [file, sql] of sqlByFile) {
      for (const stmt of statements(sql)) {
        const insert = /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)/i.exec(stmt);
        if (!insert) continue;
        if (!/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(stmt)) continue;
        const table = insert[1]!.toLowerCase();
        if (!unique.has(table)) offenders.push(`${file}: INSERT INTO ${table}`);
      }
    }
    expect(
      offenders,
      `These inserts cannot deduplicate — the clause fires only against a real unique constraint, so
re-running the seed inserts another copy of everything:\n  ${offenders.join('\n  ')}\n
Either name a target (ON CONFLICT (col)) and add the index, or give the table a unique key.`,
    ).toEqual([]);
  });

  it('the tables seed 529 repaired now carry the index their seeds assumed', () => {
    // Named rather than derived: these are the nine that had already multiplied, and a regression
    // here means somebody dropped the index that stops it happening again.
    for (const table of [
      'seniority_brackets', 'rewards_catalog', 'module_xp_config', 'block_templates',
      'analysis_templates', 'drawing_templates', 'learning_topics', 'question_bank', 'flashcards',
    ]) {
      expect(unique.has(table), `${table} has no unique index in seeds/`).toBe(true);
    }
  });

  it('529 keeps the earliest row, not an arbitrary one', () => {
    // The oldest row predates the multiplication, so a hand-edit made to the original survives.
    const sql = sqlByFile.get('529_dedupe_seeded_reference_data.sql')!;
    expect(sql).toContain('(k.created_at, k.id) < ');
    // And it repoints children before deleting, rather than relying on ON DELETE SET NULL.
    expect(sql).toContain('UPDATE quiz_attempt_answers');
    expect(sql).toContain('UPDATE rewards_purchases');
  });

  it('does not key questions on their text alone', () => {
    // Three module variants share a question's wording and differ in the answer. Keying on text
    // would have deleted real questions.
    const sql = sqlByFile.get('529_dedupe_seeded_reference_data.sql')!;
    expect(sql).toContain('coalesce(q.correct_answer::text');
  });
});
