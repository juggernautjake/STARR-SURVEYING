// app/api/admin/research/county-profiles/route.ts — the worker's county profiles, for the Coverage tab.
//
// GET → { count, tiers, profiles[] } as the worker resolves them (2026-09-09). Proxied rather than
// imported: the resolver reads the worker's registries (BIS, Kofile, plats), which pull the scraper
// modules with them, and the app must not bundle those. What the page shows is therefore exactly
// what the router will do — the same function, not a copy of its tables.
//
// A worker that does not answer is reported as such, never as "no counties": those are opposite
// facts that render identically as an empty list.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canReadResearch } from '@/lib/research/access';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const CACHE_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;

interface CachedProfiles { at: number; body: unknown }
let cached: CachedProfiles | null = null;

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!canReadResearch(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body, { headers: { 'Cache-Control': 'no-store' } });
  }

  const url = process.env.WORKER_URL?.trim() ?? '';
  const key = process.env.WORKER_API_KEY?.trim() ?? '';
  if (!url || !key) {
    return NextResponse.json({ error: 'The research worker is not configured (WORKER_URL / WORKER_API_KEY).' }, { status: 503 });
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/research/county-profiles`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `The research worker answered HTTP ${res.status} for the county profiles.` }, { status: 502 });
    }
    const body = await res.json();
    cached = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: `The research worker did not answer for the county profiles: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
});
