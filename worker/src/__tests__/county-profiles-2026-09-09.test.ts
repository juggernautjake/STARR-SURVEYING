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
    // Bell, Milam, Williamson (2026-09-21).
    expect(counts.curated).toBe(3);
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
  it('Burnet: a BIS appraisal site is known, nobody has driven it → vendor-default', () => {
    // This was Williamson until 2026-09-21, when Williamson was curated — its sites driven by
    // hand after a run discovered that the BIS host in its config, esearch.wilcotx.gov, returns
    // NXDOMAIN and that the county is not a BIS county at all. Burnet takes its place as the
    // example: a county whose vendor is known and whose sites nobody has opened.
    const p = resolveCountyProfile('Burnet');
    expect(p.tier).toBe('vendor-default');
    expect(p.module).toBeUndefined();
    expect(p.sites.find((s) => s.role === 'appraisal')?.vendor).toBe('bis');
    expect(p.statement).toContain('not curated');
    expect(p.golden).toEqual([]);
    // The absence of a verified date is what "nobody has driven this" MEANS in a profile.
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
    // ── CURATED IS NOT THE SAME AS "HAS A MODULE" (2026-09-21) ────────────────────────────────
    //
    // This asserted the two were identical, and Williamson broke it by being curated without a
    // runner. The router dispatches on `profile.module`, so the equality was never the invariant
    // the router relied on — and enforcing it meant a county could not be curated until somebody
    // had time to write a module, which is exactly the delay that left Williamson pointed at a
    // hostname that does not exist.
    //
    // The one-way implication is the real rule: a module implies curation.
    const withModules = getCountiesWithModules();
    const curated = listCuratedProfiles().map((p) => p.key);
    for (const k of withModules) expect(curated, `${k} has a module but is not curated`).toContain(k);

    expect(hasCountySpecificModule('Milam County')).toBe(true);
    expect(hasCountySpecificModule('Bell')).toBe(true);
    // Curated, driven by hand, and deliberately running the generic pipeline until a runner earns
    // its place. `hasCountySpecificModule` asks whether there is a MODULE, not whether the county
    // is known.
    expect(hasCountySpecificModule('Williamson')).toBe(false);
    expect(resolveCountyProfile('Williamson').tier).toBe('curated');
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
