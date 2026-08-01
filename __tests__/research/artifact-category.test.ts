// __tests__/research/artifact-category.test.ts — the derivation that replaced a phantom table (§8.4).
//
// `research_artifacts` never existed. Artifacts are `research_documents` rows filed under an
// `/artifacts/…` storage path, and `category` is DERIVED from that path rather than stored — so this
// function is now the only thing standing between the vision pipeline and the wrong pile of images.
import { describe, expect, it } from 'vitest';
import {
  categorizeDocument,
  isImageFileType,
  visualResourceTypeFor,
} from '@/lib/research/artifact-category';

describe('categorizeDocument', () => {
  it('checks screenshots-misc BEFORE screenshots — the substring trap', () => {
    // `/artifacts/screenshots-misc/` CONTAINS neither `/artifacts/screenshots/` nor vice-versa, but the
    // two are one character apart and the obvious ordering is the wrong one. Getting it backwards sends
    // every 404 page, auth wall and empty result set the crawler captured to a vision model — paying
    // per image to read an error page, and polluting cross-validation with atoms from junk.
    expect(categorizeDocument(null, '/p/artifacts/screenshots-misc/a.png', null)).toBe('screenshots-misc');
    expect(categorizeDocument(null, '/p/artifacts/screenshots/a.png', null)).toBe('screenshots');
  });

  it('lets the storage path outrank the document type', () => {
    // The path is where the fetcher itself filed the capture, so it reflects what was known at capture
    // time. `document_type` may have been set later by a classifier, or by a human picking from a list.
    expect(categorizeDocument('deed', '/p/artifacts/plat/x.png', null)).toBe('plats');
  });

  it('falls back to document type, then label, then other', () => {
    expect(categorizeDocument('subdivision_plat', null, null)).toBe('plats');
    expect(categorizeDocument('flood_map', null, null)).toBe('fema');
    expect(categorizeDocument(null, null, 'GIS screenshot of lot 4')).toBe('screenshots');
    expect(categorizeDocument(null, null, 'Misc screenshot — auth wall')).toBe('screenshots-misc');
    expect(categorizeDocument(null, null, null)).toBe('other');
    expect(categorizeDocument('something_new_next_year', null, null)).toBe('other');
  });

  it('handles the nulls the database actually returns', () => {
    // All three columns are nullable and all three are null on rows created by the bulk importer.
    expect(() => categorizeDocument(null, null, null)).not.toThrow();
    expect(() => categorizeDocument(undefined, undefined, undefined)).not.toThrow();
  });
});

describe('isImageFileType', () => {
  it('accepts the formats the vision analyser can read, case-insensitively', () => {
    for (const t of ['png', 'JPG', 'jpeg', 'Tiff', 'webp']) expect(isImageFileType(t), t).toBe(true);
  });

  it('rejects PDFs and empty values', () => {
    // A PDF is not sent to vision — it goes down the text path via `extracted_text`, and sending it
    // both ways would double the spend and produce two atoms per fact to de-conflict.
    for (const t of ['pdf', '', null, undefined]) expect(isImageFileType(t), String(t)).toBe(false);
  });
});

describe('visualResourceTypeFor', () => {
  it('maps each category to the analyser prompt that fits it', () => {
    expect(visualResourceTypeFor('plats')).toBe('plat_document');
    expect(visualResourceTypeFor('fema')).toBe('flood_map');
    expect(visualResourceTypeFor('txdot')).toBe('street_map');
    expect(visualResourceTypeFor('screenshots')).toBe('gis_map');
    expect(visualResourceTypeFor('other')).toBe('aerial_imagery');
  });
});

describe('the call sites stop lying about failure', () => {
  // The phantom tables survived for the lifetime of three routes because every one of them
  // destructured `{ data }` and dropped `error`, so "the table does not exist" and "this project has
  // nothing extracted yet" produced identical output. That conflation is the actual defect; the wrong
  // table name was only how it got in.
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('node:fs') as typeof import('node:fs')).readFileSync(p, 'utf8');

  const ROUTES = [
    'app/api/admin/research/[projectId]/full-extract/route.ts',
    'app/api/admin/research/[projectId]/verify-lot/route.ts',
    'app/api/admin/research/[projectId]/deep-lot-analysis/route.ts',
  ];

  it('no route queries a table that does not exist', () => {
    // Matches the QUERY, not the name. Each route carries a comment naming the phantom table it used
    // to hit and why that was invisible; banning the string outright would delete the explanation and
    // leave the next reader to rediscover it the same expensive way.
    for (const r of ROUTES) {
      const queried = [...read(r).matchAll(/\.from\(\s*['"`]([a-z_0-9]+)['"`]\s*\)/g)].map((m) => m[1]);
      expect(queried, r).not.toContain('research_artifacts');
      expect(queried, r).not.toContain('research_extracted_data_points');
    }
  });

  it('each one surfaces the query error rather than degrading to empty', () => {
    for (const r of ROUTES) {
      expect(read(r), `${r} must capture the error from its data-points/documents query`)
        .toMatch(/error:\s*(docsError|pointsError)/);
    }
  });
});
