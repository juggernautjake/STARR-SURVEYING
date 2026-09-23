// app/api/cron/county-plat-watch/route.ts — has the county filed anything new?
//
// Owner, 2026-09-23: "We need to be able to do checks from time to time to see if there are any new
// uploads/entries on the county clerk website so we can pull those too."
//
// ── WHY THIS RUNS ON VERCEL AND NOT ON THE WORKER ───────────────────────────────────────────────
//
// bellcountytx.com answers 403 to the worker's address and to Browserbase's, and 200 to an office
// connection and to Vercel. That asymmetry is already load-bearing: `county-plats.ts` marks Bell
// `egress: 'app-relay'` and routes the run's own plat fetches through this app for exactly this
// reason. So the watcher lives where the door opens.
//
// ── IT READS THE INDEX AND WRITES ROWS; IT DOES NOT DOWNLOAD PLATS ──────────────────────────────
//
// A Bell plat averages 2.4 MB and the index lists 8,081 of them. A cron with a 300-second budget
// has no business pulling files, and it does not need to: the useful news is "the county filed
// SADDLE CREEK PHASE 4 last week and we do not have it". Registering that as a library row makes it
// findable immediately, with `storage_path` null, and `scripts/upload-bell-plats.mjs` puts the bytes
// behind it on the next local pass.
//
// ── IDEMPOTENT BY STATE, NOT BY LOCK ────────────────────────────────────────────────────────────
//
// Identity is the county's own file URL, and a row already carrying it is skipped. Two overlapping
// runs therefore cost a duplicate read and write nothing twice, which is the property that lets
// this be safe to re-run by hand while debugging.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://www.bellcountytx.com/county_government/county_clerk/';
const PAGES = [...'abcdefghijklmnopqrstuvwxyz', '0-9'];
/** One request at a time, spaced — the same floor `scripts/bell-plat-archive.mjs` crawls at. */
const GAP_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turn the index's HTML back into the characters it stands for — link text is HTML, and
 *  `B &amp; C ESTATES` became a filename once already. */
function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|AMP);/g, '&').replace(/&(?:lt|LT);/g, '<').replace(/&(?:gt|GT);/g, '>')
    .replace(/&(?:quot|QUOT);/g, '"').replace(/&(?:apos|#0?39);/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

interface Found { url: string; name: string }

async function readIndex(letter: string): Promise<Found[]> {
  const res = await fetch(`${BASE}${letter}.php`, {
    headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${letter}.php -> HTTP ${res.status}`);
  const html = await res.text();
  // The href closes on the quote that opened it: plat names contain apostrophes, and a `["']` pair
  // truncated ALARDIN'S LANDING to .../ALARDIN, which 404s.
  const re = /<a\s+href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const out = new Map<string, Found>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!/docs\/plats\//i.test(m[2])) continue;
    const href = m[2].replace(/&amp;/g, '&');
    const abs = href.startsWith('http') ? href : `https://www.bellcountytx.com/${href.replace(/^\//, '')}`;
    // `?t=` is a cache-buster, `#` is the county's own malformed-path bug. Neither is identity.
    const url = abs.split('?')[0].split('#')[0].replace(/^http:\/\//, 'https://');
    if (!/\.[A-Za-z0-9]{2,4}$/.test(url)) continue;
    if (!out.has(url)) {
      out.set(url, { url, name: decodeEntities(m[3].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() });
    }
  }
  return [...out.values()];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/county-plat-watch] CRON_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }

  // The library project the Bell archive is filed under. Absent means the archive was never
  // imported, and inventing a project here would file plats somewhere nobody looks.
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('name', 'Bell County plat archive (library)')
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ skipped: 'no_library_project', message: 'Run scripts/import-bell-plats.mjs first.' });
  }
  const projectId = (project as { id: string }).id;

  const { data: existing, error: readErr } = await supabaseAdmin
    .from('research_documents')
    .select('source_url')
    .eq('county_fips', 'bell')
    .eq('document_type', 'plat')
    .limit(20000);
  if (readErr) return NextResponse.json({ error: 'could not read the library', details: readErr.message }, { status: 500 });
  const rows = (existing ?? []) as unknown as Array<{ source_url: string | null }>;
  const held = new Set(rows.map((r) => String(r.source_url ?? '')));

  const added: string[] = [];
  const pageErrors: string[] = [];
  let seen = 0;

  for (const letter of PAGES) {
    try {
      const entries = await readIndex(letter);
      seen += entries.length;
      for (const e of entries) {
        if (held.has(e.url)) continue;
        const { error } = await supabaseAdmin.from('research_documents').insert({
          research_project_id: projectId,
          source_type: 'property_search',
          original_filename: decodeURIComponent(e.url.split('/').pop() ?? ''),
          file_type: 'pdf',
          source_url: e.url,
          document_type: 'plat',
          document_label: e.name || decodeURIComponent(e.url.split('/').pop() ?? ''),
          processing_status: 'pending',
          county_fips: 'bell',
          provenance: 'public_record',
          source_vendor: 'county_portal',
          shareable: true,
          notes: `Filed by the county after our archive was taken. Seen ${new Date().toISOString().slice(0, 10)}; `
            + 'the file itself is fetched on the next local pass.',
        });
        if (error) pageErrors.push(`${e.name}: ${error.message.slice(0, 80)}`);
        else { added.push(e.name || e.url); held.add(e.url); }
      }
    } catch (e) {
      pageErrors.push(`${letter}.php: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(GAP_MS);
  }

  const summary = added.length === 0
    ? `Bell filed nothing new — ${seen} plats on the index, all held.`
    : `Bell filed ${added.length} new plat(s): ${added.slice(0, 8).join(', ')}${added.length > 8 ? `, and ${added.length - 8} more` : ''}.`;
  console.log(`[cron/county-plat-watch] ${summary}`);
  if (pageErrors.length) console.error(`[cron/county-plat-watch] ${pageErrors.length} problem(s): ${pageErrors.slice(0, 3).join(' | ')}`);

  return NextResponse.json({
    county: 'bell',
    indexed: seen,
    alreadyHeld: seen - added.length,
    added: added.length,
    newPlats: added.slice(0, 50),
    errors: pageErrors.slice(0, 10),
    summary,
  });
}, { routeName: 'cron/county-plat-watch' });
