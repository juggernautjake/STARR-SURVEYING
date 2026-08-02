// worker/src/adapters/kofile-discovery.ts — ask the county what it has (plan R38).
//
// ── WHY DISCOVERY RATHER THAN A TABLE OF CODES ──────────────────────────────────────────────────
//
// Kofile's search needs a `department` code, and the code is per county. Hardcoding one produced
// three separate wrong answers in a day:
//
//   Milam       RP = "Property Records"     — works
//   Travis      RP = "Land Records"         — same code, different name
//   Williamson  only CCM = "Commissioners Court" exists. There is NO real-property department on
//               this portal at all, so every deed search returns nothing and the adapter looks
//               broken when the truth is that Williamson's land records live somewhere else.
//
// Guessing from a candidate list (RP, OPR, DEED, LAND, RE…) found nothing on the counties that
// needed it, because the list is not the point — the county publishes its own.
//
// ── WHERE IT IS PUBLISHED ───────────────────────────────────────────────────────────────────────
//
// The SPA hangs its whole configuration on `window.__data`:
//
//   __data.configuration.departments      [{ code, name, … }]
//   __data.search.departmentDateRanges    { CODE: { recordedDateRange, certifiedDate } }
//   __data.workspaces.tabs.search.selectedDepartment
//
// Reading that is how one adapter serves every Kofile county without a table of codes to maintain —
// and how a county that adds or renames a department is picked up on the next run rather than after
// somebody notices a run returning nothing.

export interface KofileDepartment {
  code: string;
  name: string;
}

export interface KofileDateRange {
  /** `YYYYMMDD,YYYYMMDD` as the site itself expresses it. */
  recordedDateRange?: string;
  /** How current the index is. Worth surfacing: a chain that stops in 2024 because the county's
   *  index stops there is not a gap in our work (R14). */
  certifiedDate?: string;
}

export interface KofileSiteConfig {
  departments: KofileDepartment[];
  dateRanges: Record<string, KofileDateRange>;
  /** What the site itself pre-selects. Not always the right one for deeds — Williamson selects CCM. */
  selectedDepartment: string | null;
}

/** Evaluated inside the page. Kept as a string so a caller can pass it to `page.evaluate` without
 *  this module importing Playwright. */
export const READ_SITE_CONFIG = `() => {
  const d = window.__data;
  if (!d) return null;
  return {
    departments: (d.configuration && d.configuration.departments || []).map(function (x) {
      return { code: x.code, name: x.name };
    }),
    dateRanges: (d.search && d.search.departmentDateRanges) || {},
    selectedDepartment: (d.workspaces && d.workspaces.tabs && d.workspaces.tabs.search
      && d.workspaces.tabs.search.selectedDepartment) || null,
  };
}`;

/** Names that mean "the recorded land records" across the deployments seen so far.
 *
 *  Matched on NAME as well as code because the code is not reliably `RP` — and checked in order, so
 *  an exact real-property name beats a generic "records". */
const REAL_PROPERTY_NAME = [
  /^real property$/i,
  /^(land|property) records$/i,
  /^official public records$/i,
  /\b(deed|land|real property)\b/i,
];

/** Departments that are definitely NOT land records, however they are named. Listed so a county
 *  whose only department is one of these is reported as HAVING NO LAND RECORDS rather than being
 *  searched anyway and reported as empty. */
const NOT_LAND_RECORDS = /commissioners court|assumed name|marriage|marks and brands|probate|foreclosure|birth|death|military|court minutes/i;

export interface DepartmentChoice {
  department: string | null;
  dateRange: string | null;
  certifiedThrough: string | null;
  /** Plain sentence for the run log and for the adapter registry. */
  reason: string;
  /** True when the portal genuinely has no land-records department — a fact about the county, not a
   *  failure of ours, and the two must not look alike. */
  noLandRecords: boolean;
}

/** Pick the department a deed search should use. */
export function chooseDepartment(config: KofileSiteConfig | null, county: string): DepartmentChoice {
  if (!config || config.departments.length === 0) {
    return {
      department: null, dateRange: null, certifiedThrough: null, noLandRecords: false,
      reason:
        `Could not read ${county}'s site configuration, so no department could be chosen. This is a ` +
        'retrieval failure, not evidence that the county has no records.',
    };
  }

  const candidates = config.departments.filter((d) => !NOT_LAND_RECORDS.test(d.name));

  if (candidates.length === 0) {
    const only = config.departments.map((d) => `${d.code} ("${d.name}")`).join(', ');
    return {
      department: null, dateRange: null, certifiedThrough: null, noLandRecords: true,
      // The Williamson case. Searching anyway returns nothing, which reads as "this property has no
      // deeds" — the single most misleading answer this platform can give.
      reason:
        `${county}'s portal exposes no land-records department — only ${only}. Its deeds are not on ` +
        'this site, so a search here would return nothing and mean nothing. Find the county\'s ' +
        'separate real-property search.',
    };
  }

  let chosen = candidates[0]!;
  outer: for (const re of REAL_PROPERTY_NAME) {
    for (const c of candidates) {
      if (re.test(c.name)) { chosen = c; break outer; }
    }
  }

  const range = config.dateRanges[chosen.code];
  return {
    department: chosen.code,
    // Null rather than a made-up span: the site rejects a range outside its own, and inventing one
    // is what made Travis look broken.
    dateRange: range?.recordedDateRange ?? null,
    certifiedThrough: range?.certifiedDate ?? null,
    noLandRecords: false,
    reason:
      `Using ${chosen.code} ("${chosen.name}") for ${county}` +
      (range?.recordedDateRange ? `, indexed ${range.recordedDateRange.replace(',', ' to ')}` : ', with no date range published by the site') +
      (range?.certifiedDate ? `, certified through ${range.certifiedDate}.` : '.'),
  };
}

/** What to store on the adapter row so the next run does not have to rediscover it — and so a human
 *  reading the registry can see what the county actually offers. */
export function toAdapterConfig(config: KofileSiteConfig | null, choice: DepartmentChoice): Record<string, unknown> {
  return {
    department: choice.department,
    department_date_range: choice.dateRange,
    certified_through: choice.certifiedThrough,
    // Every department, not just the chosen one: a reviewer asking "why is there no plat here"
    // should be able to see whether the county exposes a plats department at all.
    departments_available: (config?.departments ?? []).map((d) => `${d.code}=${d.name}`),
    no_land_records: choice.noLandRecords,
    discovered_at: new Date().toISOString().slice(0, 10),
    discovery_note: choice.reason,
  };
}
