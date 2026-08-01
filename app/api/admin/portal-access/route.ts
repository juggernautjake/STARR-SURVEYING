// app/api/admin/portal-access/route.ts — issue and revoke a customer's link (Phase 2 item 10).
//
//   GET ?jobId=…  → who can see this job, and whether they have looked.
//   POST          → issue a link. body: { job_id, issued_to_email?, issued_to_name?, expires_at? }
//   DELETE ?id=…  → revoke one.
//
// The token is returned in full ONLY on creation. Afterwards the list shows a prefix — enough to
// match a link a customer read out over the phone, not enough to reconstruct one from a screenshot,
// a support ticket or a shoulder. The firm re-issues rather than recovers, which is the same trade
// every credential system makes and the right one here.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { mintProposalToken } from '@/lib/proposals/proposals';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('customer_portal_access')
    .select('id, token, issued_to_name, issued_to_email, expires_at, revoked_at, first_seen_at, last_seen_at, view_count, created_by, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grants = ((data ?? []) as Array<{ token: string } & Record<string, unknown>>).map((g) => ({
    ...g,
    token: undefined,
    tokenPrefix: g.token.slice(0, 6),
    // "Sent but never opened" is almost always a wrong email address, and it is the one thing the
    // firm can act on from this list.
    neverOpened: !g.first_seen_at && !g.revoked_at,
  }));

  return NextResponse.json({ grants }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id ?? '');
  if (!jobId) return NextResponse.json({ error: 'job_id is required.' }, { status: 400 });

  // The job must be in this tenant. The scoped client already filters the read, so a miss means "not
  // yours or not there" — and a portal link to a job that does not exist is worse than a refusal.
  const { data: job } = await supabaseAdmin.from('jobs').select('id, customer_id, client_email, client_name').eq('id', jobId).maybeSingle();
  const jobRow = job as { id: string; customer_id: string | null; client_email: string | null; client_name: string | null } | null;
  if (!jobRow) return NextResponse.json({ error: 'That job is not in this firm’s records.' }, { status: 404 });

  const token = mintProposalToken();
  const { data, error } = await supabaseAdmin
    .from('customer_portal_access')
    .insert({
      job_id: jobId,
      customer_id: jobRow.customer_id,
      token,
      // Defaults to whoever the job says the client is, so the common case is one click.
      issued_to_email: String(body.issued_to_email ?? '').trim() || jobRow.client_email,
      issued_to_name: String(body.issued_to_name ?? '').trim() || jobRow.client_name,
      // Null = never expires. A survey's records matter for decades, and a link that dies in ninety
      // days sends the customer back to the phone — the cost this portal exists to remove.
      expires_at: body.expires_at || null,
      created_by: session.user.email,
    })
    .select('id, issued_to_name, issued_to_email, expires_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    grant: data,
    // The only time the full token is returned. Send it now or re-issue later.
    token,
    url: `/portal/${token}`,
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // Revoked, not deleted. Who could see what, and until when, is a question that gets asked after
  // something goes wrong — and a deleted row cannot answer it.
  const { data, error } = await supabaseAdmin
    .from('customer_portal_access')
    .update({ revoked_at: new Date().toISOString(), revoked_by: session.user.email })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found, or already revoked.' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
