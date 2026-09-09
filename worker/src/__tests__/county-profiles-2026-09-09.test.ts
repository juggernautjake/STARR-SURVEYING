import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCountyProfile, listCountyProfiles, listCuratedProfiles, tierCounts, toProfileView } from '../counties/profile.js';
import { BELL_MODULE } from '../counties/bell/module.js';
import { MILAM_MODULE } from '../counties/milam/module.js';
import { BIS_CONFIGS } from '../services/bis-cad.js';
import { getClerkSystem } from '../services/clerk-registry.js';
import { hasCountySpecificModule, getCountiesWithModules } from '../counties/router.js';

// ── ONE PROFILE PER COUNTY, WITH A FALLBACK (owner, 2026-09-09) ────────────────────────────────
//
// "I want one profile per county, but if the profile is not fully built, then it should have
// generic fallback options for research methods." The resolver answers for all 254 counties; the
// tests below pin that a curated profile agrees with the module it names (the Milam defect was a
// registry and a site disagreeing), that an uncurated county with known vendors is a vendor-default
// and not passed off as coverage, and that the router dispatches from the resolver alone.

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');

describe('every Texas county resolves to exactly one profile', () => {
  it('254 counties, three tiers, curated first', () => {
    const all = listCountyProfiles();
    expect(all).toHaveLength(254);
    const counts = tierCounts(all);
    expect(counts.curated).toBe(2);
    expect(counts.curated + counts['vendor-default'] + counts.fallback).toBe(254);
    expect(all[0].tier).toBe('curated');
    expect(all[all.length - 1].tier).toBe('fallback');
  });
  it('resolves by name, "X County", key and FIPS', () => {
    for (const q of ['Milam', 'milam', 'Milam County', '48331']) expect(resolveCountyProfile(q).key, q).toBe('milam');
  });
  it('CONTROL: an unknown string is a fallback that SAYS it is unknown, not an empty coverage', () => {
    const p = resolveCountyProfile('Narnia');
    expect(p.tier).toBe('fallback');
    expect(p.statement).toContain('not a recognised Texas county');
    expect(p.module).toBeUndefined();
  });
});

describe('curated profiles agree with the modules they name', () => {
  for (const [profileKey, module] of [['bell', BELL_MODULE], ['milam', MILAM_MODULE]] as const) {
    it(`${profileKey}: sites match the module's hosts and the module loads`, async () => {
      const p = resolveCountyProfile(profileKey);
      expect(p.tier).toBe('curated');
      expect(p.fips).toBe(module.fips);
      expect(p.sites.find((s) => s.role === 'appraisal')?.url).toBe(module.hosts.cad);
      expect(p.sites.find((s) => s.role === 'clerk')?.url).toBe(module.hosts.clerk);
      // The registry the generic path reads must say the same appraisal host.
      expect(BIS_CONFIGS[profileKey].baseUrl).toBe(module.hosts.cad);
      expect(getClerkSystem(p.fips)).toBe('kofile');
      const run = await p.module!.load();
      expect(typeof run).toBe('function');
      expect(p.golden.length).toBeGreaterThan(0);
      for (const s of p.sites.filter((s) => s.role !== 'historic_index')) expect(s.verifiedAt, `${profileKey} ${s.role} has no verified date`).toBeTruthy();
    });
  }
  it('Milam records the facts that differ from Bell', () => {
    const m = resolveCountyProfile('milam');
    expect(m.capabilities.clerkBridge).toBe('volume_page');
    expect(m.capabilities.freePlatRepository).toBe(false);
    expect(m.capabilities.surveyLayer).toBe(true);
    const b = resolveCountyProfile('bell');
    expect(b.capabilities.clerkBridge).toBe('instrument');
    expect(b.capabilities.freePlatRepository).toBe(true);
  });
});

describe('an uncurated county gets the vendor-default fallback, stated as such', () => {
  it('Williamson: BIS appraisal site + Tyler Eagle clerk known → vendor-default with both sites', () => {
    const p = resolveCountyProfile('Williamson');
    expect(p.tier).toBe('vendor-default');
    expect(p.module).toBeUndefined();
    expect(p.sites.find((s) => s.role === 'appraisal')?.vendor).toBe('bis');
    // The clerk vendor is whatever the registry routes — Williamson is a Tyler Eagle portal — and
    // the URL is the one that vendor's own table names, so the profile cannot disagree with the adapter.
    expect(getClerkSystem(p.fips)).toBe('tyler');
    const clerk = p.sites.find((s) => s.role === 'clerk');
    expect(clerk?.vendor).toBe('tyler_eagle');
    expect(clerk?.url).toBe('https://williamsoncountytx-web.tylerhost.net/williamsonweb/');
    expect(p.statement).toContain('not curated');
    expect(p.recipe.join(' ')).toContain('BIS eSearch');
    expect(p.golden).toEqual([]);
    for (const s of p.sites) expect(s.verifiedAt).toBeUndefined();
  });
  it('a county with no known portal is a fallback on the aggregator', () => {
    // Loving County: no BIS row, no clerk vendor in any registry.
    const p = resolveCountyProfile('Loving');
    expect(p.tier).toBe('fallback');
    expect(p.sites.find((s) => s.role === 'clerk')?.vendor).toBe('texasfile');
    expect(p.recipe.join(' ')).toContain('aggregator');
  });
});

describe('the router dispatches from the resolver — assert the CALLER', () => {
  it('the module list is derived, not hand-kept', () => {
    expect(getCountiesWithModules()).toEqual(listCuratedProfiles().map((p) => p.key));
    expect(hasCountySpecificModule('Milam County')).toBe(true);
    expect(hasCountySpecificModule('Williamson')).toBe(false);
  });
  it('runCountyResearch asks the profile for the module and no longer names counties in the switch', () => {
    const router = read('counties/router.ts');
    expect(router).toContain('const profile = resolveCountyProfile(input.county);');
    expect(router).toContain('if (profile.module) {');
    expect(router).not.toContain("case 'bell':");
    expect(router).not.toContain("case 'milam':");
  });
  it('the worker exposes the profiles and the app proxies them', () => {
    const index = read('index.ts');
    expect(index).toContain("app.get('/research/county-profiles', requireAuth,");
    expect(index).toContain('profiles.map(toProfileView)');
    const proxy = fs.readFileSync(path.join(process.cwd(), '..', 'app', 'api', 'admin', 'research', 'county-profiles', 'route.ts'), 'utf8');
    expect(proxy).toContain('/research/county-profiles');
    expect(proxy).toContain('canReadResearch');
    const tab = fs.readFileSync(path.join(process.cwd(), '..', 'app', 'admin', 'research', '_tabs', 'CoverageTab.tsx'), 'utf8');
    expect(tab).toContain('<CountyProfilesPanel />');
  });
  it('the view sent to the app carries no loader', () => {
    const v = toProfileView(resolveCountyProfile('bell')) as Record<string, unknown>;
    expect(v.module).toBeUndefined();
    expect(v.curated).toBe(true);
  });
});
