/**
 * Milam County Field Name Mappings
 *
 * The Milam parcel layer (`MilamCADPublic/MapServer/0`) is a JOIN of two tables, and ArcGIS
 * publishes joined fields with their table prefix: `DBO.TaxParcels.*` for the polygon and
 * `DBO.Accounts.*` for the appraisal account. Read from the live `/layers?f=json` on 2026-09-09.
 *
 * Bell's layer uses bare lower-case names (`prop_id_text`, `file_as_name`); nothing in the Bell
 * map matches here, which is why this file exists rather than an alias list.
 */

/** Maps semantic property fields to Milam parcel-layer attribute names (first match wins). */
export const MILAM_GIS_FIELD_MAP = {
  /** The appraisal district property id — the number eSearch and the viewer's `?find=` take. */
  propertyId:       ['DBO.TaxParcels.Name'],
  /** The account / geographic id, e.g. "S09200-001-01-00" or "A043-148-017-00". */
  geoId:            ['DBO.Accounts.Account'],
  objectId:         ['DBO.TaxParcels.OBJECTID'],
  ownerName:        ['DBO.Accounts.Owner_Name'],
  careOf:           ['DBO.Accounts.Careof'],
  legal1:           ['DBO.Accounts.Legal1'],
  legal2:           ['DBO.Accounts.Legal2'],
  legal3:           ['DBO.Accounts.Legal3'],
  legal4:           ['DBO.Accounts.Legal4'],
  acreage:          ['DBO.Accounts.Acres'],
  situsNumber:      ['DBO.Accounts.Prop_Street_Number'],
  situsStreetPrefx: ['DBO.Accounts.Prop_Street_Dir'],
  situsStreet:      ['DBO.Accounts.Prop_Street'],
  situsStreetSufx:  ['DBO.Accounts.Prop_Street_Suffix'],
  situsCity:        ['DBO.Accounts.Prop_City'],
  situsState:       ['DBO.Accounts.Prop_State'],
  situsZip:         ['DBO.Accounts.Prop_Zip5'],
  /** "S09200" for a subdivision, "A0430" for an abstract — the prefix of the legal description. */
  abstractSubdiv:   ['DBO.Accounts.Abstract_Subdiv'],
  abstractNumber:   ['DBO.Accounts.Abstract_Number'],
  block:            ['DBO.Accounts.Block'],
  tractLot:         ['DBO.Accounts.Tract_Lot'],
  categoryCode:     ['DBO.Accounts.Primary_Category_Code'],
  /** The neighbourhood/ISD code, e.g. "SCA.ISDCOM". */
  locationCode:     ['DBO.Accounts.Location_Code'],
  marketValue:      ['DBO.Accounts.Market_Value'],
  // Deed reference — Milam cites its deeds by VOLUME/PAGE; there is no instrument field.
  volume:           ['DBO.Accounts.Deed_Volume'],
  page:             ['DBO.Accounts.Deed_Page'],
  mailingStreet:    ['DBO.Accounts.Mailing_Address_Street'],
  mailingCity:      ['DBO.Accounts.Mailing_Address_City'],
  mailingState:     ['DBO.Accounts.Mailing_Address_State'],
  mailingZip:       ['DBO.Accounts.Mailing_Address_Zip5'],
} as const;

/** Layer 3 (original surveys) attribute names. */
export const MILAM_SURVEY_FIELD_MAP = {
  /** The original grantee, filed surname-first: "HERBST, F", "WATTS, A J". */
  abstractName:   ['AbstractName'],
  abstractNumber: ['AbstractNumber'],
  surveyName:     ['SurveyName'],
  blockNumber:    ['BlockNumber'],
  sectionNumber:  ['SectionNumber'],
  gloAcreage:     ['GLOAcerage'],
} as const;

/** Layer 5 (subdivisions) attribute names. */
export const MILAM_SUBDIVISION_FIELD_MAP = {
  name: ['SubdivisionName'],
  /** Matches the appraisal district's S-number prefix ("S09200"). */
  code: ['SubdivisionCode'],
} as const;

/** The fields a parcel query asks for — everything the run reads, nothing it does not. */
export const MILAM_PARCEL_OUT_FIELDS = [
  ...MILAM_GIS_FIELD_MAP.objectId, ...MILAM_GIS_FIELD_MAP.propertyId, ...MILAM_GIS_FIELD_MAP.geoId,
  ...MILAM_GIS_FIELD_MAP.ownerName, ...MILAM_GIS_FIELD_MAP.careOf,
  ...MILAM_GIS_FIELD_MAP.legal1, ...MILAM_GIS_FIELD_MAP.legal2, ...MILAM_GIS_FIELD_MAP.legal3, ...MILAM_GIS_FIELD_MAP.legal4,
  ...MILAM_GIS_FIELD_MAP.acreage,
  ...MILAM_GIS_FIELD_MAP.situsNumber, ...MILAM_GIS_FIELD_MAP.situsStreetPrefx, ...MILAM_GIS_FIELD_MAP.situsStreet,
  ...MILAM_GIS_FIELD_MAP.situsStreetSufx, ...MILAM_GIS_FIELD_MAP.situsCity, ...MILAM_GIS_FIELD_MAP.situsState, ...MILAM_GIS_FIELD_MAP.situsZip,
  ...MILAM_GIS_FIELD_MAP.abstractSubdiv, ...MILAM_GIS_FIELD_MAP.abstractNumber, ...MILAM_GIS_FIELD_MAP.block, ...MILAM_GIS_FIELD_MAP.tractLot,
  ...MILAM_GIS_FIELD_MAP.categoryCode, ...MILAM_GIS_FIELD_MAP.locationCode, ...MILAM_GIS_FIELD_MAP.marketValue,
  ...MILAM_GIS_FIELD_MAP.volume, ...MILAM_GIS_FIELD_MAP.page,
  ...MILAM_GIS_FIELD_MAP.mailingStreet, ...MILAM_GIS_FIELD_MAP.mailingCity, ...MILAM_GIS_FIELD_MAP.mailingState, ...MILAM_GIS_FIELD_MAP.mailingZip,
].join(',');

/** Extract a trimmed string from attributes using a field map entry. */
export function getField(attrs: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== 'null') {
      return String(v).trim();
    }
  }
  return null;
}

/** Extract a number from attributes using a field map entry. */
export function getNumericField(attrs: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/,/g, ''));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/**
 * Compose a situs address from Milam's component fields.
 *
 * The layer stores "309 TRAVIS N": number, street, THEN direction. The appraisal site and the
 * postal form put the direction before the street ("309 N TRAVIS"), and that is the form every
 * address matcher in this worker expects, so it is composed that way.
 */
export function composeSitusAddress(attrs: Record<string, unknown>): string | null {
  const num = getField(attrs, MILAM_GIS_FIELD_MAP.situsNumber);
  const dir = getField(attrs, MILAM_GIS_FIELD_MAP.situsStreetPrefx);
  const street = getField(attrs, MILAM_GIS_FIELD_MAP.situsStreet);
  const sufx = getField(attrs, MILAM_GIS_FIELD_MAP.situsStreetSufx);
  const streetLine = [num, dir, street, sufx].filter(Boolean).join(' ');
  if (!streetLine) return null;
  const city = getField(attrs, MILAM_GIS_FIELD_MAP.situsCity);
  const state = getField(attrs, MILAM_GIS_FIELD_MAP.situsState);
  const zip = getField(attrs, MILAM_GIS_FIELD_MAP.situsZip);
  const tail = [city, state, zip].filter(Boolean).join(' ');
  return tail ? `${streetLine}, ${tail}` : streetLine;
}

/** The four legal lines joined — Milam splits one description across Legal1..Legal4. */
export function composeLegalDescription(attrs: Record<string, unknown>): string | null {
  const parts = [
    getField(attrs, MILAM_GIS_FIELD_MAP.legal1),
    getField(attrs, MILAM_GIS_FIELD_MAP.legal2),
    getField(attrs, MILAM_GIS_FIELD_MAP.legal3),
    getField(attrs, MILAM_GIS_FIELD_MAP.legal4),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ').replace(/\s+/g, ' ').trim() : null;
}

/** The mailing address, one line. */
export function composeMailingAddress(attrs: Record<string, unknown>): string | null {
  const street = getField(attrs, MILAM_GIS_FIELD_MAP.mailingStreet);
  const city = getField(attrs, MILAM_GIS_FIELD_MAP.mailingCity);
  const state = getField(attrs, MILAM_GIS_FIELD_MAP.mailingState);
  const zip = getField(attrs, MILAM_GIS_FIELD_MAP.mailingZip);
  const tail = [city, state, zip].filter(Boolean).join(' ');
  if (!street && !tail) return null;
  return [street, tail].filter(Boolean).join(', ');
}

/**
 * The abstract number from Milam's legal description.
 *
 *   "A0430 DE PENA, J.A.,.465 ACRES"  → "430"   (the district writes A + four digits)
 *   "S09200 FREEMAN BLK 1 W PT OF"    → null    (a subdivision, not an abstract)
 */
export function abstractNumberFromLegal(legal: string | null | undefined): string | null {
  if (!legal) return null;
  const m = legal.toUpperCase().match(/\bA(\d{3,5})\b/);
  if (!m) return null;
  const n = String(parseInt(m[1], 10));
  return n === '0' ? null : n;
}

/** Milam's subdivision S-number ("S09200") from the legal description, or null for an abstract. */
export function subdivisionCodeFromLegal(legal: string | null | undefined): string | null {
  if (!legal) return null;
  const m = legal.toUpperCase().match(/\b(S\d{5})\b/);
  return m ? m[1] : null;
}

/** Document type relevance scores (for sorting clerk results) — the Bell table, with Milam's own
 *  vocabulary added: the clerk files "WARNTY DEED", "WARRANTY DEED V/LIEN", "ASSUMPTION W/D". */
export const DOCUMENT_TYPE_SCORES: Record<string, number> = {
  'WARRANTY DEED':           100,
  'WARNTY DEED':             100,
  'WARRANTY DEED V/LIEN':    100,
  'GENERAL WARRANTY DEED':   100,
  'SPECIAL WARRANTY DEED':    95,
  'ASSUMPTION W/D':           95,
  'ASSUMPTION DEED':          95,
  'DEED':                     90,
  'DEED OF TRUST':            85,
  'EASEMENT':                 85,
  'RIGHT OF WAY':             80,
  'RIGHT OF WAY DEED':        80,
  'PLAT':                     50,
  'SURVEY PLAT':              50,
  'RESTRICTIVE COVENANT':     45,
  'RELEASE OF LIEN':          40,
  'AFFIDAVIT':                30,
  'LIS PENDENS':              25,
  'ABSTRACT OF JUDGMENT':     20,
  'POWER OF ATTORNEY':        15,
  "MECHANIC'S LIEN":          15,
};
