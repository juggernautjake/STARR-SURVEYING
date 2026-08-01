// __tests__/search/search-backbone.test.ts — unified document + record search (§3b).
//
// Owner objective 2026-08-01: *"filter docs by type, date and search using key words and matching
// spellings"*. The mechanisms are in `search_everything()` (seed 515); what is guarded here is the
// part that rots — the registry describing WHAT is searchable, and the thresholds that decide whether
// "matching spellings" matches anything at all.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORPORA, CORPUS_BY_ID, columnsFor, corporaFor,
} from '@/lib/search/corpora';
import {
  parseQuery, normaliseFilters, scoreHit, recencyMultiplier,
  MIN_QUERY_LENGTH, MAX_LIMIT, WEIGHT_TITLE, WEIGHT_BODY,
} from '@/lib/search/query';

const SQL = readFileSync(join(process.cwd(), 'seeds', '515_search_function.sql'), 'utf8');
const INDEXES = readFileSync(join(process.cwd(), 'seeds', '514_search_indexes.sql'), 'utf8');

describe('the registry and the SQL cannot drift apart', () => {
  it('every corpus in TypeScript is a branch in the SQL function', () => {
    // The exact failure mode this repo keeps producing: two lists of the same thing (audit §1.3, 32
    // routes). Here it would be worse than a missing menu item — a corpus present in the filter
    // dropdown and absent from the query returns nothing, and reads as an empty archive.
    for (const c of CORPORA) {
      expect(SQL, `${c.id} is offered as a filter but has no SQL branch`).toContain(`'${c.id}'`);
    }
  });

  it('and every SQL branch is a corpus in TypeScript', () => {
    // The other direction: a branch nobody can name is a branch nobody can filter to, and its results
    // arrive with no label, no icon and no link.
    const inSql = [...SQL.matchAll(/^\s*SELECT '([a-z-]+)',/gm)].map((m) => m[1]);
    const firstBranch = SQL.match(/'research-documents'::text AS corpus/) ? ['research-documents'] : [];
    for (const id of [...new Set([...inSql, ...firstBranch])]) {
      expect(CORPUS_BY_ID.has(id), `SQL returns corpus "${id}" that the registry does not describe`).toBe(true);
    }
  });

  it('the role gate in SQL matches the role gate in the registry', () => {
    // Search runs as the service role across tables whose own pages gate access individually, so
    // these arrays ARE the access control. Two copies that disagree is a leak in one direction and a
    // dead corpus in the other.
    for (const c of CORPORA) {
      for (const role of c.roles) {
        expect(SQL, `${c.id} allows ${role} in the registry — SQL must too`).toMatch(
          new RegExp(`'${role}'`),
        );
      }
    }
  });
});

describe('what a corpus promises must exist', () => {
  it('names no duplicate ids', () => {
    expect(CORPUS_BY_ID.size).toBe(CORPORA.length);
  });

  it('always yields a title column and at least one date', () => {
    for (const c of CORPORA) {
      expect(c.titleColumns.length, `${c.id} needs a title`).toBeGreaterThan(0);
      expect(c.dates.length, `${c.id} needs a date to filter on`).toBeGreaterThan(0);
    }
  });

  it('includes id in the column list even though no corpus declares it', () => {
    for (const c of CORPORA) expect(columnsFor(c)).toContain('id');
  });

  it('every non-null href points at a page that exists', () => {
    // A result that 404s is worse than no result — it reads as data loss. This is the "dangling
    // registry entry" failure §1.4 names, and it is cheap to prevent and expensive to notice.
    const sample = { id: 'ID', job_id: 'J', research_project_id: 'R', parent_id: 'P' };
    for (const c of CORPORA) {
      const href = c.href(sample);
      if (href === null) continue;
      const path = href.split('?')[0]
        .replace(/\/ID$|\/J$|\/R$|\/P$/, '/[id]');
      // Try the literal path and the dynamic-segment form; one of them must be a real page.
      const candidates = [
        join(process.cwd(), 'app', path, 'page.tsx'),
        join(process.cwd(), 'app', path.replace('/[id]', '/[projectId]'), 'page.tsx'),
        join(process.cwd(), 'app', href.split('?')[0], 'page.tsx'),
      ];
      expect(
        candidates.some((p) => existsSync(p)),
        `${c.id} links to ${href}, which has no page (tried ${candidates.join(', ')})`,
      ).toBe(true);
    }
  });

  it('customers has NO href, and that is deliberate', () => {
    // There is no /admin/customers page anywhere in the app. Pointing at one would ship a 404; the
    // snippet carries the contact details instead. If somebody builds the page, this test is the
    // reminder to wire it up.
    expect(CORPUS_BY_ID.get('customers')!.href({ id: 'x' })).toBeNull();
  });
});

describe('access', () => {
  it('gives an admin every corpus', () => {
    expect(corporaFor(['admin'])).toHaveLength(CORPORA.length);
  });

  it('gives an unknown role nothing', () => {
    // The property that matters most. A search that defaults to "everything" for a caller it cannot
    // place is a data leak with a text box in front of it.
    expect(corporaFor([])).toEqual([]);
    expect(corporaFor(['guest'])).toEqual([]);
  });

  it('gives field crew job files and field media, not invoices or customers', () => {
    const ids = corporaFor(['field_crew']).map((c) => c.id);
    expect(ids).toContain('job-files');
    expect(ids).toContain('field-media');
    expect(ids).not.toContain('invoices');
    expect(ids).not.toContain('customers');
  });
});

describe('parsing what somebody typed', () => {
  it('splits on punctuation but keeps digits — job and lot numbers are searchable', () => {
    expect(parseQuery('24-0117').terms).toEqual(['24', '0117']);
    expect(parseQuery('Lot 4, Block B').terms).toEqual(['lot', '4', 'block', 'b']);
  });

  it('builds a prefix-matching tsquery so results appear while typing', () => {
    expect(parseQuery('waggoner deed').tsquery).toBe('waggoner:* & deed:*');
  });

  it('strips tsquery operators instead of producing a syntax error', () => {
    // A customer called "Smith & Sons (Texas)" must not 500 the search box.
    //
    // The assertion is on the TERMS, not on the whole expression: ` & ` is the AND joiner this parser
    // emits, so "the output contains no ampersand" would be asserting the opposite of correct. What
    // must hold is that no operator survives from the input into a term.
    const q = parseQuery('Smith & Sons (Texas)');
    for (const t of q.terms) expect(t, t).not.toMatch(/[&|!()<>:'"\\]/);
    expect(q.tsquery).toBe('smith:* & sons:* & texas:*');
  });

  it('keeps stop-words, because addresses contain them', () => {
    // "The Reserve at Nolan Creek" is a real subdivision name; dropping "the" and "at" would make it
    // unfindable by the name on the plat.
    expect(parseQuery('The Reserve at Nolan Creek').terms).toContain('the');
    expect(parseQuery('The Reserve at Nolan Creek').terms).toContain('at');
  });

  it('refuses a query too short to mean anything', () => {
    expect(parseQuery('a').tooShort).toBe(true);
    expect(parseQuery('ab').tooShort).toBe(false);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});

describe('filters', () => {
  it('swaps a backwards date range rather than returning nothing', () => {
    // An inverted range is always a slip. Returning zero results would be read as "there are no
    // documents", which is a much more alarming and much less true answer than "your dates are
    // backwards".
    const { filters, problems } = normaliseFilters({ from: '2026-08-01', to: '2020-01-01' });
    expect(filters.from).toBe('2020-01-01');
    expect(filters.to).toBe('2026-08-01');
    expect(problems.join(' ')).toMatch(/backwards/);
  });

  it('drops an unreadable date and SAYS so', () => {
    const { filters, problems } = normaliseFilters({ from: 'last tuesday' });
    expect(filters.from).toBeUndefined();
    expect(problems.join(' ')).toMatch(/unreadable/);
  });

  it('defaults the date role to created, and honours effective', () => {
    expect(normaliseFilters({}).filters.dateRole).toBe('created');
    expect(normaliseFilters({ dateRole: 'effective' }).filters.dateRole).toBe('effective');
  });

  it('clamps the limit at both ends', () => {
    expect(normaliseFilters({ limit: 0 }).filters.limit).toBe(1);
    expect(normaliseFilters({ limit: 10_000 }).filters.limit).toBe(MAX_LIMIT);
    expect(normaliseFilters({ limit: 25 }).filters.limit).toBe(25);
  });
});

describe('ranking', () => {
  it('weights a title match above a body match', () => {
    // Somebody typing "Waggoner" wants the document CALLED Waggoner, not the twelve deeds that
    // mention a Waggoner Drive in passing. Equal weights is the fastest way to make search useless on
    // a corpus with long text fields.
    expect(WEIGHT_TITLE).toBeGreaterThan(WEIGHT_BODY);
    const title = scoreHit({ titleSimilarity: 0.8, bodySimilarity: 0, textRank: 0, exactTitle: false, ageDays: 0 });
    const body = scoreHit({ titleSimilarity: 0, bodySimilarity: 0.8, textRank: 0, exactTitle: false, ageDays: 0 });
    expect(title).toBeGreaterThan(body);
  });

  it('puts an exact title above any pile of partials', () => {
    const exact = scoreHit({ titleSimilarity: 1, bodySimilarity: 0, textRank: 0, exactTitle: true, ageDays: 0 });
    const partial = scoreHit({ titleSimilarity: 0.9, bodySimilarity: 1, textRank: 1, exactTitle: false, ageDays: 0 });
    expect(exact).toBeGreaterThan(partial);
  });

  it('lets recency TILT but never sort', () => {
    // A 1974 deed is often exactly what was wanted. Recency must break ties, not bury the archive.
    expect(recencyMultiplier(0)).toBe(1);
    expect(recencyMultiplier(10_000)).toBe(0.75);
    expect(recencyMultiplier(10_000)).toBeGreaterThan(0.5);

    const oldStrong = scoreHit({ titleSimilarity: 1, bodySimilarity: 0, textRank: 0, exactTitle: false, ageDays: 20_000 });
    const newWeak = scoreHit({ titleSimilarity: 0.5, bodySimilarity: 0, textRank: 0, exactTitle: false, ageDays: 0 });
    expect(oldStrong, 'a 50-year-old exact-ish match must still beat a recent weak one').toBeGreaterThan(newWeak);
  });

  it('does not penalise an unknown date', () => {
    // Several corpora have nullable dates; treating null as "infinitely old" would rank every one of
    // them last for no reason anybody could see.
    expect(recencyMultiplier(NaN)).toBe(1);
    expect(recencyMultiplier(-1)).toBe(1);
  });
});

describe('the SQL carries the constraints it must', () => {
  it('pins the trigram threshold inside the function', () => {
    // Measured on this database: single-letter typos score 0.43–0.55, so the 0.6 default matches
    // NOTHING and "matching spellings" ships as a feature that silently is not one. And the setting
    // cannot live on the session or the database — the Supabase pooler hands back a backend that
    // never read it, so it LOOKS applied and is not.
    expect(SQL).toMatch(/SET LOCAL pg_trgm\.word_similarity_threshold = 0\.4/);
    expect(INDEXES).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  });

  it('uses word_similarity, not similarity', () => {
    // `similarity()` is length-sensitive: "Waggoner" against "3424 Waggoner Dr, Belton, TX" scores
    // 0.33 — a perfect match, barely above the default threshold, and missed entirely in a slightly
    // longer label. `word_similarity` scores it 1.00.
    expect(SQL).toMatch(/word_similarity\(/);
    expect(SQL).not.toMatch(/[^_]similarity\(q\.norm/);
  });

  it('never defaults to "show everything" when roles are absent', () => {
    // Every branch must gate on p_roles. A branch without one is readable by anybody who can reach
    // the endpoint, regardless of what the registry says.
    const branches = SQL.split(/UNION ALL/);
    for (const b of branches.slice(0, -1).concat(branches.slice(-1))) {
      if (!/FROM \w+ \w+, q/.test(b)) continue;
      expect(b, `a corpus branch has no p_roles gate:\n${b.slice(0, 200)}`).toMatch(/p_roles && ARRAY\[/);
    }
  });

  it('filters org_id wherever the table has one', () => {
    for (const c of CORPORA) {
      if (!c.orgColumn) continue;
      expect(SQL, `${c.id} has org_id and must filter on it`).toMatch(/org_id IS NULL OR p_org IS NULL OR/);
    }
  });

  it('is re-runnable, like every other seed here', () => {
    // Seeds 450 and 468 broke the one path that rebuilds this database from the repo by not being.
    expect(SQL).toMatch(/DROP FUNCTION IF EXISTS search_everything/);
    for (const stmt of INDEXES.match(/^CREATE (INDEX|EXTENSION)[^;]*/gm) ?? []) {
      expect(stmt, stmt).toMatch(/IF NOT EXISTS/);
    }
  });

  it('has no transaction control of its own', () => {
    // A seed's own COMMIT commits verify-baseline-schema's wrapping transaction and leaks its scratch
    // schema into production. Fixed once (2026-08-01); not worth re-creating.
    for (const sql of [SQL, INDEXES]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/im);
    }
  });
});
