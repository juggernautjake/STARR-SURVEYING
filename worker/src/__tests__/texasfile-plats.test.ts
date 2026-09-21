/**
 * TexasFile plat search — the paid half of the plat question.
 *
 * Driven against Williamson on 2026-09-21. The form field names here are read off the live page,
 * and they are NOT the county-clerk form's names — a scraper that reuses the clerk map fills
 * nothing and submits a blank search.
 */

import { describe, it, expect } from 'vitest';
import {
  platSearchUrl, planPlatSearch, platCoverageStatement,
  TEXASFILE_PLAT_FIELDS, TEXASFILE_PLAT_COVERAGE,
} from '../adapters/texasfile-plats.js';
import { PLAT_REPO_REGISTRY } from '../services/county-plats.js';

describe('the URL', () => {
  it('follows the same county slug as the clerk search', () => {
    expect(platSearchUrl('Williamson')).toBe('https://www.texasfile.com/search/texas/williamson-county/plat-records/');
    expect(platSearchUrl('Williamson County')).toBe('https://www.texasfile.com/search/texas/williamson-county/plat-records/');
  });

  it('handles a two-word county', () => {
    expect(platSearchUrl('Palo Pinto')).toContain('palo-pinto-county');
  });
});

describe('the field names are the PLAT form\'s, not the clerk form\'s', () => {
  it('uses the plain names read off the live page', () => {
    // The clerk form uses `name-0-name`, `bvp-0-volume`. This one does not, and mixing them up
    // produces a submitted-but-empty search that returns the county's whole index.
    expect(TEXASFILE_PLAT_FIELDS.description).toBe('description');
    expect(TEXASFILE_PLAT_FIELDS.volume).toBe('volume');
    expect(TEXASFILE_PLAT_FIELDS.page).toBe('page');
    expect(TEXASFILE_PLAT_FIELDS.number).toBe('number');
  });

  it('none of them carry the clerk form\'s index prefixes', () => {
    for (const v of Object.values(TEXASFILE_PLAT_FIELDS)) {
      expect(v, v).not.toMatch(/^(name|bvp|number)-\d/);
    }
  });
});

describe('planning a search', () => {
  it('searches by subdivision, which is what a legal description gives us', () => {
    const p = planPlatSearch('Williamson', { subdivision: 'VILLAGE GREEN' });
    expect(p.runnable).toBe(true);
    expect(p.fields).toEqual({ description: 'VILLAGE GREEN' });
    expect(p.description).toContain('VILLAGE GREEN');
  });

  it('combines subdivision with volume and page when both are known', () => {
    const p = planPlatSearch('Williamson', { subdivision: 'SUNSET ACRES', volume: 'S', page: '212' });
    expect(p.fields).toEqual({ description: 'SUNSET ACRES', volume: 'S', page: '212' });
  });

  it('a file number wins outright and suppresses the rest', () => {
    // One document. Adding a subdivision that disagrees would exclude the very plat being asked for.
    const p = planPlatSearch('Williamson', { fileNumber: '2004012345', subdivision: 'ANYTHING', volume: '9' });
    expect(p.fields).toEqual({ number: '2004012345' });
    expect(p.description).toContain('file number');
  });

  it('REFUSES a blank search and says what it would cost', () => {
    // The load-bearing one. A blank plat search returns the county's entire index — thousands of
    // rows, no answer, and a page charge to find that out.
    const p = planPlatSearch('Williamson', {});
    expect(p.runnable).toBe(false);
    expect(p.fields).toEqual({});
    expect(p.why).toMatch(/whole index/i);
  });

  it.each([
    ['empty strings', { subdivision: '', volume: '', page: '' }],
    ['whitespace', { subdivision: '   ' }],
    ['nulls', { subdivision: null, volume: null, page: null, fileNumber: null }],
  ])('%s are not a search', (_l, q) => {
    expect(planPlatSearch('Williamson', q).runnable).toBe(false);
  });

  it('trims and collapses whitespace rather than sending it', () => {
    const p = planPlatSearch('Williamson', { subdivision: '  VILLAGE   GREEN  ' });
    expect(p.fields.description).toBe('VILLAGE GREEN');
  });
});

describe('coverage is recorded, not assumed', () => {
  it('states Williamson\'s dates from the site\'s own table', () => {
    const c = TEXASFILE_PLAT_COVERAGE.williamson!;
    expect(c.platsFrom).toBe('1854-02-18');
    expect(c.indexFrom).toBe('1848-09-14');
    expect(c.verifiedAt).toBe('2026-09-21');
  });

  it('the statement says both the range and that images cost money', () => {
    const s = platCoverageStatement('Williamson County');
    expect(s).toContain('1854-02-18');
    expect(s).toMatch(/free/i);
    expect(s).toMatch(/charged per page/i);
  });

  it('an unread county SAYS it is unread rather than implying full coverage', () => {
    // "No plats found" for a 1903 subdivision means different things depending on whether the
    // index reaches 1903, and only the coverage table can tell them apart.
    const s = platCoverageStatement('Hays');
    expect(s).toMatch(/nobody has read its coverage/i);
  });
});

describe('the free registry is left alone', () => {
  it('Williamson is NOT in PLAT_REPO_REGISTRY', () => {
    // That registry answers "is there a FREE plat repository?". Adding a paid source to it would
    // make platSourceStatus() report "available" for a county where every plat costs money, and
    // the free-first purchase logic would stop looking for the free one.
    expect(Object.keys(PLAT_REPO_REGISTRY)).not.toContain('williamson');
  });

  it('Bell still is — the free path is untouched', () => {
    expect(Object.keys(PLAT_REPO_REGISTRY)).toContain('bell');
  });
});
