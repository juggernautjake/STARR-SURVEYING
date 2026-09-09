import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MILAM_MODULE } from '../counties/milam/module.js';
import { BELL_MODULE } from '../counties/bell/module.js';
import { MILAM_ENDPOINTS } from '../counties/milam/config/endpoints.js';
import {
  composeSitusAddress, composeLegalDescription, composeMailingAddress, abstractNumberFromLegal, subdivisionCodeFromLegal,
} from '../counties/milam/config/field-maps.js';
import { parseSitus, surveyNameFromGrantee } from '../counties/milam/scrapers/gis-scraper.js';
import { halfWidthForAcres } from '../counties/milam/scrapers/gis-viewer-capture.js';
import { parseDeedHistoryTable, parsePropertyDetailHtml, landTableAcreage } from '../counties/bell/scrapers/cad-scraper.js';
import { BIS_CONFIGS } from '../services/bis-cad.js';
import { getCountiesWithModules, hasCountySpecificModule, isMilamCountyAddress, isBellCountyAddress, detectCountyFromAddress } from '../counties/router.js';
import { resolvePhaseIndex, RUN_PHASES } from '../research/run-phases.js';
import { loadPlaybooks, validateRegistry } from '../playbooks/index.js';

// ── THE MILAM COUNTY MODULE, 2026-09-09 ─────────────────────────────────────────────────────────
//
// The second dedicated county. Three things this file pins, each of which was wrong or absent the
// day before:
//
//   1. The REGISTRY told the truth about Milam's sites. `BIS_CONFIGS.milam` said
//      `esearch.milamcad.org` (does not resolve) and `gis.bisclient.com/milamcad/` (HTTP 404) — the
//      147-second dead host of the 2026-09-02 run. The app said TrueAutomation cid=26 (an error
//      page). The sites are esearch.milamad.org, maps.pandai.com/milamad and milam.tx.publicsearch.us.
//   2. The module is WIRED: the router lists it, dispatches to it, and the orchestrator reads its
//      scrapers through the module rather than by Bell's names.
//   3. The parsers read what Milam's sites actually return — the joined `DBO.*` parcel layer, a
//      deed history cited by volume/page, an address written "309 TRAVIS N".
//
// Structural and offline on purpose (the same rule as milam-coryell-coverage.test.ts): the live
// sites were driven by hand before this was written; a CI run should not hammer them.

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');

describe('the registry no longer points Milam at dead hosts', () => {
  it('CONTROL: Bell is unchanged', () => {
    expect(BIS_CONFIGS.bell.baseUrl).toBe('https://esearch.bellcad.org');
    expect(BIS_CONFIGS.bell.gisBaseUrl).toBe('https://gis.bisclient.com/bellcad/');
  });
  it('Milam CAD is milamad.org, not milamcad.org', () => {
    expect(BIS_CONFIGS.milam.baseUrl).toBe('https://esearch.milamad.org');
    expect(JSON.stringify(BIS_CONFIGS.milam)).not.toContain('milamcad');
    expect(JSON.stringify(BIS_CONFIGS.milam)).not.toContain('bisclient');
  });
  it('Milam has a parcel layer the generic path and the map renderer can query', () => {
    expect(BIS_CONFIGS.milam.gisParcelLayerUrls?.[0]).toBe(MILAM_ENDPOINTS.gis.parcelLayer);
    expect(BIS_CONFIGS.milam.gisBaseUrl).toBe(MILAM_ENDPOINTS.gis.viewer);
  });
  it('the module and the registry agree on every host', () => {
    expect(MILAM_MODULE.hosts.cad).toBe(BIS_CONFIGS.milam.baseUrl);
    expect(MILAM_MODULE.hosts.clerk).toBe('https://milam.tx.publicsearch.us');
    expect(MILAM_MODULE.fips).toBe('48331');
  });
  it('the app-side CAD table was corrected too (TrueAutomation cid=26 is dead)', () => {
    const app = fs.readFileSync(path.join(process.cwd(), '..', 'lib', 'research', 'property-search.service.ts'), 'utf8');
    const row = app.split('\n').find((l) => /^\s*milam:\s*\{/.test(l)) ?? '';
    expect(row).toContain('esearch.milamad.org');
    expect(row).not.toContain('cid=26');
  });
});

describe('the module is wired — assert the CALLERS', () => {
  it('the router lists Milam and dispatches to it', () => {
    expect(getCountiesWithModules()).toEqual(['bell', 'milam']);
    expect(hasCountySpecificModule('Milam')).toBe(true);
    expect(hasCountySpecificModule('Coryell')).toBe(false); // control
    const router = read('counties/router.ts');
    expect(router).toContain("case 'milam':");
    expect(router).toContain("await import('./milam/index.js')).runMilamCountyResearch");
    expect(router).toContain('runDedicatedModule(dedicated, input, onProgress, signal)');
  });
  it('the orchestrator reads its scrapers from the module, not from Bell by name', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('export async function orchestrateCountyResearch(');
    expect(orch).toContain('return orchestrateCountyResearch(BELL_MODULE, input, onProgress, signal);');
    for (const call of ['county.scrapers.cad(', 'county.scrapers.gis(', 'county.scrapers.siblingLots(', 'county.scrapers.plats(', 'county.scrapers.clerk(', 'county.scrapers.fema(', 'county.scrapers.txdot(', 'county.scrapers.tax(', 'county.captures.gisViewer(', 'county.captures.maps(']) {
      expect(orch, call).toContain(call);
    }
    // No scraper is called by its Bell name any more — the module is the only door.
    expect(orch).not.toMatch(/\bscrapeBell(Cad|Gis|Clerk|Plats|Fema|TxDot|Tax)\(/);
  });
  it('the Milam entry point runs the shared orchestrator with the Milam module', () => {
    const index = read('counties/milam/index.ts');
    expect(index).toContain('orchestrateCountyResearch(MILAM_MODULE, input, onProgress, signal)');
    expect(index).toContain('withRunContext(input.projectId');
  });
  it('the module provides every source Bell provides', () => {
    expect(Object.keys(MILAM_MODULE.scrapers).sort()).toEqual(Object.keys(BELL_MODULE.scrapers).sort());
    expect(Object.keys(MILAM_MODULE.captures).sort()).toEqual(Object.keys(BELL_MODULE.captures).sort());
    for (const [k, fn] of Object.entries(MILAM_MODULE.scrapers)) expect(typeof fn, k).toBe('function');
  });
  it('the AI prompts name the county from the module (no "Bell County, Texas" literal left in an analyzer prompt)', () => {
    for (const rel of ['counties/bell/analyzers/deed-analyzer.ts', 'counties/bell/analyzers/plat-analyzer.ts', 'counties/bell/analyzers/document-relevance-validator.ts', 'counties/bell/analyzers/lot-correlator.ts', 'counties/bell/analyzers/screenshot-classifier.ts', 'services/adaptive-vision.ts']) {
      const src = read(rel);
      // The phrase may survive in a comment explaining the change; it must not be inside a template.
      const inPrompt = src.split('\n').filter((l) => l.includes('Bell County, Texas') && !/^\s*(\/\/|\*|\/\*)/.test(l));
      expect(inPrompt, rel).toEqual([]);
    }
  });
  it('the run-phases ladder reads a Milam clerk label at the same rung as Bell\'s', () => {
    const bell = RUN_PHASES[resolvePhaseIndex('Phase 2', '[80s] 2A — Bell County Clerk search...')];
    const milam = RUN_PHASES[resolvePhaseIndex('Phase 2', '[80s] 2A — Milam County Clerk search...')];
    expect(milam.id).toBe(bell.id);
    expect(milam.id).toBe('clerk_search');
  });
  it('Milam has site playbooks and they are well-formed', () => {
    expect(loadPlaybooks('Milam').map((p) => p.site).sort()).toEqual(['milam-cad', 'milam-clerk', 'milam-gis', 'milam-quicklink']);
    expect(validateRegistry()).toEqual([]);
  });
});

describe('Milam address detection', () => {
  it('recognises the towns and the ZIPs', () => {
    expect(isMilamCountyAddress('105 W Main, Rockdale, TX 76567')).toBe(true);
    expect(isMilamCountyAddress('309 N Travis, Cameron, TX 76520')).toBe(true); // by ZIP
    expect(isMilamCountyAddress('FM 487, Thorndale TX')).toBe(true);
    expect(isMilamCountyAddress('anywhere, Milam County')).toBe(true);
  });
  it('does not claim Cameron on the name alone (Cameron County is 300 miles south)', () => {
    expect(isMilamCountyAddress('123 Elm St, Cameron, TX')).toBe(false);
  });
  it('CONTROL: Bell addresses are not Milam, and Bell still wins the shared ZIP', () => {
    expect(isMilamCountyAddress('718 S Pearl St, Belton, TX 76513')).toBe(false);
    expect(isBellCountyAddress('105 W Main, Rockdale, TX 76567')).toBe(false);
    expect(detectCountyFromAddress('105 W Main, Rockdale, TX 76567')).toBe('Milam');
    expect(detectCountyFromAddress('718 S Pearl St, Belton, TX 76513')).toBe('Bell');
    expect(detectCountyFromAddress('105 W Main, Rockdale, TX 76567', 'Coryell')).toBeNull();
  });
});

describe('the parsers read what Milam returns', () => {
  // Verbatim attributes from the live layer, 2026-09-09 (parcel 13824, 309 N Travis, Cameron).
  const attrs = {
    'DBO.TaxParcels.Name': '13824', 'DBO.Accounts.Account': 'S09200-001-01-00', 'DBO.Accounts.Owner_Name': 'WANBOB LC ',
    'DBO.Accounts.Legal1': 'S09200 FREEMAN BLK 1 W PT OF ', 'DBO.Accounts.Legal2': null, 'DBO.Accounts.Acres': 0.4577,
    'DBO.Accounts.Prop_Street_Number': '309', 'DBO.Accounts.Prop_Street': 'TRAVIS', 'DBO.Accounts.Prop_Street_Dir': 'N',
    'DBO.Accounts.Prop_Street_Suffix': null, 'DBO.Accounts.Prop_City': 'CAMERON', 'DBO.Accounts.Prop_State': 'TX', 'DBO.Accounts.Prop_Zip5': '76520',
    'DBO.Accounts.Abstract_Subdiv': 'S09200    ', 'DBO.Accounts.Deed_Volume': '1093', 'DBO.Accounts.Deed_Page': '560',
    'DBO.Accounts.Mailing_Address_Street': '8111 WESTCHESTER DR STE 600', 'DBO.Accounts.Mailing_Address_City': 'DALLAS', 'DBO.Accounts.Mailing_Address_State': 'TX', 'DBO.Accounts.Mailing_Address_Zip5': '75225',
  };
  it('composes the situs the way the appraisal page and the postal form write it', () => {
    expect(composeSitusAddress(attrs)).toBe('309 N TRAVIS, CAMERON TX 76520');
    expect(composeLegalDescription(attrs)).toBe('S09200 FREEMAN BLK 1 W PT OF');
    expect(composeMailingAddress(attrs)).toBe('8111 WESTCHESTER DR STE 600, DALLAS TX 75225');
  });
  it('tells an abstract tract from a subdivision lot', () => {
    expect(subdivisionCodeFromLegal('S09200 FREEMAN BLK 1 W PT OF')).toBe('S09200');
    expect(abstractNumberFromLegal('S09200 FREEMAN BLK 1 W PT OF')).toBeNull();
    expect(abstractNumberFromLegal('A0430 DE PENA, J.A.,.465 ACRES')).toBe('430');
    expect(subdivisionCodeFromLegal('A0430 DE PENA, J.A.,.465 ACRES')).toBeNull();
    expect(surveyNameFromGrantee('DE PENA, J.A.')).toBe('J.A. DE PENA');
    expect(surveyNameFromGrantee('HERBST, F')).toBe('F HERBST');
  });
  it('parses a one-line address into the fields the layer indexes', () => {
    expect(parseSitus('309 N Travis, Cameron, TX 76520')).toEqual({ number: '309', dir: 'N', street: 'TRAVIS', city: 'CAMERON' });
    expect(parseSitus('105 W Main St, Buckholts TX 76518')).toEqual({ number: '105', dir: 'W', street: 'MAIN', city: 'BUCKHOLTS' });
    expect(parseSitus('FM 2095, Rockdale, TX')).toEqual({ number: null, dir: null, street: 'FM 2095', city: 'ROCKDALE' });
  });
  it('frames a house lot tighter than a tract', () => {
    expect(halfWidthForAcres(0.25)).toBeLessThan(halfWidthForAcres(40));
    expect(halfWidthForAcres(null)).toBeGreaterThanOrEqual(45);
    expect(halfWidthForAcres(100000)).toBeLessThanOrEqual(1500);
  });
});

describe('the BIS deed-history table is read by its header', () => {
  // Verbatim from esearch.milamad.org/Property/View/13824 (2026-09-09): volume/page, no numbers.
  const MILAM_TABLE = `<table class="table"><tr><th class="table-number">Deed Date</th><th>Type</th><th>Description</th><th>Grantor</th><th>Grantee</th><th>Volume</th><th>Page</th><th>Number</th></tr>
<tr><td>2/23/2009</td><td>AD</td><td>ASSUMPTION DEED</td><td>ELLIOTT BOBBY &amp; WANDA</td><td>WANBOB LC</td><td>1093</td><td>560</td><td></td></tr>
<tr><td>6/5/2007</td><td>WD</td><td>WARRANTY DEED</td><td>SPEC CORPORATION</td><td>ELLIOTT BOBBY &amp; WANDA</td><td>1045</td><td>529</td><td>0</td></tr>
<tr><td>11/1/1991</td><td>OT</td><td></td><td>BUCKHOLTS STATE BANK</td><td>SPEC CORPORATION</td><td>649</td><td>724</td><td>0</td></tr></table>`;
  // Verbatim from esearch.bellcad.org/Property/View/405: a twelve-digit instrument and vol/page rows.
  const BELL_TABLE = `<table><tr><th>Deed Date</th><th>Type</th><th>Description</th><th>Grantor</th><th>Grantee</th><th>Volume</th><th>Page</th><th>Number</th></tr>
<tr><td>11/20/2009</td><td>1</td><td>WARRANTY DEED</td><td>MARTINEZ, URBANO</td><td>LOPEZ, JUAN</td><td></td><td></td><td>200800046957</td></tr>
<tr><td>2/23/1998</td><td>1</td><td>WARRANTY DEED</td><td>TUNSTALL, WANDA</td><td>MARTINEZ, URBANO</td><td>3745</td><td>631</td><td></td></tr>
<tr><td>9/19/1979</td><td>16</td><td>WARRANTY DEED</td><td></td><td></td><td>01632</td><td>00089</td><td></td></tr></table>`;
  it('reads Milam volume/page rows the positional scan could never see', () => {
    const rows = parseDeedHistoryTable(MILAM_TABLE);
    expect(rows.map((r) => `${r.volume}/${r.page}`)).toEqual(['1093/560', '1045/529', '649/724']);
    expect(rows[0]).toMatchObject({ deedDate: '2/23/2009', grantor: 'ELLIOTT BOBBY & WANDA', grantee: 'WANBOB LC', description: 'ASSUMPTION DEED' });
    expect(rows.every((r) => r.instrumentNumber === undefined)).toBe(true); // "0" is not an instrument
  });
  it('reads a twelve-digit Bell instrument and strips leading zeros from old volumes', () => {
    const rows = parseDeedHistoryTable(BELL_TABLE);
    expect(rows[0].instrumentNumber).toBe('200800046957');
    expect(rows[1]).toMatchObject({ volume: '3745', page: '631' });
    expect(rows[2]).toMatchObject({ volume: '1632', page: '89' });
  });
  it('CONTROL: a table without a deed header yields nothing', () => {
    expect(parseDeedHistoryTable('<table><tr><th>Year</th><th>Improvements</th></tr><tr><td>2026</td><td>$1</td></tr></table>')).toEqual([]);
  });
});

describe('the Milam clerk profile reaches the Kofile service with its own key', () => {
  it('bell-clerk.ts takes the county on the two searches that had Bell hardcoded', () => {
    const svc = read('services/bell-clerk.ts');
    expect(svc).toMatch(/export async function searchByInstrument\([\s\S]*?county: string = 'bell',/);
    expect(svc).toMatch(/export async function searchBellClerkOwnerForPlatDeed\([\s\S]*?county: string = 'bell',/);
    expect(svc).not.toContain("getKofileBaseUrl('bell') || 'https://bell.tx.publicsearch.us'");
  });
  it('the shared clerk and plat scrapers pass their profile key everywhere they used to pass Bell', () => {
    for (const rel of ['counties/bell/scrapers/clerk-scraper.ts', 'counties/bell/scrapers/plat-scraper.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/searchClerkRecords\('bell'/);
      expect(src, rel).not.toMatch(/logger, 'bell', undefined/);
    }
  });
});

describe('the BIS detail page is read by its own labels', () => {
  // The markup both sites write (esearch.milamad.org/Property/View/13824 and esearch.bellcad.org/
  // Property/View/405, 2026-09-09): <th>Label:</th><td colspan="3">value</td>, sections headed by a
  // <th colspan="4">, the situs with a CR/LF entity, acreage only in the Property Land table.
  const PAGE = `<h3>Property ID: 13824 For Year 2026</h3>
<table><tr class="active form-table-title"><th colspan="4">Account</th></tr>
<tr><th>Property ID:</th><td>13824</td><td><strong> Geographic ID: </strong> S09200-001-01-00</td></tr>
<tr><th>Type:</th><td>R</td><td><strong>Zoning: </strong>B- BUSINESS</td></tr>
<tr class="active form-table-title"><th colspan="4">Location</th></tr>
<tr><th>Situs Address:</th><td colspan="3">309 N TRAVIS &#xD;&#xA;CAMERON, TX 76520</td></tr>
<tr><th>Map ID:</th><td></td><td class="wordbreak"><strong>Mapsco: </strong></td></tr>
<tr><th>Legal Description:</th><td colspan="3">S09200 FREEMAN BLK 1 W PT OF</td></tr>
<tr class="active form-table-title"><th colspan="4"> Owner </th></tr>
<tr><th>Owner ID:</th><td colspan="3">10019440</td></tr>
<tr><th>Name:</th><td colspan="3">WANBOB LC</td></tr>
<tr><th>Mailing Address:</th><td colspan="3">%STRIPES LLC<br />8111 WESTCHESTER DR STE 600<br />DALLAS, TX 75225-6142 </td></tr></table>
<table><tr><th>Type</th><th>Description</th><th class="table-number">Acreage</th><th>Sqft</th></tr>
<tr><td>SQ</td><td>SQUARE FOOTAGE</td><td>0.46</td><td>19,938.00</td></tr></table>
<table><tr><th>Deed Date</th><th>Type</th><th>Description</th><th>Grantor</th><th>Grantee</th><th>Volume</th><th>Page</th><th>Number</th></tr>
<tr><td>2/23/2009</td><td>AD</td><td>ASSUMPTION DEED</td><td>ELLIOTT BOBBY &amp; WANDA</td><td>WANBOB LC</td><td>1093</td><td>560</td><td></td></tr></table>`;
  it('reads owner, situs, type, mailing, acreage and the deed table — the fields the old patterns missed', () => {
    const r = parsePropertyDetailHtml(PAGE, '13824', 'http-api', [], [], () => {});
    expect(r).not.toBeNull();
    expect(r!.ownerName).toBe('WANBOB LC');
    expect(r!.situsAddress).toBe('309 N TRAVIS, CAMERON, TX 76520');
    expect(r!.propertyType).toBe('R');
    expect(r!.legalDescription).toBe('S09200 FREEMAN BLK 1 W PT OF');
    expect(r!.mailingAddress).toBe('%STRIPES LLC, 8111 WESTCHESTER DR STE 600, DALLAS, TX 75225-6142');
    expect(r!.acreage).toBe(0.46);
    expect(r!.deedHistory).toHaveLength(1);
    expect(r!.deedHistory[0]).toMatchObject({ volume: '1093', page: '560' });
    // The loose ten-digit scan is off when the deed table was read: the owner id must not become an instrument.
    expect(r!.instrumentNumbers).toEqual([]);
  });
  it('a section heading cannot swallow the row after it', () => {
    // "Location" is a <th colspan=4> immediately before the situs row.
    expect(parsePropertyDetailHtml(PAGE, '13824', 'http-api', [], [], () => {})!.situsAddress).not.toBeNull();
  });
  it('CONTROL: acreage comes from the land table, not the column header', () => {
    expect(landTableAcreage(PAGE)).toBe(0.46);
    expect(landTableAcreage('<table><tr><th>Year</th><th>Land</th></tr><tr><td>2026</td><td>1</td></tr></table>')).toBeNull();
  });
});
