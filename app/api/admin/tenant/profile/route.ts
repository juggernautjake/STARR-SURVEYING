// app/api/admin/tenant/profile/route.ts — the firm a session is acting for, for client components.
//
// Server code calls `getTenantProfile(orgId)` directly. Client components cannot: the profile lives in
// a table, and 101 files had resorted to spelling the firm's name, phone and email domain into the
// source instead (audit §3c.3, item 8h). This is the seam that lets them stop.
//
// GET → { profile } — the shape in lib/saas/tenant-profile.ts.
//
// Nothing here is secret: a firm's own name, phone and email domain are on its invoices and its
// website. But it is still session-gated, because *which* firm the caller belongs to is not public,
// and an unauthenticated endpoint that answers "who is org X" is a tenant-enumeration tool.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { orgIdForSession } from '@/lib/saas/org-scope-context';
import { getTenantProfile } from '@/lib/saas/tenant-profile';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const profile = await getTenantProfile(orgIdForSession(session));
  // Cached briefly at the edge as well as in-process: this is read by nearly every admin page render
  // and the answer changes when somebody edits Org Settings, which is close to never.
  return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'private, max-age=60' } });
});
