// Asking the county what it has, rather than guessing (research plan R38).
//
// Kofile's search needs a `department` code, and the code is per county. Hardcoding one produced
// three wrong answers in a day:
//
//   Milam       RP = "Property Records"
//   Travis      RP = "Land Records"          — same code, different name
//   Williamson  ONLY CCM = "Commissioners Court" — no land-records department exists on that portal
//
// Guessing from a candidate list (RP, OPR, DEED, LAND, RE, REAL, PR…) found nothing on the counties
// that needed it. The county publishes its own list at `window.__data.configuration.departments`;
// the fixtures below are verbatim from those live sites on 2026-08-02.

import { describe, it, expect } from 'vitest';
import {
  READ_SITE_CONFIG,
  chooseDepartment,
  toAdapterConfig,
  type KofileSiteConfig,
} from '../adapters/kofile-discovery.js';

const MILAM: KofileSiteConfig = {
  departments: [
    { code: 'RP', name: 'Property Records' }, { code: 'ASN', name: 'Assumed Names' },
    { code: 'MC', name: 'Marriage' }, { code: 'CCM', name: 'Commissioners Court' },
    { code: 'MB', name: 'Marks and Brands' }, { code: 'FC', name: 'Foreclosures' },
    { code: 'PRB', name: 'Probates' },
  ],
  dateRanges: { RP: { recordedDateRange: '18010101,20260731', certifiedDate: '2026-07-30' } },
  selectedDepartment: 'RP',
};

const TRAVIS: KofileSiteConfig = {
  departments: [
    { code: 'RP', name: 'Land Records' }, { code: 'ASN', name: 'Assumed Names' },
    { code: 'MC', name: 'Marriage' }, { code: 'FC', name: 'Foreclosures' },
  ],
  dateRanges: {},
  selectedDepartment: 'RP',
};

const WILLIAMSON: KofileSiteConfig = {
  departments: [{ code: 'CCM', name: 'Commissioners Court' }],
  dateRanges: { CCM: { recordedDateRange: '19040215,19990309' } },
  selectedDepartment: 'CCM',
};

const MADISON: KofileSiteConfig = {
  departments: [{ code: 'RP', name: 'Real Property' }, { code: 'CCM', name: 'Commissioners Court' }],
  dateRanges: {},
  selectedDepartment: 'RP',
};

describe('picking the land-records department', () => {
  it('finds it however the county names it', () => {
    expect(chooseDepartment(MILAM, 'Milam').department).toBe('RP');       // "Property Records"
    expect(chooseDepartment(TRAVIS, 'Travis').department).toBe('RP');     // "Land Records"
    expect(chooseDepartment(MADISON, 'Madison').department).toBe('RP');   // "Real Property"
  });

  it('does not pick marriage records or commissioners court', () => {
    // Milam offers seven departments; six of them are not deeds.
    const c = chooseDepartment(MILAM, 'Milam');
    expect(c.department).not.toBe('MC');
    expect(c.department).not.toBe('CCM');
  });

  it('uses the county’s own date range and certification date', () => {
    const c = chooseDepartment(MILAM, 'Milam');
    expect(c.dateRange).toBe('18010101,20260731');
    expect(c.certifiedThrough).toBe('2026-07-30');
    expect(c.reason).toContain('certified through 2026-07-30');
  });

  it('returns NO date range rather than inventing one', () => {
    // The site rejects a range outside its own — inventing 18000101 is what made Travis look broken.
    const c = chooseDepartment(TRAVIS, 'Travis');
    expect(c.dateRange).toBeNull();
    expect(c.reason).toContain('no date range published by the site');
  });
});

describe('a county whose deeds are not on this portal', () => {
  it('says so instead of searching anyway', () => {
    // Williamson exposes only Commissioners Court. Searching it returns nothing, which reads as
    // "this property has no deeds" — the single most misleading answer this platform can give.
    const c = chooseDepartment(WILLIAMSON, 'Williamson');
    expect(c.noLandRecords).toBe(true);
    expect(c.department).toBeNull();
    expect(c.reason).toContain('exposes no land-records department');
    expect(c.reason).toContain('would return nothing and mean nothing');
  });

  it('names what the portal DOES have, so the gap is diagnosable', () => {
    expect(chooseDepartment(WILLIAMSON, 'Williamson').reason).toContain('CCM ("Commissioners Court")');
  });

  it('distinguishes "no land records" from "could not read the page"', () => {
    // One is a fact about the county; the other is a failure of ours.
    const unread = chooseDepartment(null, 'Bell');
    expect(unread.noLandRecords).toBe(false);
    expect(unread.reason).toContain('not evidence that the county has no records');
  });

  it('treats an empty department list as unreadable, not as empty', () => {
    const c = chooseDepartment({ departments: [], dateRanges: {}, selectedDepartment: null }, 'Bell');
    expect(c.noLandRecords).toBe(false);
    expect(c.reason).toContain('retrieval failure');
  });
});

describe('what gets written back to the registry', () => {
  it('records every department the county offers, not just the chosen one', () => {
    // A reviewer asking "why is there no plat here" should see whether the county exposes plats.
    const cfg = toAdapterConfig(MILAM, chooseDepartment(MILAM, 'Milam'));
    expect(cfg.departments_available).toContain('PRB=Probates');
    expect(cfg.departments_available).toContain('RP=Property Records');
  });

  it('flags a portal with no land records so coverage can report it', () => {
    const cfg = toAdapterConfig(WILLIAMSON, chooseDepartment(WILLIAMSON, 'Williamson'));
    expect(cfg.no_land_records).toBe(true);
    expect(cfg.department).toBeNull();
  });

  it('carries the certification date through', () => {
    // A chain that stops in 2026 because the index does is not a gap in our work (R14).
    expect(toAdapterConfig(MILAM, chooseDepartment(MILAM, 'Milam')).certified_through).toBe('2026-07-30');
  });
});

describe('the reader that runs in the page', () => {
  it('reads all three pieces of state the SPA publishes', () => {
    for (const key of ['configuration', 'departments', 'departmentDateRanges', 'selectedDepartment']) {
      expect(READ_SITE_CONFIG).toContain(key);
    }
  });

  it('returns null rather than throwing when __data is absent', () => {
    // A page that has not hydrated must be a retrieval failure, not an exception mid-run.
    expect(READ_SITE_CONFIG).toContain('if (!d) return null');
  });
});
