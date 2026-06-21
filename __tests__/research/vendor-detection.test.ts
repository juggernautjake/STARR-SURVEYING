// __tests__/research/vendor-detection.test.ts
//
// §8.2 of docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
// Source-locks the matcher against the four vendor templates seeded
// in slice 2 (seeds/370_research_adapter_registry.sql).

import { describe, it, expect } from 'vitest';
import {
  detectVendor,
  vendorKeyAsCanonical,
  type VendorTemplate,
} from '@/lib/research/vendor-detection';

/** Mirror of the seeded vendor templates (only the fields the
 *  matcher reads). Keeping this fixture in the test makes the
 *  source-lock failure mode obvious: rename a fingerprint in the
 *  seed and the test that asserts the new shape is the one that
 *  fails. */
const VENDORS: VendorTemplate[] = [
  {
    vendor_key: 'bell_cad_arcgis',
    display_name: 'Bell CAD (Esri ArcGIS REST)',
    url_fingerprints: [
      { type: 'host_re', re: '^services[0-9]*\\.arcgis\\.com$' },
      { type: 'path_re', re: '/FeatureServer/[0-9]+/query' },
    ],
  },
  {
    vendor_key: 'trueautomation_propaccess',
    display_name: 'TrueAutomation PropAccess (browser scrape)',
    url_fingerprints: [
      { type: 'host_re', re: '^propaccess\\.trueautomation\\.com$' },
      { type: 'path_re', re: '/(clientdb|ClientDB)/' },
    ],
  },
  {
    vendor_key: 'esearch_cad',
    display_name: 'eSearch CAD (Pritchard & Abbott)',
    url_fingerprints: [
      { type: 'host_re', re: '^esearch\\..+\\.org$' },
      { type: 'host_re', re: '^.+\\.esearch\\.us$' },
    ],
  },
  {
    vendor_key: 'publicsearch_clerk',
    display_name: 'Tyler publicsearch.us (clerk deeds)',
    url_fingerprints: [
      { type: 'host_re', re: '^.+\\.publicsearch\\.us$' },
    ],
  },
];

describe('detectVendor — single-fingerprint matches', () => {
  it('matches a publicsearch.us URL to Tyler publicsearch_clerk', () => {
    const r = detectVendor('https://bell.publicsearch.us/search/landrecords', VENDORS);
    expect(r.best?.vendor_key).toBe('publicsearch_clerk');
    expect(r.matches).toHaveLength(1);
  });

  it('matches a trueautomation.com URL to PropAccess', () => {
    const r = detectVendor('https://propaccess.trueautomation.com/clientdb/12345', VENDORS);
    expect(r.best?.vendor_key).toBe('trueautomation_propaccess');
  });

  it('matches an esearch.us URL to eSearch CAD', () => {
    const r = detectVendor('https://bell.esearch.us/property/12345', VENDORS);
    expect(r.best?.vendor_key).toBe('esearch_cad');
  });

  it('matches an esearch.<county>.org URL to eSearch CAD too', () => {
    const r = detectVendor('https://esearch.bellcad.org/property/12345', VENDORS);
    expect(r.best?.vendor_key).toBe('esearch_cad');
  });
});

describe('detectVendor — multi-fingerprint scoring', () => {
  it('an ArcGIS query URL matches BOTH host and path → score 2', () => {
    const r = detectVendor(
      'https://services1.arcgis.com/abc/ArcGIS/rest/services/Parcels/FeatureServer/0/query?f=json',
      VENDORS,
    );
    expect(r.best?.vendor_key).toBe('bell_cad_arcgis');
    expect(r.best?.score).toBe(2);
    expect(r.best?.matched.map((m) => m.type).sort()).toEqual(['host_re', 'path_re']);
  });

  it('a non-query ArcGIS URL matches host only → score 1', () => {
    const r = detectVendor(
      'https://services1.arcgis.com/abc/ArcGIS/rest/services/Parcels',
      VENDORS,
    );
    expect(r.best?.score).toBe(1);
  });

  it('ranks multi-match templates above single-match', () => {
    // Synthesize a competing template that matches the host only.
    const competitor: VendorTemplate = {
      vendor_key: 'arcgis_generic',
      display_name: 'Generic ArcGIS',
      url_fingerprints: [{ type: 'host_re', re: 'arcgis\\.com$' }],
    };
    const r = detectVendor(
      'https://services1.arcgis.com/abc/ArcGIS/rest/services/Parcels/FeatureServer/0/query',
      [...VENDORS, competitor],
    );
    expect(r.matches[0]!.vendor_key).toBe('bell_cad_arcgis');
    expect(r.matches[0]!.score).toBeGreaterThan(r.matches[1]!.score);
  });
});

describe('detectVendor — robustness', () => {
  it('returns no match for an unrelated URL', () => {
    const r = detectVendor('https://example.com/foo', VENDORS);
    expect(r.best).toBeNull();
    expect(r.matches).toEqual([]);
  });

  it('accepts a bare host (no scheme)', () => {
    const r = detectVendor('propaccess.trueautomation.com/clientdb', VENDORS);
    expect(r.best?.vendor_key).toBe('trueautomation_propaccess');
  });

  it('host matching is case-insensitive', () => {
    const r = detectVendor('https://BELL.PUBLICSEARCH.US/search', VENDORS);
    expect(r.best?.vendor_key).toBe('publicsearch_clerk');
  });

  it('skips malformed fingerprint regexes without crashing', () => {
    const buggy: VendorTemplate = {
      vendor_key: 'buggy',
      display_name: 'Buggy',
      url_fingerprints: [
        { type: 'host_re', re: '(invalid[regex' },             // throws
        { type: 'host_re', re: '^services[0-9]*\\.arcgis\\.com$' }, // works
      ],
    };
    const r = detectVendor('https://services1.arcgis.com/x', [buggy]);
    expect(r.best?.vendor_key).toBe('buggy');
  });

  it('returns null for an unparseable URL', () => {
    expect(detectVendor('not a url at all !@#', VENDORS).best?.vendor_key).toBe(undefined);
    expect(detectVendor('', VENDORS).best).toBeNull();
  });

  it('skips vendors with empty / missing fingerprint arrays', () => {
    const empty: VendorTemplate = {
      vendor_key: 'empty',
      display_name: 'Empty',
      url_fingerprints: [],
    };
    const r = detectVendor('https://services1.arcgis.com/x', [empty, ...VENDORS]);
    expect(r.best?.vendor_key).toBe('bell_cad_arcgis');
  });
});

describe('vendorKeyAsCanonical', () => {
  it('narrows known keys to the CanonicalSource union', () => {
    expect(vendorKeyAsCanonical('bell_cad_arcgis')).toBe('bell_cad_arcgis');
    expect(vendorKeyAsCanonical('trueautomation_propaccess')).toBe('trueautomation_propaccess');
    expect(vendorKeyAsCanonical('publicsearch_clerk')).toBe('publicsearch_clerk');
  });

  it('returns null for keys that are not in the canonical set', () => {
    expect(vendorKeyAsCanonical('some_new_vendor_we_havent_typed_yet')).toBeNull();
    expect(vendorKeyAsCanonical('')).toBeNull();
  });
});
