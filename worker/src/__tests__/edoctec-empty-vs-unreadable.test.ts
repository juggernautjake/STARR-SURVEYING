/**
 * An empty result has no table. That is not the same as a table we could not read.
 *
 * `parseResults` decides "usable" by whether the required COLUMNS are present, and a search that
 * matched nothing renders no table at all — so every column reads as missing and a healthy county
 * is reported as unparseable.
 *
 * Found on 2026-09-21 by searching Lampasas for "CITY OF COPPERAS COVE" (a Coryell city, no
 * Lampasas records), concluding the adapter was broken, and then getting 20 rows from "CITY OF
 * LAMPASAS" a minute later. It is the exact mirror of reporting a refusal as "no records": one
 * hides a real document, the other invents a fault in a county that works.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NO_RESULTS_TEXT, SEARCH_ERROR_TEXT, RESULTS_SETTLED } from '../lib/page-readiness.js';

describe('the two sentences a results page can say', () => {
  it('recognises the county saying it matched nothing', () => {
    for (const t of [
      'Party Search No results found for your search.',
      'Showing 0 results',
      'Your search returned no results.',
    ]) {
      expect(NO_RESULTS_TEXT.test(t), t).toBe(true);
      expect(SEARCH_ERROR_TEXT.test(t), t).toBe(false);
    }
  });

  it('does NOT read the site\'s own failure as an empty result', () => {
    // The difference between "this property has no deeds" and "the county's search broke".
    const t = 'An error while running search occurred. Please try again.';
    expect(SEARCH_ERROR_TEXT.test(t)).toBe(true);
  });

  it('keeps the settle condition matching BOTH, because either means stop waiting', () => {
    // Settling and classifying are different questions; this is why they are separate constants.
    expect(RESULTS_SETTLED).toContain('no results found');
    expect(RESULTS_SETTLED).toContain('error while running search');
  });
});

describe('the adapter acts on that distinction', () => {
  const adapter = fs.readFileSync(
    path.join(process.cwd(), 'src/adapters/edoctec-clerk-adapter.ts'), 'utf8');

  it('returns an honest empty result only when every condition holds', () => {
    // No headers, no rows, the page says so, and it does NOT also report an error.
    expect(adapter).toContain('table.headers.length === 0 && table.rows.length === 0 && saysEmpty');
    expect(adapter).toContain('NO_RESULTS_TEXT.test(bodyText) && !SEARCH_ERROR_TEXT.test(bodyText)');
  });

  it('still refuses to answer when the table is merely unreadable', () => {
    // The original guarantee, unchanged: answering "no records" from an unread table is the
    // failure this adapter exists to avoid.
    expect(adapter).toContain('throw new Error(this.lastParseSummary)');
    expect(adapter).toMatch(/Refusing to answer beats answering "no records"/);
  });

  it('says which of the two happened, in the log a person reads', () => {
    expect(adapter).toMatch(/not a parse failure/);
  });
});
