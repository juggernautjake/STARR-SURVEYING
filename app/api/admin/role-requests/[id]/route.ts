// app/api/admin/role-requests/[id]/route.ts — decide a request, or withdraw your own. E2.
//
// ── THE GRANT GOES THROUGH THE ONE EXISTING PATH ────────────────────────────────────────────────
//
// Approving calls `addRolesByEmail` from `lib/admin/apply-roles.ts` — the same module
// `/admin/users` uses. Writing the `registered_users.roles` update here instead would have been
// three lines and would have created a second writer of access control, which is how one of them
// stops being audited. That rule is worth more than the three lines.
//
// ── ADD, NEVER REPLACE ──────────────────────────────────────────────────────────────────────────
//
// The request stores the roles ASKED FOR, not the resulting set, and approval adds them to whatever
// the person holds at that moment. Between asking and approving, an admin may have granted
// something else through the normal path; replaying a stored final list would silently revoke it.
// An approval that takes access away is the least expected outcome there is.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { addRolesByEmail } from '@/lib/admin/apply-roles';

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // `withErrorHandler` wraps a single-argument handler, so the id comes off the URL — the same
  // pattern the sibling receipt routes use.
  const id = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  if (!id) return NextResponse.json({ error: 'Missing request id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; note?: string };
  const action = body.action;
  const email = session.user.email.toLowerCase();
  const admin = isAdmin(session.user.roles);

  const { data: reqRow, error: readErr } = await supabaseAdmin
    .from('role_requests')
    .select('id, requester_email, requested_roles, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

  // Withdrawing your own is not an admin action — it is the polite way to take back an ask, and
  // requiring an admin for it leaves the queue full of requests nobody wants any more.
  if (action === 'withdraw') {
    if (reqRow.requester_email !== email && !admin) {
      return NextResponse.json({ error: 'That is not your request.' }, { status: 403 });
    }
    if (reqRow.status !== 'pending') {
      return NextResponse.json({ error: 'That request has already been decided.' }, { status: 409 });
    }
    const { error } = await supabaseAdmin
      .from('role_requests')
      .update({ status: 'withdrawn', decided_by: email, decided_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'withdrawn' });
  }

  if (!admin) {
    return NextResponse.json({ error: 'Only an admin can decide a role request.' }, { status: 403 });
  }
  if (action !== 'approve' && action !== 'deny') {
    return NextResponse.json({ error: 'action must be approve, deny or withdraw.' }, { status: 400 });
  }
  if (reqRow.status !== 'pending') {
    // Two admins in the queue at once. Refusing the second is better than granting twice or
    // overwriting the first decision with a different one.
    return NextResponse.json({ error: 'That request has already been decided.' }, { status: 409 });
  }

  if (action === 'approve') {
    const result = await addRolesByEmail(
      reqRow.requester_email as string,
      (reqRow.requested_roles as string[]) ?? [],
    );
    if (!result.ok) {
      // The request stays PENDING when the grant fails. Marking it approved while the roles did not
      // change would tell the requester they have access they do not have — the worst of the
      // available outcomes.
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
  }

  const { error } = await supabaseAdmin
    .from('role_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'denied',
      decided_by: email,
      decided_at: new Date().toISOString(),
      decision_note: (body.note ?? '').trim() || null,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status: action === 'approve' ? 'approved' : 'denied' });
}, { routeName: 'admin/role-requests/decide' });
