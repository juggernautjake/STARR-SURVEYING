/**
 * County profiles — one answer per county to "what do we know about researching here?"
 *
 * ── WHY (owner, 2026-09-09) ─────────────────────────────────────────────────────────────────────
 *
 * "I want one profile per county, but if the profile is not fully built, then it should have
 * generic fallback options for research methods so that we can still hopefully get some results."
 *
 * Until now nine registries each named counties on their own terms and a run consulted several of
 * them without any one of them being the answer. Milam measured the cost: three registries, three
 * different wrong addresses for the same appraisal district. This module is the single resolver:
 *
 *   CURATED         a person drove every site and wrote `counties/<key>/profile.ts` — Bell, Milam.
 *                   The run is the dedicated module; the profile carries the sites, the county's own
 *                   facts (which clerk bridge, whether a free plat repository exists) and the
 *                   GOLDEN PARCELS whose answers are known, for drills and regression.
 *   VENDOR-DEFAULT  nobody has curated the county, but its vendors are known (a BIS appraisal
 *                   site, a Kofile clerk …), so the generic pipeline can run with the vendor's
 *                   shapes. Derived here from the existing registries — the fallback the owner
 *                   asked for, stated as a fallback rather than passed off as coverage.
 *   FALLBACK        nothing but the statewide aggregator (TexasFile) is known.
 *
 * Every curated profile is checked against the registries in CI (a profile and a registry that
 * disagree is exactly the Milam defect), and the router dispatches from THIS resolver alone.
 */

import { TEXAS_COUNTIES, resolveCounty, type CountyRecord } from '../lib/county-fips.js';
import { lookupByCounty } from '../research/county-key.js';
import { BIS_CONFIGS } from '../services/bis-cad.js';
import { getClerkSystem, hasFreeImagePreview, type ClerkSystem } from '../services/clerk-registry.js';
import { getKofileBaseUrl } from '../services/bell-clerk.js';
import { platSourceStatus } from '../services/county-plats.js';
import { countyRecordsUrl } from '../adapters/texasfile-access.js';
import { cadForCounty } from '../research/cad-directory.js';
import { tylerEagleUrl } from '../adapters/tyler-eagle-discovery.js';
import { uslrUrl } from '../adapters/uslandrecords-discovery.js';
import { aumentumBaseUrl } from '../adapters/aumentum-clerk-adapter.js';
import { edoctecBaseUrl } from '../adapters/edoctec-clerk-adapter.js';
import type { BellResearchInput } from './bell/types/research-input.js';
import type { BellResearchResult } from './bell/types/research-result.js';
import type { CountyResearchProgress } from './router.js';

export type CountyTier = 'curated' | 'vendor-default' | 'fallback';

export type SiteRole = 'appraisal' | 'parcel_map' | 'parcel_data' | 'clerk' | 'plats' | 'historic_index' | 'tax';

export interface ProfileSite {
  role: SiteRole;
  /** 'bis', 'kofile', 'pandai_arcgis', 'texasfile', 'county_portal', 'quicklink', 'unknown' … */
  vendor: string;
  url: string | null;
  /** How the worker reaches it — the plat egress vocabulary. */
  egress?: 'direct' | 'app-relay' | 'browser-route' | 'blocked';
  /** ISO date a person last drove this site and saw it answer; absent for a derived entry. */
  verifiedAt?: string;
  notes?: string;
}

/** A parcel whose answer is known — the drill's question and the regression fixture. */
export interface GoldenParcel {
  propertyId: string;
  address: string;
  /** The fields a source is expected to return. Compared by the canary kinds, not byte-equal. */
  expect: Record<string, string | number>;
  verifiedAt: string;
  notes?: string;
}

export interface CountyCapabilities {
  freePlatRepository: boolean;
  gisParcelLayer: boolean;
  /** The county's own original-survey (abstract) layer — Milam has one, Bell does not. */
  surveyLayer: boolean;
  historicIndex: boolean;
  clerkFreePreview: boolean;
  /** How a deed cited by the appraisal district is found at the clerk. */
  clerkBridge: 'instrument' | 'volume_page' | 'name_only' | 'none';
}

/** The entry point every dedicated county module exports. */
export type DedicatedRunner = (
  input: BellResearchInput,
  onProgress: (p: CountyResearchProgress) => void,
  signal?: AbortSignal,
) => Promise<BellResearchResult>;

export interface CountyProfile {
  name: string;
  key: string;
  fips: string;
  tier: CountyTier;
  /** Present only for a curated county: the dedicated module's entry point, loaded on demand. */
  module?: { load: () => Promise<DedicatedRunner> };
  /** Towns, upper case, for address detection and for stripping a city off a street search. */
  towns: string[];
  sites: ProfileSite[];
  capabilities: CountyCapabilities;
  /** What a run does here, in order — sentences a surveyor can read. */
  recipe: string[];
  golden: GoldenParcel[];
  /** One line on where this county stands. */
  statement: string;
}

/** The JSON shape sent to the app: a profile without its loader. */
export type CountyProfileView = Omit<CountyProfile, 'module'> & { curated: boolean };

// ── Curated profiles ──────────────────────────────────────────────────────

import { BELL_PROFILE } from './bell/profile.js';
import { MILAM_PROFILE } from './milam/profile.js';

const CURATED: CountyProfile[] = [BELL_PROFILE, MILAM_PROFILE];
const CURATED_BY_KEY = new Map(CURATED.map((p) => [p.key, p]));

export function listCuratedProfiles(): CountyProfile[] {
  return [...CURATED];
}

// ── Vendor-default derivation ─────────────────────────────────────────────

const CLERK_VENDOR_LABEL: Record<ClerkSystem, string> = {
  kofile: 'kofile', edoctec: 'edoctec', uslandrecords: 'uslandrecords', aumentum: 'aumentum',
  idocmarket: 'idocmarket', countyfusion: 'countyfusion', tyler: 'tyler_eagle', henschen: 'henschen',
  idocket: 'idocket', fidlar: 'fidlar', texasfile: 'texasfile',
};

/** The clerk portal each vendor's own table names for the county — the URL the adapter will open. */
function clerkUrlFor(system: ClerkSystem, county: string): string | null {
  switch (system) {
    case 'kofile': return getKofileBaseUrl(county);
    case 'tyler': return tylerEagleUrl(county);
    case 'uslandrecords': return uslrUrl(county);
    case 'aumentum': return aumentumBaseUrl(county);
    case 'edoctec': return edoctecBaseUrl(county);
    case 'texasfile': return countyRecordsUrl(county);
    default: return null;
  }
}

/**
 * What the registries know about a county nobody has curated. Every line is a fact from a table
 * the generic pipeline already reads, restated — nothing here is a promise the run does not keep.
 */
function deriveProfile(record: CountyRecord): CountyProfile {
  const sites: ProfileSite[] = [];
  const bis = lookupByCounty(BIS_CONFIGS, record.name) as { baseUrl: string; name: string; gisBaseUrl?: string; gisParcelLayerUrls?: string[] } | undefined;
  const cad = cadForCounty(record.name);
  if (bis) {
    sites.push({ role: 'appraisal', vendor: 'bis', url: bis.baseUrl, egress: 'direct', notes: `${bis.name} — BIS eSearch (registry entry; vendor shapes, not driven for this county)` });
    if (bis.gisBaseUrl) sites.push({ role: 'parcel_map', vendor: bis.gisBaseUrl.includes('bisclient') ? 'bis_gis' : 'arcgis', url: bis.gisBaseUrl, egress: 'direct' });
    if (bis.gisParcelLayerUrls?.[0]) sites.push({ role: 'parcel_data', vendor: 'arcgis', url: bis.gisParcelLayerUrls[0], egress: 'direct' });
  } else if (cad?.website) {
    sites.push({ role: 'appraisal', vendor: 'unknown', url: `https://${cad.website.replace(/^https?:\/\//, '')}`, notes: `${cad.district} — from the Comptroller directory; vendor not identified` });
  }

  const clerkSystem = getClerkSystem(record.fips);
  const clerkUrl = clerkUrlFor(clerkSystem, record.name);
  sites.push({
    role: 'clerk',
    vendor: CLERK_VENDOR_LABEL[clerkSystem],
    url: clerkUrl,
    egress: 'direct',
    notes: clerkSystem === 'texasfile' ? 'No county portal is routed; the statewide aggregator (paid) is the clerk source.' : undefined,
  });

  const plats = platSourceStatus(record.name);
  if (plats.available) sites.push({ role: 'plats', vendor: 'county_portal', url: null, egress: plats.egress ?? undefined, notes: plats.via });

  const vendorKnown = Boolean(bis) || clerkSystem !== 'texasfile';
  const tier: CountyTier = vendorKnown ? 'vendor-default' : 'fallback';
  const capabilities: CountyCapabilities = {
    freePlatRepository: plats.available,
    gisParcelLayer: Boolean(bis?.gisParcelLayerUrls?.length),
    surveyLayer: false,
    historicIndex: false,
    clerkFreePreview: hasFreeImagePreview(record.fips),
    clerkBridge: clerkSystem === 'kofile' ? 'instrument' : clerkSystem === 'texasfile' ? 'name_only' : 'instrument',
  };
  const recipe = tier === 'vendor-default'
    ? [
        `Identify the parcel at the appraisal district${bis ? ` (BIS eSearch, ${bis.baseUrl})` : ' (vendor unknown — an AI-guided search)'}${capabilities.gisParcelLayer ? ' and the parcel layer' : ''}.`,
        `Search the clerk (${CLERK_VENDOR_LABEL[clerkSystem]}) by owner, then by instrument; ${capabilities.clerkFreePreview ? 'page images are previewed free' : 'documents are bought through the paid pass'}.`,
        capabilities.freePlatRepository ? 'Plats from the county repository first, then the clerk, then TexasFile.' : 'Plats from the clerk and TexasFile; no free repository is known.',
        'FEMA flood zone, TxDOT right-of-way and Google imagery are statewide and run everywhere.',
      ]
    : [
        'No county portal is known for the appraisal district or the clerk.',
        'The statewide aggregator (TexasFile, paid) is searched by owner name; documents are bought through the paid pass.',
        'FEMA flood zone, TxDOT right-of-way and Google imagery still run.',
      ];
  return {
    name: record.name,
    key: record.key,
    fips: record.fips,
    tier,
    towns: [],
    sites,
    capabilities,
    recipe,
    golden: [],
    statement: tier === 'vendor-default'
      ? `${record.name} is not curated. Its vendors are known (${[bis ? 'BIS appraisal' : null, clerkSystem !== 'texasfile' ? `${CLERK_VENDOR_LABEL[clerkSystem]} clerk` : null].filter(Boolean).join(', ')}), so a run uses the vendor shapes; nobody has driven its sites or proven a parcel.`
      : `${record.name} has no known county portal; a run falls back to the statewide aggregator.`,
  };
}

// ── Resolution ────────────────────────────────────────────────────────────

/**
 * The profile for a county, by name, key or FIPS. Never throws: an unknown string resolves to a
 * fallback profile that says so, because "we could not resolve the county" and "the county has no
 * portals" must not render the same.
 */
export function resolveCountyProfile(county: string): CountyProfile {
  const record = resolveCounty(county);
  if (!record) {
    return {
      name: county, key: county.toLowerCase().trim(), fips: '', tier: 'fallback', towns: [], sites: [],
      capabilities: { freePlatRepository: false, gisParcelLayer: false, surveyLayer: false, historicIndex: false, clerkFreePreview: false, clerkBridge: 'none' },
      recipe: ['This is not a Texas county the platform recognises; nothing can be researched.'],
      golden: [],
      statement: `"${county}" is not a recognised Texas county.`,
    };
  }
  return CURATED_BY_KEY.get(record.key) ?? deriveProfile(record);
}

/** Every Texas county, curated ones first. */
export function listCountyProfiles(): CountyProfile[] {
  const all = TEXAS_COUNTIES.map((r) => CURATED_BY_KEY.get(r.key) ?? deriveProfile(r));
  const rank: Record<CountyTier, number> = { curated: 0, 'vendor-default': 1, fallback: 2 };
  return all.sort((a, b) => rank[a.tier] - rank[b.tier] || a.name.localeCompare(b.name));
}

/** The profile as the app receives it: no loader, an explicit `curated` flag. */
export function toProfileView(p: CountyProfile): CountyProfileView {
  const { module: _module, ...rest } = p;
  return { ...rest, curated: p.tier === 'curated' };
}

/** Counts per tier — the one line the Coverage page leads with. */
export function tierCounts(profiles: CountyProfile[] = listCountyProfiles()): Record<CountyTier, number> {
  const counts: Record<CountyTier, number> = { curated: 0, 'vendor-default': 0, fallback: 0 };
  for (const p of profiles) counts[p.tier]++;
  return counts;
}
