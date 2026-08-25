// app/api/admin/research/sites/route.ts — register a county portal without writing code.
//
// Research optimization roadmap §8.1 + §8.2 + §8.5 (Pillar A). The pure helpers for this shipped in
// slices 6 and 10 and then sat there: `detectVendor()` and `prefillAdapterFromTemplate()` had no
// caller, so registering a county still meant a code change. This is the route that makes them a
// feature.
//
//   GET                         → { counties, vendors, adapters } — everything the wizard needs.
//   GET  ?detect=<url>          → { detection, draft? } — which vendor, and the pre-filled config.
//   POST { county_id, site_type, base_url, vendor_id?, config?, canary? } → saved adapter.
//
// ── WHAT THIS ROUTE DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────
//
// It does not touch the county's website. §8.3 (the Playwright site probe) and §8.4 (test-property
// confirm) are deferred by the roadmap on purpose: they drive a browser against government portals,
// and §9.9's guardrails require that to be a deliberate, flagged decision rather than something that
// starts happening because a form was submitted. Detection here is URL-fingerprint only — offline,
// free, and correct for the known-vendor case, which is acceptance criterion (a): a county on an
// existing vendor is registrable in minutes with no code change.
//
// An adapter saved without a probe is therefore saved as `draft`, never `active`. It is a claim that
// has not been tested against a real property, and the difference matters: `active` is what the
// health scheduler picks up and what the coverage dashboard tells a customer works.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin, isDeveloper } from '@/lib/auth';
import { canReadResearch } from '@/lib/research/access';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { detectVendor, type VendorTemplate as DetectVendor } from '@/lib/research/vendor-detection';
import { prefillAdapterFromTemplate, unresolvedPlaceholders, type VendorTemplate as DraftVendor } from '@/lib/research/adapter-draft';

const SITE_TYPES = [
  'appraisal_cad', 'clerk_deeds', 'plat_records', 'gis_parcels',
  'legal_description', 'flood_fema', 'survey_glo', 'misc',
] as const;
type SiteType = (typeof SITE_TYPES)[number];

interface VendorRow {
  id: string;
  vendor_key: string;
  display_name: string;
  access_method: DraftVendor['access_method'];
  url_fingerprints: unknown;
  config_template: Record<string, unknown> | null;
  field_map_template: Record<string, unknown> | null;
}

/** The two helper modules declare their own `VendorTemplate`. Same row, two views of it — one
 *  cares about fingerprints, the other about templates. Converted here rather than widening either
 *  interface, so neither helper learns about columns it has no use for.
 *
 *  Note what neither view carries: the row's `id`. The detector matches on `vendor_key` because a
 *  key is what a fingerprint identifies; the FK is the caller's business. That is why the detection
 *  result is re-joined to the rows below rather than being handed to the client as-is. */
function toDetect(v: VendorRow): DetectVendor {
  return {
    vendor_key: v.vendor_key,
    display_name: v.display_name,
    url_fingerprints: (Array.isArray(v.url_fingerprints) ? v.url_fingerprints : []) as DetectVendor['url_fingerprints'],
  };
}
function toDraft(v: VendorRow): DraftVendor {
  return {
    id: v.id,
    vendor_key: v.vendor_key,
    display_name: v.display_name,
    access_method: v.access_method,
    config_template: v.config_template ?? {},
    field_map_template: v.field_map_template ?? {},
  };
}

/** The detector speaks in vendor keys; the wizard has to POST a `vendor_id`. Joining here — once,
 *  server-side — means the client never has to guess which row a key meant, and a key that matches
 *  no row simply drops out rather than arriving as a dangling FK. */
function withVendorRow(match: { vendor_key: string; display_name: string; score: number }, vendors: VendorRow[]) {
  const row = vendors.find((v) => v.vendor_key === match.vendor_key);
  if (!row) return null;
  return { vendor: { id: row.id, key: row.vendor_key, display_name: row.display_name }, score: match.score };
}

async function loadVendors(): Promise<VendorRow[]> {
  const { data } = await supabaseAdmin
    .from('research_data_vendors')
    .select('id, vendor_key, display_name, access_method, url_fingerprints, config_template, field_map_template')
    .eq('is_active', true);
  return (data ?? []) as VendorRow[];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // C11b-0: this GET answered ANY signed-in account until 2026-08-25 — measured, 200 to a plain
  // `employee`. `middleware.ts` gates the /admin/research PAGES to these six roles but never ran on
  // /api/*, so the gate was in front of the screen and not in front of the data. See
  // lib/research/access.ts.
  if (!canReadResearch(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const detectUrl = url.searchParams.get('detect');

  // Detection is a read of a string against seeded regexes. No fetch, no browser.
  if (detectUrl) {
    const vendors = await loadVendors();
    const raw = detectVendor(detectUrl, vendors.map(toDetect));
    const detection = {
      best: raw.best ? withVendorRow(raw.best, vendors) : null,
      matches: raw.matches.map((m) => withVendorRow(m, vendors)).filter((m): m is NonNullable<typeof m> => !!m),
    };
    const countyId = url.searchParams.get('county_id');
    const siteType = url.searchParams.get('site_type') as SiteType | null;

    let draft = null;
    let missing: string[] = [];
    if (raw.best && countyId && siteType && SITE_TYPES.includes(siteType)) {
      const vendorRow = vendors.find((v) => v.vendor_key === raw.best!.vendor_key);
      if (vendorRow) {
        draft = prefillAdapterFromTemplate({
          vendor: toDraft(vendorRow),
          base_url: detectUrl,
          county_id: countyId,
          site_type: siteType,
        });
        // The whole value of the template is that most of it is already right. What is left is the
        // county-specific handful — a client id, a layer number — and naming them is the difference
        // between a five-minute registration and a broken adapter nobody notices for a week.
        missing = unresolvedPlaceholders(draft.config);
      }
    }
    return NextResponse.json({ detection, draft, missing });
  }

  const [vendors, { data: counties }, { data: adapters }]: [VendorRow[], { data: unknown[] | null }, { data: unknown[] | null }] = await Promise.all([
    loadVendors(),
    supabaseAdmin.from('research_counties').select('id, name, fips, metro_tier').order('name'),
    supabaseAdmin
      .from('research_site_adapters')
      .select('id, county_id, vendor_id, site_type, base_url, access_method, status, last_verified_at, created_at')
      .order('created_at', { ascending: false }),
  ]);

  return NextResponse.json(
    {
      counties: counties ?? [],
      vendors: vendors.map((v) => ({ id: v.id, key: v.vendor_key, display_name: v.display_name, access_method: v.access_method })),
      adapters: adapters ?? [],
      siteTypes: SITE_TYPES,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

interface SaveBody {
  county_id?: string;
  site_type?: SiteType;
  base_url?: string;
  vendor_id?: string | null;
  config_overrides?: Record<string, unknown>;
  /** A known property on this portal, stored as the adapter's canary (§8.5 / §9.2). */
  canary_query?: string;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Registering a data source decides what the firm's research reads and what the coverage
  // dashboard promises customers. Not a general-staff action.
  const roles = session.user.roles ?? [];
  if (!isAdmin(roles) && !isDeveloper(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const { county_id, site_type, base_url } = body;

  if (!county_id || !site_type || !base_url) {
    return NextResponse.json({ error: 'A county, a site type and a portal URL are all required.' }, { status: 400 });
  }
  if (!SITE_TYPES.includes(site_type)) {
    return NextResponse.json({ error: `Unknown site type: ${site_type}` }, { status: 400 });
  }

  const vendors = await loadVendors();
  const vendorRow = body.vendor_id ? vendors.find((v) => v.id === body.vendor_id) ?? null : null;
  if (body.vendor_id && !vendorRow) {
    return NextResponse.json({ error: 'That vendor template no longer exists.' }, { status: 400 });
  }

  const draft = prefillAdapterFromTemplate({
    vendor: vendorRow ? toDraft(vendorRow) : null,
    base_url,
    county_id,
    site_type,
    config_overrides: body.config_overrides,
  });

  const { data: saved, error } = await supabaseAdmin
    .from('research_site_adapters')
    .insert({ ...draft, created_by: session.user.email })
    .select('id, county_id, site_type, base_url, access_method, status')
    .single();

  if (error) {
    // UNIQUE(county_id, site_type) is the schema's way of saying a county has one portal of each
    // kind. Said in words rather than as a Postgres constraint name.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This county already has a registered portal of that type. Edit that one instead of adding a second.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-enrol (§8.5). Both of these are best-effort and reported rather than fatal: an adapter that
  // saved but whose coverage row failed is recoverable; refusing the save and losing the config the
  // user just typed is not.
  const warnings: string[] = [];

  if (body.canary_query) {
    const { error: canaryError } = await supabaseAdmin.from('research_adapter_canaries').insert({
      adapter_id: saved.id,
      query_input: { query: body.canary_query },
      // No expected fields yet — those come from the §8.4 test-property run, which needs the probe.
      // An empty golden record is honest; a fabricated one would make the first health check pass
      // for the wrong reason.
      expected_fields: {},
      is_active: true,
    });
    if (canaryError) warnings.push(`Canary not saved: ${canaryError.message}`);
  } else {
    warnings.push('No canary property given, so health checks cannot verify this adapter still returns the right data.');
  }

  const { error: coverageError } = await supabaseAdmin
    .from('research_county_data_sources')
    .upsert(
      // 'requested', not 'partial'. Nothing has read a property through this adapter yet, and the
      // coverage dashboard is customer-facing — claiming coverage we have not demonstrated is how a
      // surveyor picks this firm for a county it cannot actually search.
      { county_id, site_type, coverage: 'requested', adapter_id: saved.id },
      { onConflict: 'county_id,site_type' },
    );
  if (coverageError) warnings.push(`Coverage not updated: ${coverageError.message}`);

  return NextResponse.json({ adapter: saved, warnings });
});
