// lib/research/adapter-draft.ts
//
// §8.2 ↔ §8.5 bridge of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Given a vendor-detection result from slice 6 + the user's
// pasted URL + the chosen county/site_type, produce the draft
// adapter row the §8.1 wizard would save. The bridge is pure —
// no DB, no network — so the wizard's UI can render a preview
// ("here's what we'll save") before the user commits.
//
// The key value: the vendor template's `config_template` is a
// stencil with `{placeholders}` (subdomain, layer_id, etc.). We
// extract the right pieces out of the pasted URL and substitute
// them in, so a user pastes `https://bell.esearch.us/property/`
// and the saved adapter's config already knows the subdomain is
// `bell`. Zero code change to register a new county.

import type { CanonicalFieldMap } from './canonical-schema';

/** Subset of a `research_data_vendors` row the draft builder reads. */
export interface VendorTemplate {
  id?: string;                                 // FK target; optional in tests
  vendor_key: string;
  display_name: string;
  access_method: 'json_api' | 'html_scrape' | 'arcgis_rest' | 'browser_playwright';
  config_template: Record<string, unknown>;
  field_map_template: CanonicalFieldMap | Record<string, unknown>;
}

export interface DraftAdapterInput {
  /** The chosen vendor row (or null for a fully-bespoke adapter
   *  built via the §8.3 AI site probe). */
  vendor: VendorTemplate | null;
  /** Pasted portal URL. */
  base_url: string;
  /** FK target on research_counties. Passed through. */
  county_id: string;
  /** One of the `research_site_type_enum` values. */
  site_type:
    | 'appraisal_cad' | 'clerk_deeds' | 'plat_records' | 'gis_parcels'
    | 'legal_description' | 'flood_fema' | 'survey_glo' | 'misc';
  /** Optional overrides — user can edit the draft before save. */
  config_overrides?: Record<string, unknown>;
}

/** Shape of one row of `research_site_adapters` waiting to be
 *  INSERTed. Mirrors the column names from seeds/370. */
export interface DraftAdapter {
  vendor_id: string | null;
  county_id: string;
  site_type: DraftAdapterInput['site_type'];
  base_url: string;
  access_method: VendorTemplate['access_method'];
  config: Record<string, unknown>;
  field_map: CanonicalFieldMap | Record<string, unknown>;
  status: 'draft';
}

/** Extracted URL parts that the placeholder substitution can use. */
export interface UrlParts {
  scheme: string;
  host: string;
  /** Leftmost label (`bell` in `bell.publicsearch.us`). */
  subdomain: string | null;
  /** Everything except the subdomain (`publicsearch.us`). */
  parent_domain: string;
  pathname: string;
  /** First non-empty path segment (`clientdb` in
   *  `/clientdb/12345/property`). */
  first_path_segment: string | null;
  search_params: Record<string, string>;
}

/** Pure. Pull the placeholder-friendly pieces out of a URL. */
export function extractUrlParts(rawUrl: string): UrlParts | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl.trim())
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  const host = u.host.toLowerCase();
  const labels = host.split('.');
  const subdomain = labels.length >= 3 ? labels[0]! : null;
  const parent = subdomain ? labels.slice(1).join('.') : host;
  const pathLabels = u.pathname.split('/').filter(Boolean);
  const searchParams: Record<string, string> = {};
  for (const [k, v] of u.searchParams.entries()) searchParams[k] = v;
  return {
    scheme: u.protocol.replace(':', ''),
    host,
    subdomain,
    parent_domain: parent,
    pathname: u.pathname,
    first_path_segment: pathLabels[0] ?? null,
    search_params: searchParams,
  };
}

/** Pure. Produce the draft adapter row. If `vendor` is null the
 *  caller is registering a bespoke adapter (the §8.3 AI probe
 *  built the config from scratch) — we still stamp every column,
 *  just with empty templates. */
export function prefillAdapterFromTemplate(input: DraftAdapterInput): DraftAdapter {
  const { vendor, base_url, county_id, site_type, config_overrides } = input;
  const parts = extractUrlParts(base_url);

  if (!vendor) {
    return {
      vendor_id: null,
      county_id,
      site_type,
      base_url,
      access_method: 'browser_playwright',
      config: { ...(config_overrides ?? {}) },
      field_map: {},
      status: 'draft',
    };
  }

  // 1. Start from the vendor's stencil config.
  // 2. Resolve {placeholder} tokens using the URL parts.
  // 3. Layer in any user-provided overrides on top.
  const resolved = substitutePlaceholders(vendor.config_template, parts);
  const config = mergeOverrides(resolved, config_overrides ?? {});

  return {
    vendor_id: vendor.id ?? null,
    county_id,
    site_type,
    base_url,
    access_method: vendor.access_method,
    config,
    field_map: vendor.field_map_template,
    status: 'draft',
  };
}

// ── Internals ────────────────────────────────────────────────────

/** Substitute `{name}` placeholders inside every string-valued leaf
 *  of an object tree using values pulled from the URL parts. Known
 *  placeholders:
 *    {scheme} {host} {subdomain} {parent_domain} {pathname}
 *    {first_path_segment} {base_url} {?param}     // query-string lookup
 *  Unknown placeholders are left intact (the user can fill them in
 *  on the §8.4 confirm step). */
function substitutePlaceholders(
  template: unknown,
  parts: UrlParts | null,
): Record<string, unknown> {
  return walk(template) as Record<string, unknown>;

  function walk(node: unknown): unknown {
    if (typeof node === 'string') return resolveString(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  }

  function resolveString(s: string): string {
    return s.replace(/\{([^}]+)\}/g, (_match, key: string) => {
      if (!parts) return `{${key}}`;
      if (key === 'scheme') return parts.scheme;
      if (key === 'host') return parts.host;
      if (key === 'subdomain') return parts.subdomain ?? `{${key}}`;
      if (key === 'parent_domain') return parts.parent_domain;
      if (key === 'pathname') return parts.pathname;
      if (key === 'first_path_segment') return parts.first_path_segment ?? `{${key}}`;
      if (key === 'base_url') return `${parts.scheme}://${parts.host}${parts.pathname}`;
      if (key.startsWith('?')) {
        const param = key.slice(1);
        return parts.search_params[param] ?? `{${key}}`;
      }
      return `{${key}}`;
    });
  }
}

/** Shallow merge of overrides on top of resolved config. Nested
 *  objects are recursively merged so the user can override a single
 *  leaf (e.g. `flow.0.url`) without restating the entire tree. */
function mergeOverrides(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    const existing = out[k];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)
        && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeOverrides(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Pure. List the placeholders in a resolved config that are still
 *  unresolved (so the §8.4 confirm step can prompt the user for
 *  them). Returns the unique placeholder names in deterministic
 *  order. */
export function unresolvedPlaceholders(config: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const stack: unknown[] = [config];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === 'string') {
      const re = /\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(node)) !== null) names.add(m[1]!);
    } else if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node && typeof node === 'object') {
      stack.push(...Object.values(node as Record<string, unknown>));
    }
  }
  return Array.from(names).sort();
}
