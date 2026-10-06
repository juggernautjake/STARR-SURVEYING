// app/api/admin/research/file/[...path]/route.ts — open a private research file.
//
//   GET /api/admin/research/file/<storage key>[?download=1]
//
// The `research-documents` bucket is private (seeds/669). Every stored link to one of its files is
// this route, so an <img>, a PDF viewer or a download link keeps working for staff — the session
// cookie travels with the request — and gets a 302 to a short-lived signed URL. Without a session
// (or for a student/guest account on the learning side of the platform) it is a 401/403, which is
// the point: deeds, plats and captures are business records, not public web pages.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { researchStorageKey } from '@/lib/research/research-file-url';

/** Staff roles. A learning-platform account (student, guest, teacher alone) is not staff. */
const STAFF_ROLES = ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support', 'employee', 'equipment_manager'];

/** Long enough to read a big PDF; short enough that a copied link stops working soon. */
const SIGNED_SECONDS = 15 * 60;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const roles = (session.user.roles ?? []) as string[];
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // From the raw pathname, not the decoded params, so the key is parsed exactly one way — the same
  // function the rest of the app uses — and `..` can never climb out of the bucket.
  const key = researchStorageKey(req.nextUrl.pathname);
  if (!key) return NextResponse.json({ error: 'Not a research file' }, { status: 400 });

  const download = req.nextUrl.searchParams.get('download') === '1';
  const { data, error } = await supabaseAdmin.storage
    .from(RESEARCH_DOCUMENTS_BUCKET)
    .createSignedUrl(key, SIGNED_SECONDS, download ? { download: key.split('/').pop() } : undefined);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  // The redirect target expires; the browser may reuse it briefly, but no shared cache may keep it.
  res.headers.set('Cache-Control', 'private, max-age=600');
  return res;
}, { routeName: 'research/file' });
