import { describe, it, expect } from 'vitest';
import {
  texasFileCountyKey,
  texasFileCountySlug,
  purchaseApiUrl,
} from '../services/texasfile-buy.js';

// The purchase module (`texasfile-buy.ts`) was mapped 2026-09-05 by driving the LIVE, redesigned
// TexasFile SPA logged into the owner's funded account and buying one real $3 document. The browser
// parts (login/search/download) need a real page; these pure helpers build the exact URLs and county
// segments that a wrong character would silently break — an empty search or a 404 purchase — so they
// are pinned here against the live shapes observed during that mapping.

describe('texasFileCountyKey — the API path segment', () => {
  it('lowercases and drops a trailing "county"', () => {
    expect(texasFileCountyKey('Bell')).toBe('bell');
    expect(texasFileCountyKey('Bell County')).toBe('bell');
    expect(texasFileCountyKey('  BELL county ')).toBe('bell');
  });

  it('hyphenates multi-word counties', () => {
    expect(texasFileCountyKey('Val Verde')).toBe('val-verde');
    expect(texasFileCountyKey('Val Verde County')).toBe('val-verde');
    expect(texasFileCountyKey("Deaf Smith")).toBe('deaf-smith');
  });
});

describe('texasFileCountySlug — the search-page slug', () => {
  it('is the key with "-county" appended', () => {
    expect(texasFileCountySlug('Bell')).toBe('bell-county');
    expect(texasFileCountySlug('Bell County')).toBe('bell-county');
    expect(texasFileCountySlug('Val Verde')).toBe('val-verde-county');
  });
});

describe('purchaseApiUrl — the un-UI purchase endpoint', () => {
  const GUID = 'EB122FEA-2137-4D6B-83EB-087BF6C70331';

  it('builds the exact endpoint mapped live', () => {
    expect(purchaseApiUrl('Bell', GUID, '56812446')).toBe(
      'https://www.texasfile.com/document/api/purchase/texas/bell/instrument/' +
        GUID +
        '/?from_product_content_type=search&from_product_object_id=56812446',
    );
  });

  it('defaults the state to texas but accepts an override', () => {
    expect(purchaseApiUrl('Bell', GUID, '1', 'newmexico')).toContain(
      '/purchase/newmexico/bell/instrument/',
    );
  });

  it('carries the county key, not the raw county name', () => {
    expect(purchaseApiUrl('Bell County', GUID, '1')).toContain('/texas/bell/instrument/');
  });

  it('url-encodes the searchId', () => {
    expect(purchaseApiUrl('Bell', GUID, 'a b')).toContain('from_product_object_id=a%20b');
  });
});
