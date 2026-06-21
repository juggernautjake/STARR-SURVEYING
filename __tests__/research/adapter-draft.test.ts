// __tests__/research/adapter-draft.test.ts
//
// §8.2 ↔ §8.5 bridge tests for slice 10. Verifies the pure
// draft-builder that the §8.1 wizard's UI consumes before saving.

import { describe, it, expect } from 'vitest';
import {
  extractUrlParts,
  prefillAdapterFromTemplate,
  unresolvedPlaceholders,
  type VendorTemplate,
} from '@/lib/research/adapter-draft';

const BELL_ARCGIS: VendorTemplate = {
  id: 'vendor-arcgis-id',
  vendor_key: 'bell_cad_arcgis',
  display_name: 'Bell CAD (Esri ArcGIS REST)',
  access_method: 'arcgis_rest',
  config_template: {
    endpoints: {
      query: '{base_url}/{layer_id}/query',
      feature: '{base_url}/{layer_id}/{object_id}',
    },
    default_params: { f: 'json', outSR: 4326 },
  },
  field_map_template: {
    vendor_key: 'bell_cad_arcgis',
    version: '1.0.0',
    mappings: [
      { from_path: 'attributes.prop_id', to_path: 'parcel_id', transform: 'string' },
    ],
  } as never,
};

const PUBLICSEARCH: VendorTemplate = {
  id: 'vendor-publicsearch-id',
  vendor_key: 'publicsearch_clerk',
  display_name: 'Tyler publicsearch.us',
  access_method: 'browser_playwright',
  config_template: {
    flow: [
      { step: 'open', url: 'https://{subdomain}.{parent_domain}/search/landrecords' },
      { step: 'fill', selector: 'input[name=grantor]', value: '{owner_name}' },
    ],
  },
  field_map_template: {},
};

describe('extractUrlParts', () => {
  it('pulls scheme/host/subdomain/parent_domain/path', () => {
    const p = extractUrlParts('https://bell.publicsearch.us/search/landrecords?q=abc');
    expect(p).not.toBeNull();
    expect(p!.scheme).toBe('https');
    expect(p!.host).toBe('bell.publicsearch.us');
    expect(p!.subdomain).toBe('bell');
    expect(p!.parent_domain).toBe('publicsearch.us');
    expect(p!.pathname).toBe('/search/landrecords');
    expect(p!.first_path_segment).toBe('search');
    expect(p!.search_params.q).toBe('abc');
  });

  it('treats a 2-label host as having no subdomain', () => {
    const p = extractUrlParts('https://example.com/foo');
    expect(p!.subdomain).toBeNull();
    expect(p!.parent_domain).toBe('example.com');
  });

  it('accepts a bare host without a scheme', () => {
    expect(extractUrlParts('bell.publicsearch.us/x')!.host).toBe('bell.publicsearch.us');
  });

  it('returns null for an unparseable URL', () => {
    expect(extractUrlParts('not a url at all !@#')).toBeNull();
    expect(extractUrlParts('')).toBeNull();
  });
});

describe('prefillAdapterFromTemplate — known vendor', () => {
  it('produces a draft adapter with the vendor FK + access_method', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: PUBLICSEARCH,
      base_url: 'https://bell.publicsearch.us/search/landrecords',
      county_id: 'county-bell-id',
      site_type: 'clerk_deeds',
    });
    expect(draft.vendor_id).toBe('vendor-publicsearch-id');
    expect(draft.access_method).toBe('browser_playwright');
    expect(draft.site_type).toBe('clerk_deeds');
    expect(draft.status).toBe('draft');
  });

  it('substitutes {subdomain} and {parent_domain} into the config flow', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: PUBLICSEARCH,
      base_url: 'https://bell.publicsearch.us/search/landrecords',
      county_id: 'county-bell-id',
      site_type: 'clerk_deeds',
    });
    const flow = (draft.config as { flow: Array<{ url?: string }> }).flow;
    expect(flow[0]!.url).toBe('https://bell.publicsearch.us/search/landrecords');
  });

  it('substitutes {base_url} from a fully-formed URL', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: BELL_ARCGIS,
      base_url: 'https://services1.arcgis.com/abc/FeatureServer',
      county_id: 'county-bell-id',
      site_type: 'gis_parcels',
    });
    const endpoints = (draft.config as { endpoints: Record<string, string> }).endpoints;
    expect(endpoints.query).toBe('https://services1.arcgis.com/abc/FeatureServer/{layer_id}/query');
  });

  it('leaves unknown placeholders alone for §8.4 to prompt the user', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: BELL_ARCGIS,
      base_url: 'https://services1.arcgis.com/abc/FeatureServer',
      county_id: 'county-bell-id',
      site_type: 'gis_parcels',
    });
    expect(unresolvedPlaceholders(draft.config)).toContain('layer_id');
  });

  it('carries the vendor field_map_template through verbatim', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: BELL_ARCGIS,
      base_url: 'https://services1.arcgis.com/abc/FeatureServer',
      county_id: 'county-bell-id',
      site_type: 'gis_parcels',
    });
    expect(draft.field_map).toEqual(BELL_ARCGIS.field_map_template);
  });

  it('merges user overrides on top of the resolved config', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: BELL_ARCGIS,
      base_url: 'https://services1.arcgis.com/abc/FeatureServer',
      county_id: 'county-bell-id',
      site_type: 'gis_parcels',
      config_overrides: { default_params: { f: 'pjson' } },     // override one leaf
    });
    const params = (draft.config as { default_params: Record<string, unknown> }).default_params;
    expect(params.f).toBe('pjson');
    expect(params.outSR).toBe(4326);                            // untouched
  });
});

describe('prefillAdapterFromTemplate — bespoke (no vendor)', () => {
  it('produces a draft with vendor_id=null + access_method=browser_playwright', () => {
    const draft = prefillAdapterFromTemplate({
      vendor: null,
      base_url: 'https://somecounty.tx.us/property',
      county_id: 'county-id',
      site_type: 'appraisal_cad',
      config_overrides: { search_url: 'https://somecounty.tx.us/property/search' },
    });
    expect(draft.vendor_id).toBeNull();
    expect(draft.access_method).toBe('browser_playwright');
    expect((draft.config as { search_url: string }).search_url).toBe('https://somecounty.tx.us/property/search');
    expect(draft.field_map).toEqual({});
  });
});

describe('unresolvedPlaceholders', () => {
  it('returns unique placeholder names in deterministic order', () => {
    const config = {
      a: 'hello {x}',
      b: ['{y}', '{x}'],
      c: { d: 'static', e: '{z}' },
    };
    expect(unresolvedPlaceholders(config)).toEqual(['x', 'y', 'z']);
  });

  it('returns an empty list for a fully-resolved config', () => {
    expect(unresolvedPlaceholders({ a: 'no placeholders here', b: 42 })).toEqual([]);
  });
});
