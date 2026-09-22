import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── A CHECK CONSTRAINT THE WRITERS COULD NOT SATISFY ───────────────────────────────────────────
//
// Seed 531 allowed `research_document_purchases.status` three values — completed, failed, refunded.
// On 2026-09-02 the worker began writing `paid_disabled` and `permission_unreadable` rows so the
// report could say "N documents behind a paywall were not retrieved". Every insert violated the
// CHECK; the writer never throws, so it became one warning line per run and a table that stayed at
// zero rows — the exact condition the write was added to end. Two plan items said the notice was
// reachable. Found by the 2026-09-03 platform audit (paid-documents and data-model readers), and
// confirmed against the live constraint before seed 629 widened it.
//
// The schema guards this repo already had compare column NAMES and unique indexes. Neither can see
// a CHECK's value list, which is how the seed and the writer disagreed without a test going red.
// This one reads the values.

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The seed that currently OWNS the constraint — the highest-numbered one that redefines it.
 *
 *  Found rather than named, because this is the second seed to widen the CHECK and there will be a
 *  third. A test pinned to `629` would, on the day 657 landed, have gone on cheerfully validating
 *  the code against a constraint the database no longer had. */
function owningSeedFile(): string {
  const dir = path.join(ROOT, 'seeds');
  const owners = fs.readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .filter((f) => /ADD CONSTRAINT research_document_purchases_status_check/i.test(
      fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (owners.length === 0) throw new Error('no seed defines research_document_purchases_status_check');
  return `seeds/${owners[owners.length - 1]!}`;
}

/** The literals the owning seed admits, parsed from the SQL rather than retyped here. */
function allowedBySeed(): Set<string> {
  // Comments first: a seed's header QUOTES the CHECK it replaces to explain what it replaces, and a
  // lazy match found that one — the control below is what noticed.
  const sql = read(owningSeedFile()).replace(/^\s*--[^\n]*/gm, '');
  const m = sql.match(/CHECK \(status IN \(([\s\S]*?)\)\)/);
  if (!m) throw new Error(`${owningSeedFile()}: CHECK (status IN (...)) not found`);
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

// ── FINDING THE WRITERS INSTEAD OF LISTING THEM ─────────────────────────────────────────────────
//
// The tests below used to check four writers by name. On 2026-09-21 a fifth was added —
// `recordOffers`, writing `status: 'offered'` — and every insert it made violated the CHECK,
// silently, which is exactly what the header above describes happening the FIRST time. This file
// was green throughout, because the new writer was not on its list.
//
// A guard that enumerates its subjects only ever catches the subjects somebody remembered to add.
// So: find every file that inserts into this table, and read the status literals out of it.
const SEARCH_ROOTS = ['worker/src', 'lib', 'app'];
const TABLE = 'research_document_purchases';

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(full); }
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  for (const r of SEARCH_ROOTS) walk(path.join(ROOT, r));
  return out;
}

/** An insert or upsert whose TARGET is this table.
 *
 *  Tied to the table syntactically, not by "the file mentions it somewhere and also inserts
 *  something". `worker/src/index.ts` writes a dozen tables and names this one in a comment; a
 *  file-level match there produced 85 false positives from unrelated `status: 'ok'` literals,
 *  which is how a guard becomes something people delete.
 *
 *  Both spellings are covered: `.from(TABLE).insert(` and the worker's `loose(client, TABLE)`
 *  cast — the table's row type is `never` in the generated schema, so the worker goes through a
 *  helper and a plain `.from(` match would miss every write it makes. */
const WRITE_TO_TABLE = new RegExp(
  String.raw`(?:\.from\(|loose\([A-Za-z_$][\w$]*,\s*)'` + TABLE + String.raw`'\)\s*(?:\r?\n\s*)*\.(?:insert|upsert)\(`,
  'g',
);

/** How far back from the insert to read status literals.
 *
 *  The row being inserted is almost always built just above the call — `recordPurchase` builds it
 *  inline, `recordSkippedPurchases` and `recordOffers` build a `payload` a dozen lines up. A window
 *  is a heuristic, and the honest statement of its limit is: a writer that builds its row more than
 *  this far from the insert is not checked. It is set wide enough for every writer in the tree and
 *  narrow enough to stay inside the enclosing function. */
const WINDOW_BEFORE = 2000;

function writerFiles(): string[] {
  return sourceFiles().filter((f) => WRITE_TO_TABLE.test(fs.readFileSync(f, 'utf8')));
}

/** Status literals written near an insert into this table, per file. */
function statusesWritten(): Array<{ file: string; status: string }> {
  const out: Array<{ file: string; status: string }> = [];
  for (const file of writerFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const hit of src.matchAll(WRITE_TO_TABLE)) {
      const from = Math.max(0, hit.index! - WINDOW_BEFORE);
      const region = src.slice(from, hit.index! + hit[0].length);
      for (const m of region.matchAll(/status:\s*'([a-z_]+)'/g)) out.push({ file: rel, status: m[1]! });
    }
  }
  return out;
}

describe('every purchase status the code writes or counts is one the table admits', () => {
  const allowed = allowedBySeed();

  it('CONTROL: the seed parses to the three original statuses plus the skip statuses', () => {
    expect(allowed.has('completed')).toBe(true);
    expect(allowed.has('paid_disabled')).toBe(true);
    expect(allowed.size).toBeGreaterThanOrEqual(8);
  });

  it('CONTROL: the sweep finds the ledger and reads real statuses out of it', () => {
    // Guards the guard, twice. A sweep that matched no file, or a window that read no literals,
    // would make the test below pass forever — which is the exact failure this rewrite exists to
    // stop, so its replacement must not be able to fail the same way.
    const files = writerFiles().map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
    expect(files).toContain('worker/src/services/purchase-ledger.ts');
    const found = new Set(statusesWritten().map((s) => s.status));
    expect(found.has('completed'), 'the ledger writes completed purchases').toBe(true);
    expect(found.has('offered'), 'the ledger writes offers').toBe(true);
  });

  // ── THE ONE THAT WOULD HAVE CAUGHT `offered` ──────────────────────────────────────────────────
  it('every status literal written to this table is one the table admits', () => {
    const offences = statusesWritten()
      .filter((s) => !allowed.has(s.status))
      .map((s) => `${s.file} writes status: '${s.status}'`);
    expect(
      [...new Set(offences)],
      'A status the CHECK does not admit. The insert fails 23514, no writer throws, and the row '
      + 'never appears — so the feature looks built and the table stays empty. Widen the constraint '
      + `in a new seed (${owningSeedFile()} owns it now) or stop writing the status.`,
    ).toEqual([]);
  });

  it('the worker purchase gate writes only admitted statuses', () => {
    const src = read('worker/src/research/purchase-gate.ts');
    const m = src.match(/export type PurchaseSkipStatus = ([^;]+);/);
    expect(m, 'PurchaseSkipStatus type not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `purchase-gate writes '${s}'`).toBe(true);
  });

  it('the app-side skipStatusFor returns only admitted statuses', () => {
    const src = read('lib/research/paid-documents.ts');
    const m = src.match(/export function skipStatusFor\([^)]*\): ([^{]+)\{/);
    expect(m, 'skipStatusFor signature not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `paid-documents returns '${s}'`).toBe(true);
  });

  it('the analyze route counts only admitted statuses — a status it counts that nothing can write is a notice that never appears', () => {
    const src = read('app/api/admin/research/[projectId]/analyze/route.ts');
    const m = src.match(/\.in\('status', \[([^\]]+)\]\)/);
    expect(m, 'the .in(status, [...]) filter not found').toBeTruthy();
    const literals = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const s of literals) expect(allowed.has(s), `analyze route counts '${s}'`).toBe(true);
  });

  it('the purchase orchestrator\'s budget_exceeded is admitted', () => {
    const src = read('worker/src/services/document-purchase-orchestrator.ts');
    expect(src).toContain("status: 'budget_exceeded'");
    expect(allowed.has('budget_exceeded')).toBe(true);
  });

  it('seed 531\'s firm-wide uniqueness still applies only to completed purchases', () => {
    // A skipped document may be skipped by any number of runs; only money that moved is unique.
    const s531 = read('seeds/531_research_document_purchases.sql');
    expect(s531).toMatch(/WHERE status = 'completed'/);
    const s629 = read('seeds/629_purchase_skip_statuses.sql');
    expect(s629).not.toMatch(/DROP INDEX/i);
  });
});
