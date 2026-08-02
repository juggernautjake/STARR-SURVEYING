// ⌘K reaches records, not just routes (platform audit §4).
//
// §4's palette row: *"Built, ranked, recency-boosted. Only knows routes. Add actions … and records
// (job #, person, equipment)."* Actions shipped with the palette. This is the records half, and the
// thing worth pinning is not that it searches — it is WHERE it searches: the same
// `/api/admin/search` backbone the §3b page uses, so the launcher and the page can never disagree
// about what exists.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/components/nav/CommandPalette.tsx'),
  'utf8',
);
/** Comments stripped — several assertions below are about the ABSENCE of a thing the file explains
 *  at length. */
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('the palette searches records through the one backbone', () => {
  it('calls /api/admin/search rather than matching records itself', () => {
    expect(code).toContain('/api/admin/search?q=');
    // No second ranking, no second corpus list. Both exist — in lib/search — and a copy here would
    // answer differently from the page this links to.
    expect(code).not.toContain('CORPUS_BY_ID');
    expect(code).not.toMatch(/from\s+'@\/lib\/search\//);
  });

  it('debounces and cancels, so a stale response cannot repaint the list', () => {
    expect(code).toContain('RECORD_DEBOUNCE_MS');
    expect(code).toContain('cancelled = true');
  });

  it('does not offer a row that cannot be opened', () => {
    // A corpus with no viewer page returns href: null. Every palette row navigates on Enter.
    expect(code).toContain('if (!hit.href) return null;');
  });

  it('ranks records BELOW pages and actions', () => {
    // Two letters into a launcher is almost always a page. A job must not push "Jobs" down.
    const order = code.indexOf('...pageRows, ...actionRows, ...recordRows');
    expect(order).toBeGreaterThan(-1);
  });

  it('always offers the full search, so five results never read as "nothing anywhere"', () => {
    expect(code).toContain('/admin/search?q=');
    expect(code).toContain('Search everything for');
  });

  it('says when the record lookup failed instead of showing an empty list', () => {
    // The §1.1b defect in its most expensive place: a launcher people trust to find things.
    expect(code).toContain("recordsState === 'failed'");
    expect(src).toContain('the record search could not be reached');
  });
});
