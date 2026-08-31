// lib/research/arcgis-fields.ts — reading a parcel layer whose field names you do not control.
//
// ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────────────────────────
//
// Three services queried Bell CAD with a hard-coded, upper-case field list:
//
//     outFields=PROP_ID,FILE_AS_NAME,SITUS_ADDR,TRACT_OR_LOT,BLOCK,LEGAL_ACREAGE
//
// Measured against the live layer on 2026-08-30, with a control:
//
//     that list                                        → HTTP 400  "'outFields' parameter is invalid"
//     prop_id,file_as_name,situs_street,legal_acreage   → HTTP 200
//
// The layer's fields are lower-case, and **there is no `SITUS_ADDR` at all** — the situs address is
// three separate columns (`situs_num`, `situs_street`, `situs_street_sufix`). So every one of those
// queries failed, and all three callers swallow it with `if (!res.ok) return []`. Nearby-parcel
// context came back empty on every Bell County run, silently, for as long as that code has existed.
// Nothing errored, so nothing reported it.
//
// ── WHY `outFields=*` AND NOT A CORRECTED LIST ──────────────────────────────────────────────────
//
// Correcting the names to lower case would fix Bell today and break the moment a layer is
// republished with different casing, a fallback layer with a different schema is used (there is
// already one — a national Esri parcel layer), or a county's vendor renames a column. **ArcGIS
// rejects the WHOLE query when one named field is absent**, so an explicit list turns a missing
// column into zero parcels rather than one missing value. `*` cannot fail that way.
//
// The cost is bytes, not correctness, and these queries are bounded by a small spatial envelope.
//
// ── AND THEN READ DEFENSIVELY ───────────────────────────────────────────────────────────────────
//
// `boundary-fetch.service.ts` already had the right instinct — a *candidate list* of field names
// per layer — and the other three never copied it. This module is that instinct made shared, so the
// next caller inherits it instead of hard-coding whichever casing it saw first.

/** One parcel, in the shape the research services actually use. */
export interface ParcelAttributes {
  prop_id: number;
  owner: string | null;
  address: string | null;
  lot: string | null;
  block: string | null;
  acreage: number | null;
}

type Attrs = Record<string, unknown> | undefined | null;

/**
 * First candidate that is present and meaningful.
 *
 * Case-insensitive, because the whole point is not knowing how the layer spells things. Empty
 * strings and whitespace count as absent: a blank `situs_street` is not an address, and returning
 * `""` would render as a parcel with a name of nothing rather than a parcel with no name.
 */
export function pickField(attrs: Attrs, candidates: string[]): unknown {
  if (!attrs) return undefined;
  const lowered = new Map<string, unknown>();
  for (const [k, v] of Object.entries(attrs)) lowered.set(k.toLowerCase(), v);

  for (const name of candidates) {
    const v = lowered.get(name.toLowerCase());
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * The situs address, however this layer happens to store it.
 *
 * Bell CAD splits it across three columns. Other layers use a single one under any of several
 * names. Composing from the parts is tried FIRST because when both exist the parts are the ones
 * that are populated — the single-column form is the exception, not the norm.
 */
export function composeSitusAddress(attrs: Attrs): string | null {
  const num = str(pickField(attrs, ['situs_num', 'situs_number', 'SITUS_NUM']));
  const street = str(pickField(attrs, ['situs_street', 'SITUS_STREET']));
  const prefix = str(pickField(attrs, ['situs_street_prefx', 'situs_street_prefix']));
  const suffix = str(pickField(attrs, ['situs_street_sufix', 'situs_street_suffix']));

  const composed = [num, prefix, street, suffix].filter(Boolean).join(' ').trim();
  if (composed) return composed;

  // Single-column fallbacks, including the name that started all this. Kept because a different
  // layer may genuinely have it — it is Bell's schema that does not.
  return str(pickField(attrs, ['SITUS_ADDRESS', 'SITUS_ADDR', 'situs_address', 'address', 'PROP_ADDR', 'SITE_ADDR']));
}

/** Normalise one ArcGIS feature's attributes into the shape the services consume. */
export function readParcelAttributes(attrs: Attrs): ParcelAttributes {
  const acreageRaw = pickField(attrs, ['legal_acreage', 'LEGAL_ACREAGE', 'acreage', 'gis_acres']);
  const acreage = acreageRaw === undefined ? null : Number(acreageRaw);

  return {
    prop_id: Number(pickField(attrs, ['prop_id', 'PROP_ID', 'prop_id_text']) ?? 0),
    owner: str(pickField(attrs, ['file_as_name', 'FILE_AS_NAME', 'owner_name', 'OWNER'])),
    address: composeSitusAddress(attrs),
    lot: str(pickField(attrs, ['tract_or_lot', 'TRACT_OR_LOT', 'lot'])),
    block: str(pickField(attrs, ['block', 'BLOCK'])),
    acreage: Number.isFinite(acreage) ? acreage : null,
  };
}

/**
 * The `outFields` value every parcel query should send.
 *
 * A constant rather than a literal at four call sites, so there is one place to change and one
 * place for the reasoning above to live.
 */
export const PARCEL_OUT_FIELDS = '*';
