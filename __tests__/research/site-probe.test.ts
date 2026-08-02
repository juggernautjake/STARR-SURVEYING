// §8.3 — reading a county portal nobody has a template for, and §8.6's bespoke adapter.
//
// The roadmap deferred this deliberately: it drives a browser against a government website, and
// §9.9 says outward-facing capability ships last and ships off. What made it buildable now is the
// split — the judgement is a pure function over a structural description of a page, so it is tested
// here against fixtures rather than against Bell County's server.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  configFromProposal,
  fieldMapFromProposal,
  proposeFromCapture,
  type CapturedForm,
  type PageCapture,
} from '@/lib/research/site-probe';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const searchForm: CapturedForm = {
  selector: '#searchForm',
  method: 'get',
  action: '/Search/Results',
  submitSelector: '#btnSearch',
  fields: [
    { selector: '#taxYear', tag: 'select', type: null, name: 'year', id: 'taxYear', placeholder: null, label: 'Tax year' },
    { selector: '#situs', tag: 'input', type: 'text', name: 'situsAddress', id: 'situs', placeholder: 'Property address', label: 'Property address' },
  ],
};

const loginForm: CapturedForm = {
  selector: '#login',
  method: 'post',
  action: '/account/login',
  submitSelector: '#signin',
  fields: [
    { selector: '#user', tag: 'input', type: 'text', name: 'username', id: 'user', placeholder: null, label: 'Username' },
    { selector: '#pass', tag: 'input', type: 'password', name: 'password', id: 'pass', placeholder: null, label: 'Password' },
  ],
};

const capture = (over: Partial<PageCapture> = {}): PageCapture => ({
  url: 'https://cad.example-county.org/',
  title: 'Example County Appraisal District',
  forms: [searchForm],
  tables: [
    {
      selector: '#results',
      headers: ['Property ID', 'Owner Name', 'Situs Address', 'Legal Description', 'Acres', 'Market Value'],
      rowCount: 12,
      sampleRow: ['R12345', 'SMITH JOHN', '123 FM 2410', 'A0123 SURVEY, TRACT 4', '10.02', '$182,400'],
      firstRowLinkSelector: '#results tbody tr:nth-of-type(1) > td:nth-of-type(1) > a',
    },
  ],
  hasCanvas: false,
  textSample: 'Property Search',
  ...over,
});

describe('finding the search', () => {
  it('picks the search form and the field that takes the query', () => {
    const p = proposeFromCapture(capture());
    expect(p.search?.formSelector).toBe('#searchForm');
    // NOT the first field. County portals routinely put a tax-year select before the address box.
    expect(p.search?.querySelector).toBe('#situs');
    expect(p.search?.queryKind).toBe('address');
  });

  it('refuses to treat a sign-in as a search', () => {
    // Probing a login form means posting a query into somebody's authentication endpoint.
    const p = proposeFromCapture(capture({ forms: [loginForm] }));
    expect(p.search).toBeNull();
    expect(p.warnings.join(' ')).toContain('No search form was recognised');
  });

  it('prefers the search form when a page has both', () => {
    const p = proposeFromCapture(capture({ forms: [loginForm, searchForm] }));
    expect(p.search?.formSelector).toBe('#searchForm');
  });

  it('says so when the search box does not declare what it takes', () => {
    const vague: CapturedForm = {
      ...searchForm,
      fields: [{ selector: '#q', tag: 'input', type: 'text', name: 'q', id: 'q', placeholder: null, label: null }],
    };
    const p = proposeFromCapture(capture({ forms: [vague] }));
    expect(p.search?.queryKind).toBe('unknown');
    expect(p.warnings.join(' ')).toContain('both as an address and as a parcel number');
  });
});

describe('naming the columns', () => {
  it('maps headers a surveyor would recognise onto the canonical schema', () => {
    const p = proposeFromCapture(capture());
    const byHeader = Object.fromEntries((p.results?.columns ?? []).map((c) => [c.header, c.canonicalPath]));
    expect(byHeader).toMatchObject({
      'Property ID': 'parcel_id',
      'Owner Name': 'owner.name',
      'Situs Address': 'situs_address.line1',
      'Legal Description': 'legal.description',
      Acres: 'acreage',
      'Market Value': 'valuation.market_value',
    });
  });

  it('does not claim a layout table is the results', () => {
    const layout = {
      selector: '.wrapper',
      headers: ['', ''],
      rowCount: 1,
      sampleRow: ['logo', 'menu'],
      firstRowLinkSelector: null,
    };
    const p = proposeFromCapture(capture({ tables: [layout] }));
    expect(p.results).toBeNull();
    expect(p.warnings.join(' ')).toContain('none of their headers looked like property fields');
  });

  it('always warns that a header is a guess, even when every column matched', () => {
    // This is the mapping most likely to be wrong in a way that looks right.
    const p = proposeFromCapture(capture());
    expect(p.warnings.join(' ')).toContain('guessed from the header text');
  });

  it('flags a canvas-rendered portal as OCR territory', () => {
    const p = proposeFromCapture(capture({ hasCanvas: true }));
    expect(p.warnings.join(' ')).toContain('canvas');
  });
});

describe('the confidence grade is about shape, never about "it works"', () => {
  it('grades a complete, well-labelled portal highest', () => {
    expect(proposeFromCapture(capture()).confidence).toBe('high');
  });

  it('drops when half the picture is missing', () => {
    expect(proposeFromCapture(capture({ tables: [] })).confidence).toBe('medium');
    expect(proposeFromCapture(capture({ forms: [], tables: [] })).confidence).toBe('none');
  });

  it('carries the evidence that produced it', () => {
    // A wrong proposal that explains itself is corrected in seconds; one that does not is trusted.
    expect(proposeFromCapture(capture()).evidence.length).toBeGreaterThan(1);
  });
});

describe('§8.6 — the bespoke adapter that comes out of it', () => {
  const p = proposeFromCapture(capture());

  it('records the flow as ordered steps, not a bag of selectors', () => {
    const cfg = configFromProposal(p, 'https://cad.example-county.org/') as {
      flow: { steps: Array<{ action: string }> };
      access_method: string;
    };
    expect(cfg.access_method).toBe('browser_playwright');
    expect(cfg.flow.steps.map((s) => s.action)).toEqual(['goto', 'fill', 'click', 'wait_for', 'click']);
  });

  it('falls back to Enter when the form has no submit button', () => {
    const noSubmit = proposeFromCapture(capture({ forms: [{ ...searchForm, submitSelector: null }] }));
    const cfg = configFromProposal(noSubmit, 'https://x.test/') as { flow: { steps: Array<{ action: string }> } };
    expect(cfg.flow.steps.map((s) => s.action)).toContain('press');
  });

  it('stores the warnings ON the adapter, so they travel with it', () => {
    const cfg = configFromProposal(p, 'https://x.test/') as { probe: { warnings: string[] } };
    expect(cfg.probe.warnings.length).toBeGreaterThan(0);
  });

  it('emits a field map the registry can store', () => {
    const fm = fieldMapFromProposal(p) as { vendor_key: string; mappings: Array<{ to_path: string; transform: string }> };
    expect(fm.vendor_key).toBe('generic_playwright');
    expect(fm.mappings.find((m) => m.to_path === 'acreage')?.transform).toBe('number');
  });
});

describe('the guards §9.9 asks for', () => {
  /** Comments stripped: both files explain at length why a thing is ABSENT, and matching prose
   *  would fail the assertion for saying the right thing. */
  const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const runner = code(read('lib/research/site-probe-runner.ts'));
  const route = code(read('app/api/admin/research/sites/probe/route.ts'));

  it('loads one page and never submits the county’s search form', () => {
    expect(runner).toContain("waitUntil: 'domcontentloaded'");
    expect(runner).not.toMatch(/page\.click\(|page\.fill\(|\.press\(/);
  });

  it('identifies itself honestly to the county’s server', () => {
    expect(runner).toContain('StarrSurveying-SiteProbe');
  });

  it('always closes the browser, and only tries once', () => {
    expect(runner).toContain('browser?.close()');
    expect(runner).not.toMatch(/for \(let attempt|retry/i);
  });

  it('degrades instead of throwing when there is no browser', () => {
    expect(runner).toContain('No browser is available in this environment');
  });

  it('is off unless somebody turned it on, and a failed settings read does not mean yes', () => {
    expect(route).toContain('site_probe_enabled');
    expect(route).toContain('settingsError');
    expect(read('seeds/528_site_probe_flag.sql')).toContain('DEFAULT FALSE');
  });

  it('saves nothing — the confirm step is the ordinary registration POST', () => {
    expect(route).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
  });
});
