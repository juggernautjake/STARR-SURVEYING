// app/api/admin/jobs/[id]/briefings/[briefingId]/upload-url/route.ts — slice B3.
//
// ── THE FIRST DIRECT-TO-STORAGE UPLOAD IN THIS PRODUCT ──────────────────────────────────────────
//
// Every other upload here posts the file to a route handler, which reads it and puts it in storage.
// A screen recording cannot: **Vercel caps a serverless request body at 4.5 MB**, and a ten-minute
// 1080p capture is 60–150 MB. Posting it to a handler fails at the platform — a 413 or a timeout
// that reads like a bug in the recorder rather than a limit nobody could have satisfied.
//
// So this mints a signed upload URL and the browser PUTs the bytes straight to Supabase. Our API
// never touches them. It sees the file name and the size, decides whether it is allowed, and hands
// back a token good for one object at one path.
//
// The path is computed by `briefingObjectPath` rather than agreed between the two endpoints, because
// the completion call has to name the same object and two independent constructions of a key is how
// a file uploads successfully and then cannot be found.
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { briefingObjectPath, validateUpload, isRejection } from '@/lib/jobs/briefings';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string; briefingId: string }> }

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: jobId, briefingId } = await ctx.params;

  const { data: briefing } = await supabaseAdmin
    .from('job_briefings').select('id, job_id, author_email, state').eq('id', briefingId).maybeSingle();
  if (!briefing || (briefing as { job_id: string }).job_id !== jobId) {
    return NextResponse.json({ error: 'Briefing not found on this job.' }, { status: 404 });
  }
  // Only the author adds to their own briefing. A published briefing can still be added to (B6) —
  // that is the owner's "he can add more stuff later" — so state is deliberately not checked here.
  if ((briefing as { author_email: string }).author_email !== session.user.email) {
    return NextResponse.json({ error: 'Only the person who started this briefing can add to it.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const decision = validateUpload({
    kind: String(body.kind ?? ''),
    fileName: String(body.fileName ?? ''),
    sizeBytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : null,
  });
  if (isRejection(decision)) return NextResponse.json({ error: decision.error }, { status: 400 });

  const path = briefingObjectPath(briefingId, String(body.fileName), randomUUID());
  const { data, error } = await supabaseAdmin.storage.from(decision.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not prepare the upload.' }, { status: 500 });
  }

  // `signedUrl` is where the bytes go; `path` and `bucket` come back so the completion call names
  // the same object without re-deriving it.
  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    bucket: decision.bucket,
    path,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
