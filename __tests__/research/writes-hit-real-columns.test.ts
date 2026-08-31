// __tests__/research/writes-hit-real-columns.test.ts
//
// Every column the research code WRITES exists in the seeds.
//
// ── THE DEFECT THIS CATCHES ─────────────────────────────────────────────────────────────────────
//
// A write to a column that does not exist is rejected by PostgREST and returns an `{ error }` the
// caller usually is not reading. Nothing throws. The route returns 200. The data is gone.
//
// This repository has shipped it twice:
//
//   · `activity_log` — wrote `action`/`details` to a table whose columns are
//     `action_type`/`metadata`, and recorded NOTHING for as long as it existed.
//   · `research_documents.analysis_metadata` — found by this check on 2026-08-31. The full-extract
//     route persisted its extraction report to a column that lives on research_PROJECTS, inside a
//     bare `try { … } catch { }`. Every full extraction since the route was written lost its saved
//     copy; the report still came back in the response, so nothing looked wrong.
//
// ── THE CHECK IS ONLY WORTH HAVING IF IT CAN FAIL ───────────────────────────────────────────────
//
// This one reported **zero** for three separate reasons before it worked, and each time the zero
// looked like good news:
//
//   1. offsets from a comment-STRIPPED source were used to index the ORIGINAL — the two no longer
//      line up once lengths change;
//   2. `after.slice(0, op.index)` — `after` starts AT the `.from(`, so the "no other `.from()` in
//      between" guard always matched itself and skipped every candidate;
//   3. before those, misattribution put one table's columns onto another, and the output was 136
//      findings including columns literally named `null` and `false`.
//
// So it carries controls, and the first thing it asserts is that it can see a column that is not
// there. A structural check that cannot fail is worse than no check: it is a green light.
//
// Two false-positive classes are also pinned below, because a false positive here sends somebody to
// "fix" working code: a ternary's true-branch (`storage_path: ok ? storagePath : null` looked like a
// write to `storagepath`) and multi-column `ALTER TABLE … ADD COLUMN a, ADD COLUMN b`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// ── Columns, from the seeds ─────────────────────────────────────────────────────────────────────

function seedColumns(): Map<string, Set<string>> {
  const dir = path.join(ROOT, 'seeds');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const cols = new Map<string, Set<string>>();
  const add = (t: string, c: string) => {
    if (!cols.has(t)) cols.set(t, new Set());
    cols.get(t)!.add(c);
  };

  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      if (/^(primary|foreign|unique|constraint|check|exclude|like)\b/i.test(line)) continue;
      const c = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i);
      if (c) add(m[1].toLowerCase(), c[1].toLowerCase());
    }
  }

  // One ALTER can add several columns, comma-separated. Matching only the first made
  // `research_projects.research_message` look like a write to a column that does not exist.
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi)) {
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      add(m[1].toLowerCase(), c[1].toLowerCase());
    }
  }
  return cols;
}

// ── Writes, from the code ───────────────────────────────────────────────────────────────────────

/** Comments blanked, LENGTH PRESERVED — see the header; changing lengths broke this twice. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

/** String bodies blanked so their braces cannot corrupt the depth count. Length preserved. */
function blankStrings(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) break;
        j++;
      }
      out += ch + ' '.repeat(Math.max(0, j - i - 1)) + ch;
      i = j + 1;
    } else { out += ch; i++; }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) out.push(rel);
  }
  return out;
}

function objectAt(src: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

const RESERVED = new Set(['null', 'true', 'false', 'undefined', 'default', 'case', 'return']);

interface Finding { file: string; table: string; key: string; line: number }

function badWrites(cols: Map<string, Set<string>>, files: string[], sources?: Map<string, string>): Finding[] {
  const found: Finding[] = [];
  for (const file of files) {
    // A self-check may supply the source in memory. These probes used to WRITE a .ts file into
    // lib/research/ — a directory other suites walk in parallel worker threads — so the
    // whole-suite run failed intermittently with ENOENT inside an unrelated test.
    const raw = sources?.get(file) ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    const src = blankStrings(blankComments(raw));

    for (const m of src.matchAll(/\.from\(\s*['"`]\s*/g)) {
      const at = m.index!;
      const nameMatch = raw.slice(at).match(/^\.from\(\s*['"`](research_[a-z0-9_]+)['"`]\s*\)/);
      if (!nameMatch) continue;
      const table = nameMatch[1];
      const known = cols.get(table);
      if (!known) continue;                       // table absent from seeds — a different question

      const after = src.slice(at, at + 2000);
      const op = after.match(/\.(insert|update|upsert)\(\s*\{/);
      if (!op) continue;
      // slice(1, …): `after` STARTS at this `.from(`, so slicing from 0 matched itself and skipped
      // every candidate — the second reason this check reported zero for a broken tree.
      if (after.slice(1, op.index!).includes('.from(')) continue;

      const objOpen = at + op.index! + op[0].length - 1;
      const obj = objectAt(src, objOpen);
      if (!obj) continue;

      let depth = 0;
      for (let i = 0; i < obj.length; i++) {
        const ch = obj[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') depth--;
        if (depth !== 1) continue;

        // A real key follows `{` or `,`. A ternary's true-branch does not:
        //   storage_path: ok ? storagePath : null   →  "storagePath :" is not a column.
        const before = obj.slice(0, i).replace(/\s+$/, '');
        const prev = before[before.length - 1];
        if (prev !== '{' && prev !== ',') continue;

        const k = obj.slice(i).match(/^[\s,]*([a-z_][a-z0-9_]*)\s*:/i);
        if (k) {
          const key = k[1].toLowerCase();
          if (!RESERVED.has(key) && !known.has(key)) {
            found.push({ file, table, key, line: raw.slice(0, at).split('\n').length });
          }
          i += k[0].length - 1;
        }
      }
    }
  }
  return found;
}

const COLUMNS = seedColumns();
const FILES = [...walk('app'), ...walk('lib'), ...walk('worker/src')];

describe('the check can fail', () => {
  it('parsed the seeds', () => {
    const runs = COLUMNS.get('research_runs');
    expect(runs, 'research_runs not found in the seeds — the parser is broken').toBeTruthy();
    for (const c of ['status', 'limits', 'skipped_work', 'budget_summary', 'cost_usd']) {
      expect(runs!.has(c), `research_runs.${c} should have been parsed`).toBe(true);
    }
  });

  it('picks up multi-column ALTER TABLE', () => {
    // `ALTER TABLE research_projects ADD COLUMN research_status …, ADD COLUMN research_message …`
    // — matching only the first made the second look like a write to a missing column.
    const p = COLUMNS.get('research_projects')!;
    expect(p.has('research_status')).toBe(true);
    expect(p.has('research_message'), 'the second ADD COLUMN of a multi-column ALTER was missed').toBe(true);
  });

  it('SEES a write to a column that does not exist', () => {
    // The assertion that makes every "0 findings" below mean something. Without it this file passed
    // three times over a probe that could not detect an injected fake column.
    // The probe deliberately carries BOTH comment styles ahead of the write, and a URL. Without
    // them a broken comment-blanker goes unnoticed here: the first version of this probe was a
    // bare one-liner, and making the blanker non-length-preserving — the exact bug that made this
    // check report zero for a broken tree — still passed. Offsets only drift if there is something
    // ahead of the call for them to drift over.
    const fake = [
      '/* a block comment, long enough to shift every offset after it if it is removed',
      '   rather than blanked in place — which is what broke this three times */',
      '// a line comment mentioning https://example.test/research_runs for good measure',
      "await db.from('research_runs').update({ status: x, totally_fake_column: 1 }).eq('id', y);",
    ].join('\n');
    const REL = 'lib/research/__column_probe_check__.ts';
    const SRC = new Map([[REL, fake]]);
    const hits = badWrites(COLUMNS, [REL], SRC);
    expect(hits.map((h) => h.key)).toContain('totally_fake_column');
  });

  it('does NOT flag a ternary as a column', () => {
    // `storage_path: ok ? storagePath : null` was reported as a write to `storagepath`.
    const code = `await db.from('research_documents').insert({ storage_path: ok ? storagePath : null });`;
    const REL = 'lib/research/__column_probe_ternary__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badWrites(COLUMNS, [REL], SRC)).toEqual([]);
  });
});

// ── The READ side ───────────────────────────────────────────────────────────────────────────────
//
// A `.select()` naming a column that does not exist is worse than a bad write: PostgREST fails the
// WHOLE query, so the caller gets no row at all. Three were found on 2026-08-31, and the damage
// depended entirely on how each caller treated the error:
//
//   · `/api/share/[token]` asked for `legal_description`, `confidence_score` and
//     `boundary_summary`. None exists on research_projects. **Every share link has returned 404 for
//     its entire life** — the one surface a CUSTOMER sees.
//   · `export-to-cad` asked for `address` and `owner_name`. Neither exists. It returned
//     **"Project not found"** for every project, which reads as a bad id rather than a broken query
//     and is why it survived.
//   · the self-heal proposals list asked for `name` on a table whose column is `display_name`, and
//     destructured the error away — so it silently showed every proposal without its vendor.

/** `.select('a, b, alias:col')` immediately after `.from('research_…')`. */
function badSelects(cols: Map<string, Set<string>>, files: string[], sources?: Map<string, string>): Finding[] {
  const found: Finding[] = [];
  for (const file of files) {
    // A self-check may supply the source in memory. These probes used to WRITE a .ts file into
    // lib/research/ — a directory other suites walk in parallel worker threads — so the
    // whole-suite run failed intermittently with ENOENT inside an unrelated test.
    const raw = sources?.get(file) ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of raw.matchAll(/\.from\(\s*['"`](research_[a-z0-9_]+)['"`]\s*\)\s*(?:\r?\n\s*)?\.select\(\s*(['"`])([^'"`]*)\2/g)) {
      const known = cols.get(m[1]);
      if (!known) continue;
      const list = m[3];
      // `*` selects everything. The `(` skip is for an embedded resource — `other_table(a, b)` is a
      // join, not a column — and is REDUNDANT rather than load-bearing: the name-shape test below
      // already rejects `other_table(a` and `b)` because they are not identifiers. Removing it
      // changes no result, which a mutation confirmed. Kept because the intent is not obvious from
      // that regex, and the next person adding a join should find the reason here rather than
      // rediscover it.
      if (list.trim() === '*' || list.includes('(')) continue;
      for (const part of list.split(',')) {
        // `alias:column` — the COLUMN is what the database must have.
        const name = part.trim().split(':').pop()!.trim();
        if (!name || name === '*' || !/^[a-z_][a-z0-9_]*$/i.test(name)) continue;
        if (!known.has(name.toLowerCase())) {
          found.push({ file, table: m[1], key: name, line: raw.slice(0, m.index!).split('\n').length });
        }
      }
    }
  }
  return found;
}

describe('every research select names a real column', () => {
  it('SEES a select for a column that does not exist', () => {
    // Same control as the write side, for the same reason.
    const code = `await db.from('research_runs').select('id, totally_fake_col, status');`;
    const REL = 'lib/research/__select_probe_check__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badSelects(COLUMNS, [REL], SRC).map((h) => h.key)).toContain('totally_fake_col');
  });

  it('does not flag an alias — the COLUMN is what must exist', () => {
    // `legal_description:legal_description_summary` renames on the way out. Flagging the alias
    // would have made the fix for the share-link break look like a new defect.
    const code = `await db.from('research_projects').select('id, legal_description:legal_description_summary');`;
    const REL = 'lib/research/__select_probe_alias__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badSelects(COLUMNS, [REL], SRC)).toEqual([]);
  });

  it('does not flag an embedded resource — `documents(id, name)` is a join, not a column', () => {
    // No research select uses one TODAY, so removing this skip changes nothing and the mutation
    // survives. It is still worth pinning: the first `.select('a, other_table(b)')` written here
    // would otherwise be reported as two missing columns, and the report would be wrong in the
    // direction that sends somebody to rename working code.
    const code = `await db.from('research_projects').select('id, research_documents(id, file_type)');`;
    const REL = 'lib/research/__select_probe_embed__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badSelects(COLUMNS, [REL], SRC)).toEqual([]);
  });

  it('has no select naming a column the seeds do not define', () => {
    const bad = badSelects(COLUMNS, FILES);
    const lines = [...new Set(bad.map((b) => `${b.table}.${b.key}  (${b.file}:${b.line})`))];
    expect(
      lines,
      lines.length
        ? 'PostgREST fails the WHOLE query when a select names a column that does not exist, so the '
          + 'caller gets no row — which surfaces as "not found", or as an empty list, depending only '
          + `on how the caller treats the error:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});

// ── The FILTER side ─────────────────────────────────────────────────────────────────────────────
//
// `.eq()`, `.order()`, `.in()` and friends fail the whole query exactly like a bad select does — a
// filter on a column that does not exist is a 400, not an empty result. Third of the three ways to
// name a column, and the only one that came back CLEAN when it was swept.
//
// It is guarded anyway. A check written only after something breaks arrives one incident late, and
// this one costs the same nine lines whether or not it ever fires. Its controls are what make the
// zero meaningful.

// `[A-Za-z0-9_.]`, not `[a-z0-9_.]`. The lowercase-only version could not match
// `.eq('limits.maxCostUsd', …)` AT ALL — the closing quote never followed the match — so every
// camelCase JSONB path was invisible to this check, and the test that claimed to prove JSONB paths
// are handled passed without ever matching one. A mutation removing the path-splitting survived,
// which is how that was noticed.
const FILTER_OPS = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"`]([A-Za-z_][A-Za-z0-9_.]*)['"`]/g;

function badFilters(cols: Map<string, Set<string>>, files: string[], sources?: Map<string, string>): Finding[] {
  const found: Finding[] = [];
  for (const file of files) {
    // A self-check may supply the source in memory. These probes used to WRITE a .ts file into
    // lib/research/ — a directory other suites walk in parallel worker threads — so the
    // whole-suite run failed intermittently with ENOENT inside an unrelated test.
    const raw = sources?.get(file) ?? fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of raw.matchAll(/\.from\(\s*['"`](research_[a-z0-9_]+)['"`]\s*\)/g)) {
      const known = cols.get(m[1]);
      if (!known) continue;
      // The chain runs until the next `.from(` — anything after that belongs to another table.
      let chain = raw.slice(m.index! + m[0].length, m.index! + 1200);
      const next = chain.indexOf('.from(');
      if (next >= 0) chain = chain.slice(0, next);

      for (const f of chain.matchAll(FILTER_OPS)) {
        // `metadata.foo` addresses a key INSIDE a JSONB column; the column is the part before the
        // dot, and that is what has to exist.
        const col = f[2].split('.')[0].toLowerCase();
        if (!known.has(col)) {
          found.push({ file, table: m[1], key: `${f[1]}('${col}')`, line: raw.slice(0, m.index!).split('\n').length });
        }
      }
    }
  }
  return found;
}

describe('every research filter names a real column', () => {
  it('SEES an .eq() on a column that does not exist', () => {
    const code = `await db.from('research_runs').select('*').eq('fake_filter_col', 1);`;
    const REL = 'lib/research/__filter_probe_eq__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badFilters(COLUMNS, [REL], SRC).length).toBe(1);
  });

  it('SEES an .order() on one too — sorting is a column reference as much as filtering is', () => {
    const code = `await db.from('research_runs').select('*').order('nonexistent_sort');`;
    const REL = 'lib/research/__filter_probe_order__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badFilters(COLUMNS, [REL], SRC).length).toBe(1);
  });

  it('does not flag a JSONB path — `limits.maxCostUsd` addresses a key inside a real column', () => {
    const code = `await db.from('research_runs').select('*').eq('limits.maxCostUsd', 2);`;
    const REL = 'lib/research/__filter_probe_jsonb__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badFilters(COLUMNS, [REL], SRC)).toEqual([]);
  });

  it('does not attribute a filter to the wrong table', () => {
    // Two chains in one file. Without the stop at the next `.from(`, the second chain's filters
    // would be checked against the FIRST table's columns — which is how the very first version of
    // the write sweep produced 136 findings including one table's columns on another.
    const code = [
      `await db.from('research_runs').select('*').eq('phase', p);`,
      `await db.from('research_projects').select('*').eq('county', c);`,
    ].join('\n');
    const REL = 'lib/research/__filter_probe_two__.ts';
    const SRC = new Map([[REL, code]]);
    expect(badFilters(COLUMNS, [REL], SRC)).toEqual([]);
  });

  it('has no filter naming a column the seeds do not define', () => {
    const bad = badFilters(COLUMNS, FILES);
    const lines = [...new Set(bad.map((b) => `${b.table}.${b.key}  (${b.file}:${b.line})`))];
    expect(
      lines,
      lines.length
        ? 'A filter on a column that does not exist is a 400, not an empty result — the whole query '
          + `fails:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});

describe('every research write hits a real column', () => {
  it('has no write to a column the seeds do not define', () => {
    const bad = badWrites(COLUMNS, FILES);
    const lines = [...new Set(bad.map((b) => `${b.table}.${b.key}  (${b.file}:${b.line})`))];
    expect(
      lines,
      lines.length
        ? 'These write to columns that do not exist. PostgREST rejects the write and returns an '
          + '`{ error }` most callers are not reading — nothing throws, the route returns 200, and '
          + `the data is gone:\n  ${lines.join('\n  ')}`
        : '',
    ).toEqual([]);
  });
});
