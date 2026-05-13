// app/api/app/version/route.ts
//
// Returns the deployed app version + latest release notes relevant to
// the calling user's org bundles. The customer-side "What's new"
// banner on HubGreeting (Phase G-4) polls this on mount and shows
// the banner when the response's release.version > the user's
// localStorage.lastAckedVersion.
//
// Public endpoint — no auth required for the version string itself.
// Per-user "latest release for me" lookup runs when ?for=user is
// passed AND a session cookie is present.
//
// Spec: docs/planning/in-progress/SOFTWARE_UPDATE_DISTRIBUTION.md §5.2.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface VersionResponse {
  version: string;
  commitSha: string | null;
  builtAt: string | null;
  /** When ?for=user, the latest published release in any bundle the
   *  user's active-org has + that the user hasn't acked yet. */
  latestRelease?: {
    id: string;
    version: string;
    title: string;
    type: string;
    publishedAt: string;
    notesMarkdown: string | null;
    bundles: string[];
  } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse<VersionResponse>> {
  const url = new URL(req.url);
  const forUser = url.searchParams.get('for') === 'user';

  const version = process.env.NEXT_PUBLIC_APP_VERSION
    ?? process.env.npm_package_version
    ?? '0.0.0';
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const builtAt = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE ?? null;

  const base: VersionResponse = { version, commitSha, builtAt };
  if (!forUser) return NextResponse.json(base);

  // Per-user lookup: needs session
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json(base);

  try {
    const latest = await fetchLatestUnackedReleaseForUser(session.user.email);
    return NextResponse.json({ ...base, latestRelease: latest });
  } catch (err) {
    console.error('[version] per-user lookup failed', err);
    return NextResponse.json({ ...base, latestRelease: null });
  }
}

interface LatestRelease {
  id: string;
  version: string;
  title: string;
  type: string;
  publishedAt: string;
  notesMarkdown: string | null;
  bundles: string[];
}

/** Returns the most recent published release whose bundles overlap the
 *  user's active-org subscription + the user hasn't acknowledged. */
async function fetchLatestUnackedReleaseForUser(email: string): Promise<LatestRelease | null> {
  // 1) Find the user's active org (or default org).
  //    Until M-9 ships activeOrgId in the JWT, fall back to default_org_id.
  const { data: user, error: uErr } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', email)
    .maybeSingle();
  if (uErr || !user?.default_org_id) return null;

  // 2) Active subscription's bundles for that org.
  const { data: sub, error: sErr } = await supabaseAdmin
    .from('subscriptions')
    .select('bundles')
    .eq('org_id', user.default_org_id)
    .maybeSingle();
  if (sErr) return null;
  const userBundles: string[] = sub?.bundles ?? [];

  // 3) Latest published release intersecting bundles, not yet acked.
  const { data: releases, error: rErr } = await supabaseAdmin
    .from('releases')
    .select('id, version, release_type, notes_markdown, bundles, published_at')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(20);
  if (rErr) return null;

  const { data: acked } = await supabaseAdmin
    .from('release_acks')
    .select('release_id')
    .eq('user_email', email);
  const ackedIds = new Set((acked ?? []).map((r: { release_id: string }) => r.release_id));

  for (const r of releases ?? []) {
    if (ackedIds.has(r.id)) continue;
    const releaseBundles: string[] = r.bundles ?? [];
    // No bundle filter (release affects all) OR overlap with user's bundles.
    const matches = releaseBundles.length === 0
      || releaseBundles.some((b) => userBundles.includes(b));
    if (matches) {
      return {
        id: r.id,
        version: r.version,
        title: `What's new in ${r.version}`,
        type: r.release_type,
        publishedAt: r.published_at,
        notesMarkdown: r.notes_markdown,
        bundles: releaseBundles,
      };
    }
  }

  return null;
}
