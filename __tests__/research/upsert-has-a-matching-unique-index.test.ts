import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── AN `onConflict` WITH NOTHING TO CONFLICT ON IS A 42P10, NOT A DUPLICATE ─────────────────────
//
// `research_adjoiners` holds zero rows. Not because runs find no neighbours — the run log says they
// do — but because every write of them failed:
//
//   adjoiner-persistence.ts:137   onConflict: 'research_project_id,parcel_id,owner_name,identified_by'
//   seed 539                      CREATE UNIQUE INDEX ... ON research_adjoiners
//                                   (research_project_id, COALESCE(parcel_id, ''),
//                                    COALESCE(owner_name, ''), identified_by)
//
// The index is on EXPRESSIONS. Postgres matches an `ON CONFLICT (a, b, c)` target against the
// index's expressions, and `parcel_id` is not `COALESCE(parcel_id, '')`, so no index matches and
// the whole statement raises 42P10: *there is no unique or exclusion constraint matching the ON
// CONFLICT specification*. Every adjoiner the system has ever identified was thrown away at the
// database boundary.
//
// The COALESCE was not a mistake — its comment explains it: a neighbour found only by name has no
// parcel id, and two nameless GIS neighbours are not the same neighbour. NULLs are distinct in a
// plain unique index, so dropping the COALESCE would let re-runs pile up duplicates. Seed 628 keeps
// the semantics and makes them targetable, with generated columns the index and the `onConflict`
// can both name.
//
// ── WHY THE EXISTING TEST DID NOT CATCH IT ──────────────────────────────────────────────────────
//
// `adjoiner-persistence.test.ts` mocks `upsert` and asserts the option string it was called with.
// A mock cannot raise 42P10, so the test agrees with the code about a string they are both wrong
// about. This one reads the SEEDS: the only place that knows whether a conflict target exists.

const ROOT = process.cwd();

/** Every set of columns a table has a UNIQUE index or constraint on, as sorted comma keys. */
function uniqueKeySets(): Map<string, Set<string>> {
  const dir = path.join(ROOT, 'seeds');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const keys = new Map<string, Set<string>>();
  const add = (table: string, cols: string[]) => {
    const t = table.toLowerCase();
    if (!keys.has(t)) keys.set(t, new Set());
    keys.get(t)!.add([...cols].map((c) => c.toLowerCase()).sort().join(','));
  };

  /**
   * A column list, or null if any entry is not a plain identifier.
   *
   * This is the whole point. `COALESCE(parcel_id, '')` and `lower(email)` are expressions, and an
   * `ON CONFLICT (parcel_id)` does not match an index built on one — which is exactly the defect.
   * Returning null for an expression index means it never satisfies an onConflict, which is the
   * truth rather than a limitation of this parser.
   */
  const plainCols = (list: string): string[] | null => {
    const parts = list.split(',').map((p) => p.trim().replace(/\s+(asc|desc|nulls\s+(first|last))\b.*$/i, '').trim());
    if (parts.length === 0) return null;
    const cols: string[] = [];
    for (const p of parts) {
      const m = p.match(/^"?([a-z_][a-z0-9_]*)"?$/i);
      if (!m) return null;
      cols.push(m[1]);
    }
    return cols;
  };

  // CREATE UNIQUE INDEX … ON table (cols)  — a partial index (WHERE …) is deliberately still
  // counted, because Postgres does accept one as an inference target when the statement's own
  // predicate implies it. Being generous here can only produce a false PASS on an exotic case,
  // never a false failure that blocks a correct write.
  for (const m of sql.matchAll(/create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z0-9_"]*\s*\n?\s*on\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^;]*?)\)/gi)) {
    const cols = plainCols(m[2]);
    if (cols) add(m[1], cols);
  }

  // Inline table constraints and column-level UNIQUE / PRIMARY KEY.
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    const table = m[1];
    for (const raw of m[2].split('\n')) {
      const line = raw.trim().replace(/,$/, '');
      if (!line || line.startsWith('--')) continue;

      const tableLevel = line.match(/^(?:constraint\s+[a-z0-9_"]+\s+)?(?:unique|primary\s+key)\s*\(([^)]*)\)/i);
      if (tableLevel) {
        const cols = plainCols(tableLevel[1]);
        if (cols) add(table, cols);
        continue;
      }
      const colLevel = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+[^,]*\b(unique|primary\s+key)\b/i);
      if (colLevel) add(table, [colLevel[1]]);
    }
  }

  // ALTER TABLE … ADD CONSTRAINT … UNIQUE (cols)
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)[\s\S]*?add\s+constraint\s+[a-z0-9_"]+\s+(?:unique|primary\s+key)\s*\(([^)]*)\)/gi)) {
    const cols = plainCols(m[2]);
    if (cols) add(m[1], cols);
  }

  return keys;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name === '__tests__') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

interface Finding { file: string; table: string; onConflict: string; line: number }

/** Comments blanked, length preserved, opener anchored — same reasoning as writes-hit-real-columns. */
function blankComments(src: string): string {
  return src
    .replace(/^[ \t]*\{?\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

function badUpserts(keys: Map<string, Set<string>>, files: string[], sources?: Map<string, string>): Finding[] {
  const found: Finding[] = [];
  for (const file of files) {
    const raw = sources?.get(file) ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    const src = blankComments(raw);
    for (const m of src.matchAll(/\.from\(\s*['"`](research_[a-z0-9_]+)['"`]\s*\)/g)) {
      const table = m[1];
      const known = keys.get(table);
      // A table with no unique key in the seeds is a different question — and an upsert against it
      // would fail for a different reason. Reported rather than skipped, below.
      let chain = src.slice(m.index! + m[0].length, m.index! + 1500);
      const next = chain.indexOf('.from(');
      if (next >= 0) chain = chain.slice(0, next);

      for (const u of chain.matchAll(/onConflict\s*:\s*['"`]([^'"`]+)['"`]/g)) {
        const wanted = u[1].split(',').map((c) => c.trim().toLowerCase()).sort().join(',');
        if (!known || !known.has(wanted)) {
          found.push({ file, table, onConflict: u[1], line: src.slice(0, m.index!).split('\n').length });
        }
      }
    }
  }
  return found;
}

const KEYS = uniqueKeySets();
const FILES = [...walk('app'), ...walk('lib'), ...walk('worker/src')];

describe('every research upsert names a conflict target that exists', () => {
  it('CONTROL: the seed parser found unique keys at all', () => {
    // Without this, every assertion below could pass because the map is empty and nothing is
    // checked — the failure mode where a guard reporting zero means it never looked.
    expect(KEYS.size).toBeGreaterThan(5);
    expect(KEYS.get('research_adjoiners')).toBeDefined();
  });

  it('CONTROL: it scanned real files', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('SEES an onConflict on columns with no unique index', () => {
    const code = `await db.from('research_adjoiners').upsert(rows, { onConflict: 'research_project_id,not_a_column' });`;
    const REL = 'lib/research/__upsert_probe_bad__.ts';
    expect(badUpserts(KEYS, [REL], new Map([[REL, code]])).length).toBe(1);
  });

  it('SEES an onConflict that names an EXPRESSION index by its inner column', () => {
    // The actual defect. A unique index on COALESCE(parcel_id, '') does not satisfy
    // ON CONFLICT (parcel_id), and Postgres says so with 42P10 rather than ignoring it.
    const code = `await db.from('research_adjoiners').upsert(rows, { onConflict: 'research_project_id,parcel_id,owner_name,identified_by' });`;
    const REL = 'lib/research/__upsert_probe_expr__.ts';
    expect(badUpserts(KEYS, [REL], new Map([[REL, code]])).length).toBe(1);
  });

  it('PASSES an onConflict that matches, in any column order', () => {
    // Order is not part of an inference target's identity.
    const code = `await db.from('research_adjoiners').upsert(rows, { onConflict: 'identified_by,owner_key,parcel_key,research_project_id' });`;
    const REL = 'lib/research/__upsert_probe_good__.ts';
    expect(badUpserts(KEYS, [REL], new Map([[REL, code]]))).toEqual([]);
  });

  it('does not attribute an onConflict to the wrong table', () => {
    const code = [
      `await db.from('research_adjoiners').upsert(a, { onConflict: 'research_project_id,parcel_key,owner_key,identified_by' });`,
      `await db.from('research_site_adapters').upsert(b, { onConflict: 'county_id,site_type' });`,
    ].join('\n');
    const REL = 'lib/research/__upsert_probe_two__.ts';
    expect(badUpserts(KEYS, [REL], new Map([[REL, code]]))).toEqual([]);
  });

  it('every real upsert has somewhere to land', () => {
    const bad = badUpserts(KEYS, FILES);
    const lines = [...new Set(bad.map((b) => `${b.table} onConflict '${b.onConflict}'  (${b.file}:${b.line})`))];
    expect(
      lines,
      lines.length
        ? 'An ON CONFLICT with no matching unique index raises 42P10 and the whole statement fails — '
          + `the rows are not written, and nothing about the error says "duplicate":\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});
