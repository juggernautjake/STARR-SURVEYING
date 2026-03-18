/**
 * Bell County Field Name Mappings
 *
 * Bell CAD's ArcGIS FeatureServer uses all-lowercase field names
 * that differ from the generic aliases used by other counties.
 * This file is the single source of truth for Bell County field names.
 */

/** Maps semantic property fields to Bell CAD ArcGIS attribute names */
export const GIS_FIELD_MAP = {
  propertyId:       ['prop_id_text', 'prop_id'],
  ownerName:        ['file_as_name'],
  legalDescription: ['legal_desc', 'legal_desc2'],
  acreage:          ['legal_acreage'],
  situsNumber:      ['situs_num'],
  situsStreetPrefx: ['situs_street_prefx'],
  situsStreet:      ['situs_street'],
  situsStreetSufx:  ['situs_street_sufix'],
  situsCity:        ['situs_city'],
  situsState:       ['situs_state'],
  situsZip:         ['situs_zip'],
  abstractSubdiv:   ['abs_subdv_cd'],
  neighborhoodCode: ['hood_cd'],
  schoolDistrict:   ['school'],
  city:             ['city'],
  county:           ['county'],
  mapId:            ['map_id'],
  geoId:            ['geo_id'],
  // Deed fields
  instrumentNumber: ['Number'],
  volume:           ['Volume'],
  page:             ['Page'],
  deedDate:         ['Deed_Date'],
  // Tax fields
  taxYear:          ['owner_tax_yr'],
  nextAppraisalDt:  ['next_appraisal_dt'],
} as const;

/** Compose a situs address from Bell CAD component fields */
export function composeSitusAddress(attrs: Record<string, unknown>): string | null {
  const get = (keys: readonly string[]): string => {
    for (const k of keys) {
      const v = attrs[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
    return '';
  };

  const parts = [
    get(GIS_FIELD_MAP.situsNumber),
    get(GIS_FIELD_MAP.situsStreetPrefx),
    get(GIS_FIELD_MAP.situsStreet),
    get(GIS_FIELD_MAP.situsStreetSufx),
  ].filter(Boolean);

  const streetLine = parts.join(' ');
  if (!streetLine) return null;

  const cityStateZip = [
    get(GIS_FIELD_MAP.situsCity),
    get(GIS_FIELD_MAP.situsState),
    get(GIS_FIELD_MAP.situsZip),
  ].filter(Boolean);

  return cityStateZip.length > 0
    ? `${streetLine}, ${cityStateZip.join(' ')}`
    : streetLine;
}

/** Extract a string value from attributes using a field map entry */
export function getField(attrs: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== 'null') {
      return String(v).trim();
    }
  }
  return null;
}

/** Extract a numeric value from attributes using a field map entry */
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

/** Bell CAD eSearch keyword format helpers */
export const ESEARCH_FORMATS = {
  /** Build a keyword search string for Bell CAD eSearch */
  buildKeywords(streetNumber: string | null, streetName: string, includePropertyType = true): string {
    const namePart = streetName.includes(' ')
      ? `StreetName:"${streetName}"`
      : `StreetName:${streetName}`;
    const typePart = includePropertyType ? ' PropertyType:Real' : '';
    if (streetNumber) {
      return `StreetNumber:${streetNumber} ${namePart}${typePart}`;
    }
    return `${namePart}${typePart}`;
  },

  /** Build an owner name search string */
  buildOwnerSearch(ownerName: string): string {
    return `OwnerName:"${ownerName}"`;
  },

  /** Build a property ID search string */
  buildPropertyIdSearch(propId: string): string {
    return `PropertyId:${propId}`;
  },
} as const;

/** Document type relevance scores (for sorting clerk results) */
export const DOCUMENT_TYPE_SCORES: Record<string, number> = {
  'WARRANTY DEED':           100,
  'GENERAL WARRANTY DEED':   100,
  'SPECIAL WARRANTY DEED':    95,
  'DEED':                     90,
  'DEED OF TRUST':            85,
  'EASEMENT':                 85,
  'RIGHT OF WAY':             80,
  'PLAT':                     50,
  'RESTRICTIVE COVENANT':     45,
  'RELEASE OF LIEN':          40,
  'AFFIDAVIT':                30,
  'LIS PENDENS':              25,
  'ABSTRACT OF JUDGMENT':     20,
  'POWER OF ATTORNEY':        15,
  'MECHANIC\'S LIEN':         15,
};
