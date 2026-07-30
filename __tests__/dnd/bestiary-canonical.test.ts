// __tests__/dnd/bestiary-canonical.test.ts — one creature, one entry in the list (N7 / N3-6).
//
// The owner reported the bestiary "showing a bunch of transposed duplicates". Measured: 5,025 rows for
// 3,659 creatures, with Badger, Balor, Behir, Ghoul and Animated Armor at TEN ROWS EACH.
//
// Seed 468's view folds those into one entry per creature, and this pins the decisions it encodes plus the
// wiring that reads it — both halves, because a correct view that nothing queries is this repo's most
// common defect and a query pointed at the wrong relation is invisible in a screenshot.
//
// A seed cannot be executed here, so the SQL assertions are the same shape as bestiary-schema.test.ts:
// they assert what the SQL SAYS, and `npm run audit:bestiary` asserts what the data DOES.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(process.cwd(), 'seeds/468_dnd_creatures_canonical.sql'), 'utf8');
// Comments stripped for the negative assertions — this file's own prose discusses what it must NOT
// contain, and matching that prose is the trap this suite has fallen into repeatedly.
const code = SQL.replace(/^\s*--.*$/gm, '');
const query = readFileSync(join(process.cwd(), 'lib/dnd/bestiary/query.ts'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/bestiary/page.tsx'), 'utf8');
const audit = readFileSync(join(process.cwd(), 'scripts/audit-bestiary.mjs'), 'utf8');

describe('the canonical view folds rows into creatures', () => {
  it('is a VIEW over the table, so no row is deleted to tidy a list', () => {
    // N3 keeps a published row and a derived one separate on purpose, and 44 of the generated rows carry
    // fetched artwork with its own licence. Deleting to dedupe would destroy both.
    expect(code).toMatch(/CREATE MATERIALIZED VIEW public\.dnd_creatures_canonical/);
    expect(code).not.toMatch(/DELETE FROM public\.dnd_creatures\b/);
    expect(code).not.toMatch(/TRUNCATE/i);
  });

  it('keys identity on the exact name, never a fuzzy match', () => {
    // The SAME key loadSiblings uses on the creature page. A list that groups one way while the page it
    // opens groups another is worse than either rule alone.
    expect(code).toMatch(/PARTITION BY lower\(btrim\(c\.name\)\)/);
    // "Badger" must never absorb "Giant Badger", and similarity matching is exactly how it would.
    expect(code).not.toMatch(/similarity\(|%>|LIKE\s+'%'\s*\|\|/i);
  });

  it('never lets a row we generated represent a creature a publisher wrote', () => {
    // First key in the ranking: the 600 `Transposed from …` rows are a stale cache of a conversion the
    // N3-3 lens now does live and better, so they lose every tie.
    const order = code.slice(code.indexOf('ORDER BY', code.indexOf('row_number')));
    expect(order).toMatch(/\(c\.source LIKE 'Transposed from %'\)/);
    expect(order.indexOf("Transposed from %")).toBeLessThan(order.indexOf('CASE c.system'));
  });

  it('breaks ties deterministically, so the catalogue does not reshuffle between loads', () => {
    const order = code.slice(code.indexOf('ORDER BY', code.indexOf('row_number')));
    expect(order).toMatch(/c\.slug\s*\n?\s*\)/);
  });

  it('unions the facets across every row, or filtering would hide a creature', () => {
    // The failure this prevents: the Pathfinder Badger disappearing from the Pathfinder filter because
    // its 5e row won the ranking. `systems` is every system with a row; `published_systems` is the subset
    // a publisher wrote — different claims, both needed.
    for (const col of ['systems', 'types', 'alignments', 'all_tags', 'published_systems']) {
      expect(code, `${col} must be aggregated`).toMatch(new RegExp(`AS ${col}\\b`));
    }
    expect(code).toMatch(/FILTER \(WHERE c\.source NOT LIKE 'Transposed from %'\)/);
  });

  it('counts distinct ids, because the tag unnest multiplies rows', () => {
    // `count(*)` over a LEFT JOIN LATERAL unnest counts tags, not rows — a creature with four tags would
    // claim to stand for four rows. Silent, and wrong on every well-tagged creature.
    expect(code).toMatch(/LEFT JOIN LATERAL unnest\(c\.tags\)/);
    expect(code).toMatch(/count\(DISTINCT c\.id\)\s+AS row_count/);
    expect(code).not.toMatch(/count\(\*\)\s+AS row_count/);
  });

  it('reloads the PostgREST schema cache, or the view is invisible to the client', () => {
    expect(SQL).toMatch(/NOTIFY pgrst, 'reload schema'/);
    expect(code).toMatch(/GRANT SELECT ON public\.dnd_creatures_canonical TO service_role/);
  });

  it('is indexed for the containment filters that made a plain view time out', () => {
    // Measured before materializing: 4,064ms for ONE array filter, and the bestiary returned a 500 on
    // `?system=dnd5e-2014&type=beast`. Postgres cannot index through a window function, so every request
    // re-ranked all 5,025 rows before filtering. These are the indexes that took it to ~80ms.
    for (const col of ['systems', 'types', 'alignments', 'all_tags']) {
      expect(code, `${col} needs a GIN index`).toMatch(new RegExp(`USING gin \\(${col}\\)`));
    }
    // The list's sort and the CR band range.
    expect(code).toMatch(/dnd_creatures_canonical_order_idx ON public\.dnd_creatures_canonical \(cr_sort, name\)/);
  });

  it('can refresh without locking readers, and re-asserts one-entry-per-creature while doing it', () => {
    // REFRESH CONCURRENTLY REQUIRES a unique index; without one every refresh takes ACCESS EXCLUSIVE and
    // the bestiary 500s for the length of an import. The index doubles as a constraint: a ranking bug
    // producing two rows for one name fails the refresh instead of silently double-listing.
    expect(code).toMatch(/CREATE UNIQUE INDEX dnd_creatures_canonical_identity_idx[\s\S]{0,120}\(identity\)/);
    expect(code).toMatch(/REFRESH MATERIALIZED VIEW CONCURRENTLY public\.dnd_creatures_canonical/);
    // A never-populated snapshot cannot be refreshed concurrently, so a fresh database must not need a
    // special first-run step.
    expect(code).toMatch(/WHEN OBJECT_NOT_IN_PREREQUISITE_STATE THEN\s+REFRESH MATERIALIZED VIEW public\.dnd_creatures_canonical/);
    // Populated by the seed itself, or applying it leaves an empty list that reads as a failed import.
    expect(code).toMatch(/SELECT public\.refresh_dnd_creatures_canonical\(\);/);
  });
});

describe('staleness — the price of materializing, and it is paid', () => {
  // A snapshot means a creature imported without a refresh is catalogued and UNREACHABLE: content that
  // exists behind no surface, which is this repo's signature defect reintroduced by a performance fix.
  it('every script that writes creatures refreshes when it finishes', () => {
    const writers = [
      'scripts/import-bestiary.mjs',
      'scripts/import-bestiary-pf2.mjs',
      'scripts/generate-transposed-bestiary.mjs',
      'scripts/fetch-creature-art.mjs',
    ];
    for (const f of writers) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src, `${f} must refresh the canonical snapshot`)
        .toMatch(/SELECT public\.refresh_dnd_creatures_canonical\(\)/);
    }
  });

  it('the audit fails HARD on a stale snapshot, by an exact comparison', () => {
    // sum(row_count) is the row count the snapshot was BUILT from, so this catches a single added or
    // deleted row. Comparing distinct names would miss a row added to an existing creature; comparing
    // entry counts would miss a deletion that removed a duplicate. Verified against the live database by
    // inserting one row inside a rolled-back transaction: 5,026 rows vs 5,025 folded, detected.
    expect(audit).toMatch(/coalesce\(sum\(row_count\),0\)::int FROM dnd_creatures_canonical\)\s+AS folded_rows/);
    expect(audit).toMatch(/canon\.folded_rows !== canon\.rows/);
    expect(audit).toMatch(/hardFailures \+= 1;[\s\S]{0,120}STALE/);
    // And it names the fix, because an audit that reports a problem without the remedy gets ignored.
    expect(audit).toMatch(/refresh_dnd_creatures_canonical\(\);/);
  });
});

describe('the list reads the view and the page reads the table', () => {
  it('loadBestiary queries the canonical view', () => {
    expect(query).toMatch(/const CANONICAL_VIEW = 'dnd_creatures_canonical'/);
    expect(query).toMatch(/supabaseAdmin\.from\(CANONICAL_VIEW\)\.select\(CANONICAL_COLUMNS, \{ count: 'exact' \}\)/);
  });

  it('filters by CONTAINMENT, not equality — the whole point of the union columns', () => {
    // `eq('system', …)` asks "which system won the ranking?", which is not what a reader means.
    expect(query).toMatch(/q\.contains\('systems', \[filters\.system\]\)/);
    expect(query).toMatch(/q\.contains\('types', \[filters\.type\]\)/);
    expect(query).toMatch(/q\.contains\('alignments', \[filters\.alignment\]\)/);
    expect(query).toMatch(/q\.contains\('all_tags', \[filters\.tag\]\)/);
    const load = query.slice(query.indexOf('export async function loadBestiary'), query.indexOf('const FACET_SCAN_CEILING'));
    expect(load).not.toMatch(/\.eq\('system'|\.eq\('type'|\.eq\('alignment'/);
  });

  it('reads facets from the SAME relation it filters, or the chips describe another catalogue', () => {
    // The desync this prevents: the filter asks `systems @> [pf2]` while a table scan scoped by
    // `system = pf2` sees only rows that ARE Pathfinder, so a creature published in both gets matched by
    // a chip that was never offered.
    // Bounded to loadFacets itself: everything after it — loadCreature, loadSiblings — reads the TABLE on
    // purpose, so an unbounded slice would assert the opposite of the rule below.
    const facets = query.slice(
      query.indexOf('async function loadFacets'),
      query.indexOf('export async function loadCreature'),
    );
    expect(facets).toMatch(/supabaseAdmin\.from\(CANONICAL_VIEW\)/);
    expect(facets).toMatch(/scoped\.contains\('systems', \[system\]\)/);
    expect(facets).not.toMatch(/from\('dnd_creatures'\)/);
  });

  it('leaves the creature PAGE reading the table, because the lens needs every row', () => {
    // loadCreature and loadSiblings must NOT be folded: the lens's whole job is showing the other rows.
    const one = query.slice(query.indexOf('export async function loadCreature'));
    expect(one).toMatch(/from\('dnd_creatures'\)/);
    expect(one).not.toMatch(/CANONICAL_VIEW/);
  });

  it('defaults a single-row read to standing for itself', () => {
    // toCreature serves both relations. A missing row_count must mean "one row, its own system" rather
    // than 0 — a card claiming a creature is catalogued zero times is worse than one saying nothing.
    expect(query).toMatch(/rowCount: r\.row_count === undefined \|\| r\.row_count === null \? 1 : Number\(r\.row_count\)/);
    expect(query).toMatch(/systems: Array\.isArray\(r\.systems\) \? \(r\.systems as string\[\]\) : \[String\(r\.system\)\]/);
  });
});

describe('the row says what it stands for (N3-4)', () => {
  it('names the systems a publisher wrote it for', () => {
    expect(page).toMatch(/c\.publishedSystems\.length > 1/);
    expect(page).toMatch(/Published in/);
  });

  it('stays quiet when there is only one, because a lone value is not information', () => {
    expect(page).not.toMatch(/c\.publishedSystems\.length > 0/);
    expect(page).not.toMatch(/c\.publishedSystems\.length >= 1/);
  });
});

describe('the fold is checked against the data, not just the SQL', () => {
  it('audit:bestiary fails hard if a creature becomes unreachable', () => {
    // The property the whole ranking rests on: every generated row's creature also has a published row,
    // so ranking generated rows last can never make one vanish. It holds today and an import could break
    // it, so it is checked rather than remembered.
    expect(audit).toMatch(/N7 · One creature, one entry/);
    expect(audit).toMatch(/AS lost/);
    expect(audit).toMatch(/hardFailures \+= canon\.lost/);
    expect(audit).toMatch(/hardFailures \+= 1;[\s\S]{0,200}the view is not one-per-creature/);
  });
});
