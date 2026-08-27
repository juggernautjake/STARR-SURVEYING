// scripts/audit-starr-assumptions.mjs — where "our firm" is spelled into the code (audit §3c.3, item 8h).
//
// §3c.3 names the trap precisely:
//
//   *"'Make it work for Starr' and 'make it sellable' pull in opposite directions exactly once: when a
//    hard-coded Starr assumption is cheaper than a configurable one. … Each is correct today and each
//    is a per-tenant setting tomorrow. They should be found and catalogued now, while they are a list,
//    rather than discovered one support ticket at a time."*
//
// This is the list, and it is generated rather than written, because a hand-written list of 150-odd
// call sites is out of date the week after it is written.
//
// ── THE CLASSIFICATION IS THE WORK (AGAIN) ──────────────────────────────────────────────────────
//
// A raw grep for "Starr" finds ~153 files and is useless, because most of them are **correct** and
// must never change. Starr Surveying is three different things in this repo at once:
//
//   · the SOFTWARE VENDOR — `/platform`, the operator console, the pricing pages. Starr Software sells
//     this. A customer firm's name has no business there.
//   · the OWNER OF A PUBLIC WEBSITE — `app/page.tsx`, `/about`, `/services`, `/contact`, the marketing
//     header and footer. That is starr-surveying.com, the actual company website. It is not a tenant
//     surface and never becomes one.
//   · a TENANT — the firm whose invoices, emails, plat title blocks, login domain and county coverage
//     the admin app manages. **This is the only bucket that has to become configurable**, and mixing it
//     with the other two is what makes the problem look impossible.
//
// So: `own-site` and `vendor` are correct-forever, `fixture` is demo and test data, and `tenant` is the
// backlog. The number that matters is the tenant count, and `__tests__/saas/starr-assumptions.test.ts`
// ratchets it so a new hard-code cannot be added to a customer-facing surface without a decision.
//
// Run: `node scripts/audit-starr-assumptions.mjs [--all]`

import fs from 'node:fs';
import path from 'node:path';

/** Identity strings that mean "this specific firm". Deliberately narrow: `Starr CAD` and `Starr Recon`
 *  are PRODUCT names owned by the vendor, not firm identity, and matching them would drown the signal. */
const PATTERNS = [
  { id: 'email-domain', re: /starr-surveying\.com/g, what: 'the firm’s email domain' },
  { id: 'firm-name', re: /Starr Surveying/g, what: 'the firm’s display name' },
  { id: 'phone', re: /\(936\)\s*662-0077|\+?19366620077/g, what: 'the firm’s phone number' },
  { id: 'county', re: /\bBell County\b|countyName !== 'bell'|=== 'bell'/g, what: 'a single county assumed' },
];

// ── A FOURTH CATEGORY, FOUND WHILE FIXING THIS: county ADAPTER code ─────────────────────────────
//
// The `county` pattern was the largest bucket (106 references) and most of it was miscounted. A file
// like `property-search.service.ts` names Bell in a **registry of ~35 Texas counties** — beside
// McLennan, Williamson, Coryell and the rest — with each county's appraisal-district URL, clerk URL
// and public-search host. That is a county catalogue, exactly the shared reference data audit §1.2
// deliberately classified as NOT per-tenant ("a per-tenant copy of the county list is duplication with
// extra steps"). And `bell-cad-arcgis.service.ts` is the Bell adapter; naming Bell inside the Bell
// adapter is not a hard-code, it is the file's subject.
//
// The distinction that matters, and the one `lib/research/county-support.ts` is built around:
//
//   CAPABILITY — "can the software read that county's records?" Grows by writing adapters. Making it
//     configurable would let a firm point Bell CAD's ArcGIS at a Travis County parcel and get a
//     confident answer about the wrong land.
//   COVERAGE — "does this firm work in that county?" Per-tenant, lives in `org_counties`.
//
// Counting adapter files as tenant debt would push toward "fixing" them, and the fix is the bug. They
// get their own bucket so the tenant number means what it says.
const COUNTY_ADAPTERS = [
  { prefix: 'lib/research/bell-cad-arcgis.service', why: 'the Bell adapter — naming Bell here is the file’s subject' },
  { prefix: 'lib/research/property-search.service', why: 'a registry of ~35 Texas counties; Bell is one row' },
  { prefix: 'lib/research/boundary-fetch.service', why: 'per-county boundary endpoints' },
  { prefix: 'lib/research/parcel-map-capture.service', why: 'per-county map portals' },
  { prefix: 'lib/research/progressive-zoom.service', why: 'per-county map portals' },
  { prefix: 'lib/research/map-image.service', why: 'per-county map portals' },
  { prefix: 'lib/research/vendor-detection', why: 'identifies which vendor a county’s portal runs' },
  { prefix: 'lib/research/document-analysis.service', why: 'county-specific document formats' },
  { prefix: 'lib/research/iterative-image-analyzer.service', why: 'county-specific map rendering' },
  { prefix: 'lib/research/self-heal-planner', why: 'per-county scraper repair' },
  { prefix: 'app/api/admin/research/[projectId]/bell-cad-gis', why: 'the Bell CAD GIS route — the guard here is correct and must stay' },
  { prefix: 'lib/research/county-support', why: 'the file that draws this very distinction' },
  // Added 2026-08-06 with the US-wide weather location search. This is the Census gazetteer's list of
  // every county in the country; Bell County, Texas is one of 3,222 rows, and Bell County, Kentucky
  // is another. Counting them as "a single county assumed" would be the exact inversion of the truth
  // — the file exists BECAUSE the product must work anywhere — and "fixing" it would mean deleting
  // two counties from a national dataset.
  { prefix: 'lib/weather/us-counties', why: 'the national county table; Bell is 2 of 3,222 rows' },
];

/** Paths whose Starr references are CORRECT and must not be counted as debt. Prefix-matched, and each
 *  carries the reason — a bare path list would be indistinguishable from an ignore list. */
const CORRECT_FOREVER = [
  { prefix: 'app/platform', bucket: 'vendor', why: 'the operator console — Starr Software as the vendor' },
  { prefix: 'app/pricing', bucket: 'vendor', why: 'what the vendor charges for the product' },
  { prefix: 'app/page.tsx', bucket: 'own-site', why: 'starr-surveying.com — the firm’s own public website' },
  { prefix: 'app/about', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/services', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/service-area', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/contact', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/resources', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/credentials', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/sitemap.ts', bucket: 'own-site', why: 'the firm’s own public website' },
  { prefix: 'app/layout.tsx', bucket: 'own-site', why: 'metadata for the firm’s own public website' },
  { prefix: 'app/components/Header', bucket: 'own-site', why: 'the public site’s chrome' },
  { prefix: 'app/components/Footer', bucket: 'own-site', why: 'the public site’s chrome' },
  { prefix: 'app/components/ServiceAreaMap', bucket: 'own-site', why: 'the public site’s service-area map' },
  { prefix: 'app/components/GoogleReviewWidget', bucket: 'own-site', why: 'the firm’s own Google reviews' },
  { prefix: 'app/components/SurveyCalculator', bucket: 'own-site', why: 'a public marketing calculator' },
  // Added 2026-08-12. Both were landing in the `tenant` backlog only because the bucket is a
  // fallthrough — any path matching nothing above is counted as debt — and neither had been added
  // to this list when it was written.
  //
  // The privacy policy is the clearest own-site file in the repo: it is a legal document naming the
  // DATA CONTROLLER by its registered trade name, and it names the legal entity (Starr Technical
  // Services Inc.) that the tenant profile does not even model. "Fixing" it would mean a privacy
  // policy that does not say whose policy it is. It sits beside app/about and app/contact, which
  // have always been here.
  { prefix: 'app/privacy', bucket: 'own-site', why: 'the firm’s own privacy policy — a legal document naming the data controller' },
  // A host allow-list gating the firm's OWN Google Ads conversion tag to its own production domain.
  // Every other file in app/components/* that names the site is already here; this was the only one
  // missed, and it arrived after the list was written.
  { prefix: 'app/components/GoogleAdsScript', bucket: 'own-site', why: 'gates the firm’s own conversion tag to its own domain' },

  // Added 2026-08-27, and it is the SAME misclassification as the two above — third time now, which
  // is worth saying plainly rather than quietly appending: **the `tenant` fallthrough means every new
  // own-website file joins the backlog by default**, and the count goes red weeks later for a reason
  // that has nothing to do with tenant debt.
  //
  // `lib/seo/business.ts` is the firm's own identity, in one file, because it was being spelled
  // differently in four places — the address on the map, the phone in the footer, the hours on
  // /contact, and the domain in three variants, one of which did not resolve. Consolidating those is
  // the opposite of tenant debt: it is the prerequisite for ever making them per-tenant, because you
  // cannot parameterise a value that is written out by hand in four files.
  //
  // It sits beside app/about, app/contact and app/privacy, all long since listed. The structured
  // data it emits describes THE DATA CONTROLLER — the same argument the privacy policy won on.
  { prefix: 'lib/seo/business', bucket: 'own-site', why: 'the firm’s own NAP and identity, consolidated — what /about and /contact already render' },
  { prefix: 'lib/seo/page-metadata', bucket: 'own-site', why: 'titles and canonicals for the firm’s own public website' },
  { prefix: 'app/components/StructuredData', bucket: 'own-site', why: 'JSON-LD describing the firm’s own site to crawlers' },
  { prefix: 'app/dnd', bucket: 'vendor', why: 'a separate product, explicitly out of this audit’s scope' },

  // Added 2026-08-02. Andrew Ash's voice-over platform — a different person's business, hosted here
  // temporarily and scheduled to be lifted into its own repo and domain. It is not a Starr surface
  // and never becomes one, so "a customer firm would expect this to say THEIR name" does not apply:
  // the name it should say is Andrew's, and it does.
  //
  // Its handful of Starr references are the OPPOSITE of tenant debt — they are the comments marking
  // where the two applications must not touch, most importantly the one in lib/voice/payments.ts
  // explaining why Andrew's Stripe keys are read from VOICE_-prefixed variables with no fallback to
  // this repo's. Counting those as debt would pressure someone into deleting the warning.
  { prefix: 'app/AndrewAsh', bucket: 'vendor', why: 'a separate tenant’s site, leaving this repo — its Starr references are boundary documentation' },
  { prefix: 'lib/voice', bucket: 'vendor', why: 'the voice platform’s core, same as app/AndrewAsh' },
  { prefix: 'app/api/voice', bucket: 'vendor', why: 'the voice platform’s API, same as app/AndrewAsh' },
  { prefix: 'app/api/contact', bucket: 'own-site', why: 'the public site’s contact form' },
  { prefix: '__tests__', bucket: 'fixture', why: 'test fixtures' },
  { prefix: 'e2e', bucket: 'fixture', why: 'test fixtures' },
  { prefix: 'worker/src', bucket: 'fixture', why: 'the research worker runs for one firm today; tenancy reaches it via the job payload, not the source' },
  { prefix: 'app/admin/components/jobs/fieldwork-demo', bucket: 'fixture', why: 'demo data' },
];

const ROOTS = ['app', 'lib', 'mobile', 'types'];
const EXTS = new Set(['.ts', '.tsx']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(entry.name))) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

export function classifyPath(rel) {
  for (const entry of CORRECT_FOREVER) {
    if (rel === entry.prefix || rel.startsWith(entry.prefix)) return entry;
  }
  for (const entry of COUNTY_ADAPTERS) {
    if (rel === entry.prefix || rel.startsWith(entry.prefix)) return { ...entry, bucket: 'adapter' };
  }
  return { bucket: 'tenant', why: 'a customer firm would expect this to say THEIR name' };
}

export function scan(root = process.cwd()) {
  const files = ROOTS.filter((r) => fs.existsSync(path.join(root, r)))
    .flatMap((r) => walk(path.join(root, r)))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'));

  const hits = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const p of PATTERNS) {
      const n = (src.match(p.re) ?? []).length;
      if (n) hits.push({ file: rel, pattern: p.id, what: p.what, count: n, ...classifyPath(rel) });
    }
  }
  return hits;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const hits = scan();
  const byBucket = new Map();
  for (const h of hits) byBucket.set(h.bucket, [...(byBucket.get(h.bucket) ?? []), h]);

  const tenant = byBucket.get('tenant') ?? [];
  const files = new Set(tenant.map((h) => h.file));

  console.log('Starr identity referenced in source:\n');
  for (const [bucket, list] of [...byBucket].sort()) {
    const fileCount = new Set(list.map((h) => h.file)).size;
    const hitCount = list.reduce((a, h) => a + h.count, 0);
    const note = bucket === 'tenant' ? '   ← the backlog'
      : bucket === 'adapter' ? '   (per-COUNTY capability, not per-tenant — see COUNTY_ADAPTERS)'
      : '   (correct — leave alone)';
    console.log(`  ${bucket.padEnd(10)} ${String(fileCount).padStart(3)} files, ${String(hitCount).padStart(4)} references${note}`);
  }

  console.log(`\nTenant-surface files that hard-code this firm (${files.size}):\n`);
  const grouped = new Map();
  for (const h of tenant) grouped.set(h.file, [...(grouped.get(h.file) ?? []), h]);
  for (const [file, list] of [...grouped].sort()) {
    console.log(`  ${file}`);
    for (const h of list) console.log(`      ${h.count}× ${h.what}`);
  }

  if (process.argv.includes('--all')) {
    console.log('\nEverything else, for review:\n');
    for (const h of hits.filter((x) => x.bucket !== 'tenant').sort((a, b) => a.file.localeCompare(b.file))) {
      console.log(`  [${h.bucket}] ${h.file} — ${h.count}× ${h.what}`);
    }
  }
}
