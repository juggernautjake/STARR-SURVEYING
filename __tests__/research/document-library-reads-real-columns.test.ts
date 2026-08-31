// __tests__/research/document-library-reads-real-columns.test.ts
//
// ── THE DOCUMENT LIBRARY HAD NEVER WORKED ───────────────────────────────────────────────────────
//
// Found 2026-08-31, by photographing the screen rather than by any assertion. `/admin/research/
// [projectId]/documents` rendered **seventeen empty boxes**: the header said "17 documents", the
// filter chips were right, and every row was blank.
//
//     const data = (await res.json()) as { documents: ResearchDocument[] };
//
// The interface declared `documentId`, `type`, `instrumentNumber`, `description`, `grantor`,
// `grantee`, `recordedDate`, `pageCount`, `fileFormat`, `sizeBytes`, `purchased` and `source`. The
// route does `select('*')` on `research_documents`, whose columns are `id`, `document_type`,
// `document_label`, `original_filename`, `page_count`, `file_size_bytes`, `recorded_date`,
// `source_type`, `storage_url` and so on.
//
// **Not one field matched.** Every value was `undefined`. `DOC_TYPE_ICONS[doc.type]` was
// `undefined`, and `key={doc.documentId}` was `undefined` for all seventeen rows simultaneously.
//
// Nothing errored, `tsc` was happy, the page loaded, the count was correct, and the symptom was
// silence. Fourth instance in this repository of a hand-written interface describing an object
// nobody produces — after `activity_log`'s action/details, `research_documents.analysis_metadata`,
// and the owner name in G10.
//
// ── SO THE TEST IS THE COLUMN LIST, AGAINST THE SEEDS ───────────────────────────────────────────
//
// Same source of truth as `writes-hit-real-columns.test.ts`: the `create table` statements in
// `seeds/`. A cast inside a `.tsx` is a claim nobody can check. A key list beside a shaping
// function is a claim a test can refuse.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  toCard, toCards, kindOf, titleOf, instrumentOf, isImageRow, sourceLabelOf, formatBytes,
  DOCUMENT_ROW_COLUMNS, NEVER_PRODUCED_KEYS, type DocumentRow,
} from '@/app/admin/research/[projectId]/documents/document-rows';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every column of `research_documents`, from the `create table` and `alter table` in seeds/. */
function documentColumns(): Set<string> {
  const dir = path.join(ROOT, 'seeds');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const cols = new Set<string>();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?research_documents\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const raw of m[1].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      const name = /^([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1]?.toLowerCase();
      if (name && !['primary', 'foreign', 'unique', 'constraint', 'check'].includes(name)) cols.add(name);
    }
  }
  // Columns added later live in `alter table … add column`, and the library reads several of them.
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?research_documents\s+([\s\S]*?);/gi)) {
    for (const a of m[1].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
      cols.add(a[1].toLowerCase());
    }
  }
  return cols;
}

const COLUMNS = documentColumns();

describe('the schema this is checked against', () => {
  it('found the table', () => {
    // Control. An empty set agrees with every key, and this whole file would pass by measuring
    // nothing — which is precisely the failure mode being guarded against.
    expect(COLUMNS.size, 'no research_documents columns were parsed out of seeds/').toBeGreaterThan(10);
    expect(COLUMNS.has('id')).toBe(true);
    expect(COLUMNS.has('research_project_id')).toBe(true);
  });

  it('and does not contain a column nobody defined', () => {
    expect(COLUMNS.has('zzz_not_a_column')).toBe(false);
  });
});

describe('every column the library reads exists', () => {
  it.each([...DOCUMENT_ROW_COLUMNS])('%s is a real column', (col) => {
    expect(
      COLUMNS.has(col),
      `The Document Library reads \`${col}\` and research_documents has no such column. `
      + 'Every row will render that field blank, which is exactly how this page shipped.',
    ).toBe(true);
  });

  it('has a list to check', () => {
    expect(DOCUMENT_ROW_COLUMNS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('and the names it used to read exist nowhere', () => {
  // The other direction, and the one that makes the finding legible: these are the twelve the
  // broken cast declared. Keeping them asserted means the cast cannot quietly come back.
  it.each([...NEVER_PRODUCED_KEYS])('%s is NOT a column', (key) => {
    expect(COLUMNS.has(key), `${key} is a column now — the note in document-rows.ts is stale`)
      .toBe(false);
  });

  it('and the page no longer declares them', () => {
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(page, 'the camelCase cast is back').not.toContain('documentId: string;');
    expect(page).not.toContain('instrumentNumber?: string;');
  });

  it('the page uses the shaping module', () => {
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(page).toContain("from './document-rows'");
    expect(page).toContain('toCards(');
  });
});

// ── The shaping ─────────────────────────────────────────────────────────────────────────────────

const row = (over: Partial<DocumentRow> = {}): DocumentRow => ({ id: 'abc12345-0000', ...over });

describe('a row becomes something a person can read', () => {
  it('NEVER renders a blank title', () => {
    // The whole finding in one assertion. A row with nothing in it is indistinguishable from a
    // rendering bug — because it was one, seventeen times.
    for (const r of [row(), row({ document_label: '' }), row({ original_filename: '   ' })]) {
      expect(toCard(r).title.trim().length, JSON.stringify(r)).toBeGreaterThan(0);
    }
  });

  it('prefers the label, then the filename, then the id', () => {
    expect(titleOf(row({ document_label: 'EASEMENT — A to B', original_filename: 'deed_1' })))
      .toBe('EASEMENT — A to B');
    expect(titleOf(row({ original_filename: 'deed_1945006189' }))).toBe('deed_1945006189');
    expect(titleOf(row())).toContain('abc12345');
  });

  it('folds document_type into the four kinds the filter bar offers', () => {
    expect(kindOf(row({ document_type: 'deed' }))).toBe('deed');
    expect(kindOf(row({ document_type: 'Plat' }))).toBe('plat');
    expect(kindOf(row({ document_type: 'restrictive_covenant' }))).toBe('other');
    expect(kindOf(row({ document_type: null }))).toBe('other');
  });

  it('pulls the instrument number out of the label when the column has none', () => {
    expect(instrumentOf(row({ document_label: 'JUDGMENT (Instr. 1945006189) (2 pages)' })))
      .toBe('1945006189');
    expect(instrumentOf(row({ recording_info: { instrument_number: '2004045569' } })))
      .toBe('2004045569');
    expect(instrumentOf(row({ document_label: 'A deed with no number' }))).toBeNull();
  });

  it('distinguishes what a person uploaded from what the run retrieved', () => {
    // The owner asked to upload their own files AND to check what was retrieved. If the two look
    // identical in the list, neither question can be answered from it.
    expect(toCard(row({ source_type: 'user_upload' })).isUpload).toBe(true);
    expect(toCard(row({ source_type: 'clerk_portal' })).isUpload).toBe(false);
    expect(sourceLabelOf(row({ source_type: 'user_upload' }))).toBe('Uploaded');
    expect(sourceLabelOf(row({ source_type: 'clerk_portal' }))).toBe('Clerk Portal');
    expect(sourceLabelOf(row({ source_type: null }))).toBe('Retrieved');
  });

  it('knows what can be SHOWN rather than only downloaded', () => {
    // "be able to view all images" — a plat you cannot see at full size is a plat you have not
    // checked.
    expect(isImageRow(row({ file_type: 'image/jpeg' }))).toBe(true);
    expect(isImageRow(row({ file_type: 'tif' }))).toBe(true);
    expect(isImageRow(row({ file_type: 'application/pdf' }))).toBe(false);
    expect(isImageRow(row({ file_type: null }))).toBe(false);
  });

  it('prefers the rendered PDF over the raw file, and falls back to the source', () => {
    expect(toCard(row({ pages_pdf_url: 'a', storage_url: 'b', source_url: 'c' })).fileUrl).toBe('a');
    expect(toCard(row({ storage_url: 'b', source_url: 'c' })).fileUrl).toBe('b');
    expect(toCard(row({ source_url: 'c' })).fileUrl).toBe('c');
    expect(toCard(row()).fileUrl).toBeNull();
  });

  it('coerces counts rather than rendering NaN or undefined', () => {
    expect(toCard(row({ page_count: 3, file_size_bytes: 2048 })).pageCount).toBe(3);
    expect(toCard(row({ page_count: null })).pageCount).toBeNull();
    expect(toCard(row({ page_count: 'three' as unknown as number })).pageCount).toBeNull();
  });

  it('survives a payload of the wrong shape', () => {
    for (const junk of [null, undefined, 'nope', 42, {}, { documents: 'nope' }]) {
      expect(() => toCards(junk), String(junk)).not.toThrow();
      expect(toCards(junk)).toEqual([]);
    }
  });

  it('accepts both the wrapper and a bare array', () => {
    // The API returns `{ documents: [...] }`. It has returned a bare array elsewhere in this
    // codebase, and a list page that renders nothing is the most expensive way to find out.
    expect(toCards({ documents: [row({ document_label: 'A' })] })).toHaveLength(1);
    expect(toCards([row({ document_label: 'A' })])).toHaveLength(1);
  });

  it('drops a row with no id rather than rendering it with an undefined key', () => {
    // `key={undefined}` on seventeen siblings is a React key collision on top of a blank row.
    expect(toCards({ documents: [{ document_label: 'no id' }, row()] })).toHaveLength(1);
  });

  it('formats sizes, and says nothing when there is no size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(709976)).toBe('693.3 KB');
    expect(formatBytes(2_200_000)).toBe('2.1 MB');
    expect(formatBytes(null)).toBe('');
  });
});
