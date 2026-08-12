// app/api/admin/role-requests/route.ts — ask for a role; see what is waiting. E2.
//
// GET  → your own requests. Admins additionally get the pending queue.
// POST → ask for one or more roles you do not already hold.
//
// ── ASKING IS NOT GRANTING, AND THE CODE SHOULD MAKE THAT OBVIOUS ───────────────────────────────
//
// Nothing in this file touches `registered_users.roles`. A POST here writes a row that says
// "somebody would like X"; the grant happens only when an admin approves, and then only through
// `lib/admin/apply-roles.ts`, which is the same function `/admin/users` calls. If a future change
// makes this file able to grant a role, that change is a bug however reasonable it looks.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin, ALL_ROLES } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const COLS = 'id, requester_email, requested_roles, reason, status, decided_by, decided_at, decision_note, created_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = isAdmin(session.user.roles);
  const email = session.user.email.toLowerCase();

  // Your own history, always. Scoped in the QUERY rather than filtered afterwards — a request
  // carries somebody's stated reason for wanting access, which is not everyone's business.
  const { data: mine, error: mineErr } = await supabaseAdmin
    .from('role_requests')
    .select(COLS)
    .eq('requester_email', email)
    .order('created_at', { ascending: false })
    .limit(50);
  if (mineErr) return NextResponse.json({ error: mineErr.message }, { status: 500 });

  if (!admin) return NextResponse.json({ mine: mine ?? [], queue: null });

  const { data: queue, error: queueErr } = await supabaseAdmin
    .from('role_requests')
    .select(COLS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })   // oldest first: a queue, not a feed
    .limit(200);
  if (queueErr) return NextResponse.json({ error: queueErr.message }, { status: 500 });

  return NextResponse.json({ mine: mine ?? [], queue: queue ?? [] });
}, { routeName: 'admin/role-requests' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = session.user.email.toLowerCase();
  const body = (await req.json().catch(() => ({}))) as { roles?: string[]; reason?: string };

  const valid = new Set(ALL_ROLES as readonly string[]);
  const requested = Array.from(new Set((body.roles ?? []).filter((r) => valid.has(r))));
  if (requested.length === 0) {
    return NextResponse.json({ error: 'Choose at least one role to request.' }, { status: 400 });
  }

  // You cannot request `employee` — everyone already has it, and a request that grants nothing
  // wastes an admin's decision.
  const withoutBase = requested.filter((r) => r !== 'employee');
  if (withoutBase.length === 0) {
    return NextResponse.json({ error: 'Everyone already has the employee role.' }, { status: 400 });
  }

  // Drop anything they already hold. Asking for a role you have is not an error worth refusing —
  // it is just noise, and silently narrowing the request keeps the queue meaningful.
  const { data: me } = await supabaseAdmin
    .from('registered_users')
    .select('roles')
    .eq('email', email)
    .maybeSingle();
  const held = new Set(((me?.roles as string[] | null) ?? []).map(String));
  const toAsk = withoutBase.filter((r) => !held.has(r));
  if (toAsk.length === 0) {
    return NextResponse.json(
      { error: 'You already have every role you asked for.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('role_requests')
    .insert({
      requester_email: email,
      requested_roles: toAsk,
      reason: (body.reason ?? '').trim() || null,
    })
    .select(COLS)
    .single();

  if (error) {
    // The partial unique index (seed 581) fires when the same person already has an identical
    // request pending — a double tap on a slow connection. Said in words rather than as a
    // constraint name.
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json(
        { error: 'You already have a pending request for that. An admin will get to it.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}, { routeName: 'admin/role-requests' });
