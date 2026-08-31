// __tests__/research/data-categories-agree.test.ts
//
// ── FOUR COPIES OF ONE SET, IN FOUR LANGUAGES ───────────────────────────────────────────────────
//
// `data_category` is written down four times:
//
//   1. `types/research.ts`          — the TypeScript union
//   2. `lib/research/prompts.ts`    — the bracketed list the extraction prompt shows the model
//   3. `seeds/090_research_tables.sql` — the table's CHECK constraint
//   4. `DataPointsPanel.tsx`        — the label map and the display ordering
//
// Nothing kept them in step, and they had already drifted: `zoning`, `utility_info`, `annotation`
// and `symbol` were in the prompt and the constraint but in neither UI list (fixed 2026-08-31).
//
// The drift that matters most is 2 vs 3. PostgREST returns `{ error }` rather than throwing, so a
// category the prompt asks for that the CHECK constraint rejects does not crash the run — the
// insert is refused and the data point is silently absent from the report. A partial extraction
// that does not say what is missing is indistinguishable from a complete one.
//
// Each parser below carries a CONTROL. A regex that stops matching returns an empty set, and an
// empty set agrees with everything — the check would pass by finding nothing, which is the failure
// mode this repo has hit repeatedly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** 1. The TypeScript union — the reference all the others are compared against. */
function unionCategories(): string[] {
  const src = read('types/research.ts');
  const m = src.match(/export type DataCategory =([\s\S]*?);/);
  expect(m, 'the DataCategory union declaration moved').not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** 2. The bracketed list inside the extraction prompt — bare words, not quoted. */
function promptCategories(): string[] {
  const src = read('lib/research/prompts.ts');
  const m = src.match(/data_category: one of \[([^\]]+)\]/);
  expect(m, 'the prompt no longer lists the categories in `data_category: one of [...]`').not.toBeNull();
  return m![1].split(',').map((s) => s.trim());
}

/** 3. The CHECK constraint on `research_data_points`. */
function sqlCategories(): string[] {
  const src = read('seeds/090_research_tables.sql');
  const m = src.match(/data_category\s+TEXT NOT NULL CHECK \(data_category IN \(([\s\S]*?)\)\)/);
  expect(m, 'the data_category CHECK constraint moved or changed shape').not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** 4a. The UI label map. */
function labelCategories(): string[] {
  const src = read('app/admin/research/components/DataPointsPanel.tsx');
  const m = src.match(/const CATEGORY_LABELS[^=]*= \{([\s\S]*?)\n\};/);
  expect(m, 'CATEGORY_LABELS moved').not.toBeNull();
  return [...m![1].matchAll(/^\s{2}([a-z_]+):/gm)].map((x) => x[1]);
}

/** 4b. The UI display ordering. */
function orderCategories(): string[] {
  const src = read('app/admin/research/components/DataPointsPanel.tsx');
  const m = src.match(/const CATEGORY_ORDER: DataCategory\[\] = \[([\s\S]*?)\];/);
  expect(m, 'CATEGORY_ORDER moved').not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

const SOURCES = {
  'the type union': unionCategories,
  'the extraction prompt': promptCategories,
  'the CHECK constraint': sqlCategories,
  'the UI label map': labelCategories,
  'the UI ordering': orderCategories,
};

describe('every list of data_category values is parsed, not silently empty', () => {
  // The control for all five. An empty set agrees with everything.
  it.each(Object.keys(SOURCES))('%s yields a plausible number of categories', (name) => {
    const got = SOURCES[name as keyof typeof SOURCES]();
    expect(got.length, `${name} parsed to ${got.length} categories`).toBeGreaterThan(20);
  });

  it('and each one contains `call`, the pipeline\'s core output', () => {
    for (const [name, fn] of Object.entries(SOURCES)) {
      expect(fn(), `${name} does not mention 'call'`).toContain('call');
    }
  });

  it('and none of them contains a category that does not exist', () => {
    // Anti-control: proves the assertions below can actually fail.
    for (const [name, fn] of Object.entries(SOURCES)) {
      expect(fn(), name).not.toContain('zzz_fake_category');
    }
  });
});

describe('the four copies agree with the type union', () => {
  const expected = () => [...unionCategories()].sort();

  it.each(Object.keys(SOURCES).filter((k) => k !== 'the type union'))('%s matches', (name) => {
    expect([...SOURCES[name as keyof typeof SOURCES]()].sort()).toEqual(expected());
  });
});

describe('the prompt and the constraint specifically', () => {
  it('never asks the model for a category the table would reject', () => {
    // This is the pair whose drift is invisible in production: PostgREST refuses the insert and
    // returns `{ error }`, the run continues, and the data point is simply not in the report.
    const rejected = promptCategories().filter((c) => !sqlCategories().includes(c));
    expect(rejected, `the prompt asks for ${rejected.join(', ')}, which the CHECK constraint rejects`)
      .toEqual([]);
  });

  it('never accepts a category the model is never told to produce', () => {
    // The reverse is not a bug, but it is dead surface area worth knowing about.
    const unasked = sqlCategories().filter((c) => !promptCategories().includes(c));
    expect(unasked).toEqual([]);
  });
});

describe('the UI can name every category the pipeline can produce', () => {
  it('has a real label for each — no lowercased fallback, no paperclip', () => {
    const src = read('app/admin/research/components/DataPointsPanel.tsx');
    const m = src.match(/const CATEGORY_LABELS[^=]*= \{([\s\S]*?)\n\};/)!;
    for (const cat of unionCategories()) {
      expect(m[1], `no label for '${cat}'`).toMatch(new RegExp(`^\\s{2}${cat}:`, 'm'));
    }
  });

  it('declares the label map as Record, not Partial<Record>', () => {
    // `Partial` is what let four categories go unlabelled without a type error. With a plain
    // `Record`, adding a member to `DataCategory` fails typecheck here, which is where it should.
    const src = read('app/admin/research/components/DataPointsPanel.tsx');
    expect(src).toContain('const CATEGORY_LABELS: Record<DataCategory,');
    expect(src).not.toContain('CATEGORY_LABELS: Partial<Record<DataCategory');
  });
});
