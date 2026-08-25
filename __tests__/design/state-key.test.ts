// __tests__/design/state-key.test.ts
//
// V1 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"each page that has tabs… has its own like, sub page listed… so that I can edit each one
// individually."*
//
// The design system's unit was a ROUTE. `/admin/billing` has three tabs and one design row, so the
// record described whichever tab happened to be showing. Tolerable when tabs were rare; not now,
// because the consolidation is turning 111 sidebar links into tabs.
//
// This slice adds the column and carries it through the types. NOTHING READS IT YET — V2 teaches the
// deriver to find a page's states — so what is worth pinning here is the shape, and the two
// decisions inside it that a future reader would otherwise have to re-derive.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const SEED = fs.readFileSync(path.join(ROOT, 'seeds/615_design_state_key.sql'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'lib/design/server.ts'), 'utf8');
const DOSSIER = fs.readFileSync(path.join(ROOT, 'lib/design/dossier-server.ts'), 'utf8');

describe('the column exists where a state can differ', () => {
  for (const table of ['design_mockups', 'design_page_dossiers', 'design_checklist_items']) {
    it(`${table} has state_key`, () => {
      expect(SEED).toMatch(new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]{0,200}?ADD COLUMN IF NOT EXISTS state_key`));
    });
  }

  it('design_checklist_state deliberately does NOT', () => {
    // A design belongs to exactly one state, so the design id already carries the answer. A second
    // column would be a second place for the same fact to be recorded, and so a second place for it
    // to be wrong. The plan asked for it here; this is the deviation, on purpose.
    const tail = SEED.slice(SEED.indexOf('AND WHAT DELIBERATELY DOES NOT CHANGE'));
    expect(tail).toMatch(/design_checklist_state/);
    expect(SEED).not.toMatch(/ALTER TABLE public\.design_checklist_state/);
  });
});

describe("'' means the route as a whole, and it is NOT NULL", () => {
  it('every state_key defaults to the empty string', () => {
    const adds = SEED.match(/ADD COLUMN IF NOT EXISTS state_key[^;,]*/g) ?? [];
    expect(adds).toHaveLength(3);
    for (const a of adds) expect(a).toMatch(/TEXT NOT NULL DEFAULT ''/);
  });

  it('because a nullable column cannot be part of a primary key', () => {
    // The reason the plan's "null-defaulting" was not followed. `design_page_dossiers.route` was the
    // PK and a tabbed route needs one dossier per tab, so the key becomes `(route, state_key)` —
    // and Postgres forbids NULL in a primary key.
    expect(SEED).toMatch(/ADD PRIMARY KEY \(route, state_key\)/);
    expect(SEED).toMatch(/Postgres forbids NULL in a primary key/i);
  });

  it('and the PK change is guarded so the seed can be run twice', () => {
    // Seeds in this repo are re-run. Dropping a constraint that is already gone would fail the whole
    // file, and a migration that only works once is one nobody dares run.
    expect(SEED).toMatch(/IF EXISTS \(\s*SELECT 1 FROM pg_constraint/);
    expect(SEED).toMatch(/DROP CONSTRAINT design_page_dossiers_pkey/);
  });
});

describe('the types carry it, so the column cannot be added and forgotten', () => {
  it('the design summary exposes stateKey', () => {
    expect(SERVER).toMatch(/stateKey: string;/);
    expect(SERVER).toMatch(/stateKey: row\.state_key \?\? '',/);
  });

  it('and the shared column list fetches it', () => {
    // The `--stale` bug: a query that fetches fewer columns than `summarise()` reads does not fail,
    // it returns undefined and the caller gets a default. One list, so that cannot drift again.
    expect(SERVER).toMatch(/const SUMMARY_COLS = '[^']*\bstate_key\b[^']*'/);
  });

  it('the dossier row carries it too', () => {
    expect(DOSSIER).toMatch(/state_key: string;/);
    expect(DOSSIER).toMatch(/\.select\('route, state_key,/);
  });

  it('is named state_key, not view_key', () => {
    // `design_mockups` already has a `views` column meaning the desktop/mobile pair. A `view_key`
    // beside it would be misread by the first person to touch it. A design has two axes and they
    // multiply: state × viewport.
    // Checks for a COLUMN called view_key, not for the string — the seed explains at length why
    // it is not called that, and a bare /view_key/ failed on its own documentation. A guard that
    // fires on prose about the thing it guards teaches people to stop writing the prose.
    expect(SEED).not.toMatch(/(ADD COLUMN|COLUMN IF NOT EXISTS)[^;]*view_key/);
    expect(SERVER).not.toMatch(/viewKey/);
  });
});
