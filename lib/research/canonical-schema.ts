// lib/research/canonical-schema.ts
//
// §7.5 of docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md
//
// The canonical target shape every vendor adapter maps INTO. Vendor
// payloads from Bell CAD (`BellCadParcel`), TrueAutomation
// (`BrowserScrapeResult`), eSearch, publicsearch, TxGLO etc. all
// have their own field names, types, and quirks; this file is the
// single ontology they translate to so downstream code
// (extraction, comparison, confidence, drawing reconciliation,
// relevance-scoping) only ever sees one shape.
//
// Foundation for:
//   - §7.2 data_vendors.field_map_template — each vendor's mapping
//     onto this schema is the reusable template that lets us add
//     a new county with the same vendor as a config row, not a code
//     change.
//   - §8.4 test-property confirm — extracted values rendered against
//     this schema so the user can see the mapped field names
//     consistently across vendors.
//   - §10.3 relevance-gated extraction — `relevance` + `parcel_ref`
//     are inherent fields on the canonical record so every datum
//     can be tagged subject / adjoiner / unrelated at the source.
//
// Acceptance for this slice (§7.5):
//   - The shape covers everything we already store today across the
//     existing four working adapters (Bell ArcGIS, TrueAutomation,
//     eSearch, publicsearch) — no data loss.
//   - Each field documents its provenance so future vendor field-maps
//     have a clear target.
//   - Pure types + a small set of helpers; zero runtime dependencies
//     so the schema file can be imported from server routes,
//     workers, and tests freely.

// ── 1. Provenance + relevance ────────────────────────────────────

/** Which vendor / source surface produced this datum. Free-form
 *  string keyed to `data_vendors.key` so we can render badges + run
 *  per-vendor reconciliation. */
export type CanonicalSource =
  | 'bell_cad_arcgis'
  | 'trueautomation_propaccess'
  | 'esearch_cad'
  | 'publicsearch_clerk'
  | 'tyler_publicsearch'
  | 'bis_arcgis'
  | 'kofile'
  | 'txglo'
  | 'fema'
  | 'generic_playwright'
  | 'manual_entry'
  | 'ai_extraction';

/** §10.3 — every datum carries one of these tags so the extractor
 *  never silently bleeds unrelated parcels into the subject's
 *  boundary. `subject` and `adjoiner` reach the project's working
 *  dataset; `unrelated` is dropped (or stored flagged for audit). */
export type RelevanceTag = 'subject' | 'adjoiner' | 'unrelated' | 'unknown';

/** Audit trail of one extracted value. Lets downstream code show
 *  "Bell CAD says X, TrueAutomation says Y" without losing either. */
export interface CanonicalAttribution {
  source: CanonicalSource;
  /** Free-form locator within the source: a URL, doc id, page #,
   *  selector — whatever the adapter can hand back. */
  source_ref?: string;
  /** When the value was captured (adapter run time, not when the
   *  record was created upstream). */
  captured_at?: string;
  /** Adapter confidence in 0–1 if available; A–F letter grade is
   *  derived downstream in `confidence.ts`. */
  confidence?: number;
}

/** A canonical value with full attribution. Most fields below are
 *  `CanonicalValue<T>` rather than bare `T` so we never throw away
 *  the chain of evidence. */
export interface CanonicalValue<T> {
  value: T;
  attribution: CanonicalAttribution;
  /** §10.3 — relevance to the current project's subject. Defaults
   *  to `unknown` from the raw adapter; the extractor sets it
   *  during relevance-scoped extraction. */
  relevance?: RelevanceTag;
  /** §10.3 — the parcel this datum belongs to (subject id or
   *  adjoiner id), for cross-checking against the relevance set. */
  parcel_ref?: string;
}

// ── 2. Primitive sub-shapes ──────────────────────────────────────

/** Names sometimes arrive as a single "file-as" string ("SMITH JOHN
 *  & MARY ETUX") and sometimes pre-split. Keep both so adapters
 *  don't have to guess. */
export interface CanonicalOwner {
  /** The display string as the vendor stored it. Always set. */
  display_name: string;
  /** Best-effort split into structured names, when the adapter can
   *  produce it cleanly. */
  first_name?: string;
  last_name?: string;
  /** "ET UX", "ET VIR", "& WIFE", "& HUSBAND" markers — useful for
   *  legal description analysis and adjoiner-deed matching. */
  spouse_marker?: string;
  /** Owner ownership share if a vendor splits multi-owner parcels
   *  (Texas community-property + common-law tenancy patterns). */
  ownership_pct?: number;
}

/** US street address. Components when the adapter has them, plus
 *  the formatted line we'd print on a deliverable. */
export interface CanonicalAddress {
  formatted: string;
  street_number?: string;
  street_name?: string;
  unit?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  county?: string;
  /** Plus-4 zip when present in the CAD record. */
  postal_code_plus4?: string;
}

/** Legal description — text + structured Texas-specific components
 *  when we can extract them. */
export interface CanonicalLegal {
  /** The vendor-stored legal description string. Always set. */
  text: string;
  /** Subdivision / addition name when present. */
  subdivision?: string;
  /** Lot / block / section / tract identifiers. Strings (not
   *  numbers) because Texas plats use "Lot 4A", "Block C-2", etc. */
  lot?: string;
  block?: string;
  section?: string;
  tract?: string;
  /** A & B numbers for Texas original surveys (abstracts). */
  abstract_number?: string;
  survey_name?: string;
  /** Acreage from the legal text (may differ from CAD-measured
   *  `acreage` below — both are kept so reconciliation can flag
   *  disagreement). */
  legal_acreage?: number;
  /** Vara-based historic descriptions kept verbatim. */
  contains_varas?: boolean;
}

/** Deed / instrument citation. Texas CAD records cite the most
 *  recent transfer; clerks' offices index every transfer in the
 *  chain. */
export interface CanonicalDeedReference {
  /** The full citation string ("Vol. 1234 Pg. 567" or
   *  "Doc. 2024-12345"). */
  citation: string;
  volume?: string;
  page?: string;
  instrument_number?: string;
  /** When the instrument was recorded (not necessarily executed). */
  recorded_at?: string;
  /** "Warranty Deed", "Special Warranty Deed", "Trustee's Deed",
   *  "Affidavit of Heirship", etc. — drives the chain of title
   *  classification. */
  instrument_type?: string;
}

/** Plat reference for subdivision lots. */
export interface CanonicalPlatReference {
  citation: string;
  cabinet?: string;
  slide?: string;
  volume?: string;
  page?: string;
  recorded_at?: string;
}

/** Parcel polygon. GeoJSON Polygon or MultiPolygon, always WGS84.
 *  Source rings frequently arrive in vendor-native projections
 *  (Texas State Plane, NAD83); adapters MUST reproject to WGS84
 *  before producing a canonical record. */
export interface CanonicalParcelGeometry {
  /** Standard GeoJSON; `type` is `'Polygon'` or `'MultiPolygon'`. */
  geojson: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  /** The original spatial reference the vendor returned. Surfaced so
   *  we can reproject again if the canonical projection ever
   *  changes, without re-hitting the vendor. */
  source_srid?: number;
}

/** Appraised / market / land / improvement values from a CAD. All
 *  in USD; none are guaranteed to be present. */
export interface CanonicalValuation {
  market_value?: number;
  land_value?: number;
  improvement_value?: number;
  appraised_value?: number;
  /** Tax year the valuation applies to. */
  tax_year?: number;
}

// ── 3. The canonical record ──────────────────────────────────────

/** A single parcel as the rest of the system sees it. Every field
 *  is optional except `parcel_id` and `attribution` — adapters that
 *  can't supply one of those cannot produce a canonical record.
 *
 *  Use `CanonicalValue<T>` on individual fields when the value
 *  needs its own attribution distinct from the record's primary
 *  source (e.g. owner from clerk records, geometry from CAD
 *  ArcGIS — they came from different surfaces). For records
 *  produced by a single adapter run the top-level `attribution`
 *  applies to every field and per-field attribution can be
 *  omitted. */
export interface CanonicalProperty {
  /** Vendor-stable parcel identifier (`prop_id` / `quickref` /
   *  whatever the source calls it). Stringified for portability
   *  even if the source returned a number. */
  parcel_id: string;

  /** Top-level attribution for the record as a whole. */
  attribution: CanonicalAttribution;

  /** §10.3 — relevance tag for the parcel as a whole. */
  relevance?: RelevanceTag;

  owner?: CanonicalOwner | CanonicalValue<CanonicalOwner>;

  /** Where the tax bill goes. */
  mailing_address?: CanonicalAddress | CanonicalValue<CanonicalAddress>;
  /** Where the property sits. Often blank for vacant land. */
  situs_address?: CanonicalAddress | CanonicalValue<CanonicalAddress>;

  legal?: CanonicalLegal | CanonicalValue<CanonicalLegal>;

  /** Acreage as the CAD measured it. May disagree with
   *  `legal.legal_acreage` — both are kept. */
  acreage?: number | CanonicalValue<number>;

  geometry?: CanonicalParcelGeometry | CanonicalValue<CanonicalParcelGeometry>;

  /** Most-recent deed first; index 0 = the current owner's source
   *  of title. */
  deed_references?: CanonicalDeedReference[];
  plat_reference?: CanonicalPlatReference;

  valuation?: CanonicalValuation | CanonicalValue<CanonicalValuation>;

  /** Resolved adjoiner parcel ids if known (§10.2). */
  adjoiner_parcel_ids?: string[];

  /** County FIPS code (5-digit) the parcel sits in. Joins to
   *  `counties.fips` from §7.1. */
  county_fips?: string;

  /** Free-form additional fields a vendor returned that don't fit
   *  the canonical shape. Kept so we never silently drop data; the
   *  next schema version can promote a common extra into a typed
   *  field. */
  extras?: Record<string, unknown>;
}

// ── 4. Vendor field maps (foundation for §7.2 templates) ─────────

/** A single mapping rule: take `from_path` out of the vendor payload
 *  and put it at `to_path` on the canonical record, optionally
 *  passing through a named transform. Keep paths as
 *  dot-separated strings (`'attributes.file_as_name'`) so a vendor's
 *  template is JSON-serializable + storable in a Postgres jsonb
 *  column (`data_vendors.field_map_template`). */
export interface CanonicalFieldMapping {
  /** Path into the vendor's raw payload. */
  from_path: string;
  /** Path into the canonical record. Must be a leaf or a typed
   *  sub-object path the canonical schema knows. */
  to_path: keyof CanonicalProperty | string;
  /** Named transform applied in `applyFieldMap`. */
  transform?:
    | 'string'
    | 'number'
    | 'int'
    | 'boolean'
    | 'iso_date'
    | 'upper'
    | 'lower'
    | 'trim'
    | 'split_full_name'
    | 'usd_cents_to_dollars'
    | 'arcgis_rings_to_geojson_polygon';
  /** When the vendor value is missing / null, fall back to this
   *  literal. Useful for county-level constants (county_fips on
   *  every Bell-CAD record is `48027`). */
  fallback?: unknown;
}

/** The full vendor → canonical mapping for one adapter. Stored as
 *  `data_vendors.field_map_template` jsonb in §7.2. */
export interface CanonicalFieldMap {
  /** Which vendor this map targets — joins to `data_vendors.key`. */
  vendor_key: CanonicalSource;
  /** Free-form version string so we can roll-forward / roll-back
   *  vendor templates as portals change (§9 self-heal proposes new
   *  versions). */
  version: string;
  mappings: CanonicalFieldMapping[];
}

// ── 5. Relevance context (foundation for §10.1 / §10.2) ──────────

/** The set of identities that define "subject + adjoiners" for a
 *  research project. Passed into adapters during relevance-scoped
 *  extraction so the AI only ever extracts data tied to one of
 *  these. */
export interface RelevanceContext {
  subject: {
    /** Strongest anchor first; the extractor uses the first one
     *  that resolves. */
    parcel_id?: string;
    centroid_lonlat?: [number, number];
    legal_description?: string;
    owner?: string;
    address?: string;
  };
  /** Adjoiner identities resolved from §10.2 (GIS adjacency +
   *  deed-call adjoiners). */
  adjoiners: Array<{
    parcel_id?: string;
    owner?: string;
    legal_reference?: string;
    source: 'gis_adjacency' | 'deed_call' | 'manual';
  }>;
}

/** Result of classifying one extracted value against the relevance
 *  context. The extractor stamps this onto every datum before it
 *  reaches the project's working dataset; `unrelated` items are
 *  dropped (or stored flagged for audit, never mixed into the
 *  boundary). */
export interface RelevanceClassification {
  tag: RelevanceTag;
  /** Which subject / adjoiner identity matched (when tag !=
   *  unrelated / unknown). */
  matched_parcel_ref?: string;
  /** 0–1 — how confident the classifier is. Drives the threshold
   *  for whether to drop vs flag vs surface for user
   *  disambiguation (§10.6). */
  confidence: number;
  /** Human-readable reason the classifier picked this tag. */
  rationale?: string;
}

// ── 6. Small utility helpers ─────────────────────────────────────

/** Unwrap a field that's stored as either bare T or CanonicalValue<T>.
 *  Returns the inner T (or undefined when the field was unset). */
export function unwrap<T>(field: T | CanonicalValue<T> | undefined): T | undefined {
  if (field === undefined || field === null) return undefined;
  if (typeof field === 'object' && field !== null && 'value' in field && 'attribution' in field) {
    return (field as CanonicalValue<T>).value;
  }
  return field as T;
}

/** Type guard for the wrapped form. Adapters that need to inspect
 *  attribution can use this to narrow the field shape. */
export function hasAttribution<T>(field: T | CanonicalValue<T> | undefined): field is CanonicalValue<T> {
  return (
    !!field &&
    typeof field === 'object' &&
    'value' in (field as object) &&
    'attribution' in (field as object)
  );
}

/** Stamp a relevance classification onto a canonical record + every
 *  field that carries its own attribution. Pure: returns a new
 *  record, never mutates. */
export function tagRelevance(
  record: CanonicalProperty,
  classification: RelevanceClassification,
): CanonicalProperty {
  const next: CanonicalProperty = { ...record, relevance: classification.tag };
  const fields: (keyof CanonicalProperty)[] = [
    'owner',
    'mailing_address',
    'situs_address',
    'legal',
    'acreage',
    'geometry',
    'valuation',
  ];
  const asRecord = next as unknown as Record<string, unknown>;
  for (const k of fields) {
    const v = asRecord[k as string];
    if (hasAttribution(v as CanonicalValue<unknown>)) {
      asRecord[k as string] = {
        ...(v as CanonicalValue<unknown>),
        relevance: classification.tag,
        parcel_ref: classification.matched_parcel_ref,
      };
    }
  }
  return next;
}
