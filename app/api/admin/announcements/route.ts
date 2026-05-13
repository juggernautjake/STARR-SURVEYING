// app/api/admin/announcements/route.ts
//
// Returns the list of published releases visible to the calling user.
// "Visible" = release.bundles intersect user's active-org's
// subscription.bundles (or release.bundles is empty, meaning it
// affects all bundles).
//
// Reused by both:
//   - WhatsNewBanner via /api/app/version?for=user (the single-
//     latest-unread variant)
//   - /admin/announcements page (the full archive)
//
// Spec: docs/planning/in-progress/SOFTWARE_UPDATE_DISTRIBUTION.md §4.2 + §5.
//       docs/planning/in-progress/CUSTOMER_PORTAL.md §3.9.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface ReleaseRow {
  id: string;
  version: string;
  release_type: string;
  bundles: string[] | null;
  notes_markdown: string | null;
  published_at: string;
}

interface ReleaseOut {
  id: string;
  version: string;
  releaseType: string;
  bundles: string[];
  notesMarkdown: string | null;
  publishedAt: string;
}

export async function GET(): Promise<NextResponse<{ releases: ReleaseOut[] }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ releases: [] });
  }

  // Resolve user's active-org bundles. Until M-9 puts activeOrgId in
  // the JWT, fall back to default_org_id.
  let userBundles: string[] = [];
  try {
    const { data: user } = await supabaseAdmin
      .from('registered_users')
      .select('default_org_id')
      .eq('email', session.user.email)
      .maybeSingle();
    if (user?.default_org_id) {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('bundles')
        .eq('org_id', user.default_org_id)
        .maybeSingle();
      userBundles = sub?.bundles ?? [];
    }
  } catch (err) {
    console.warn('[announcements] bundle resolution failed', err);
  }

  let releases: ReleaseRow[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('releases')
      .select('id, version, release_type, bundles, notes_markdown, published_at')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    releases = (data ?? []) as ReleaseRow[];
  } catch (err) {
    console.warn('[announcements] releases query failed', err);
    return NextResponse.json({ releases: [] });
  }

  const visible: ReleaseOut[] = [];
  for (const r of releases) {
    const releaseBundles = r.bundles ?? [];
    const matches = releaseBundles.length === 0
      || releaseBundles.some((b) => userBundles.includes(b));
    if (!matches) continue;
    visible.push({
      id: r.id,
      version: r.version,
      releaseType: r.release_type,
      bundles: releaseBundles,
      notesMarkdown: r.notes_markdown,
      publishedAt: r.published_at,
    });
  }

  return NextResponse.json({ releases: visible });
}
