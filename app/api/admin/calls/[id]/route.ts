// app/api/admin/calls/[id]/route.ts — one call, and the few things an admin can change on it.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getCall, updateCall } from '@/lib/receptionist/calls';
import { lookupRegistry } from '@/lib/receptionist/registry';
import { regionText } from '@/lib/receptionist/area-codes';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

/** `withErrorHandler` forwards only `req`; the id is the last path segment (same as leads/[id]). */
function idOf(req: NextRequest): string | null {
  const segs = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segs[segs.length - 1];
  return id && id !== 'calls' ? id : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = idOf(req);
  if (!id) return NextResponse.json({ error: 'Missing call id' }, { status: 400 });
  const call = await getCall(supabaseAdmin, id);
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The number behind the call — who it is, what its calls have been, how the line treats it — and
  // its other calls, so the page can answer "has this happened before?" without a second trip.
  const [number, others] = await Promise.all([
    lookupRegistry(supabaseAdmin, call.from_number),
    supabaseAdmin.from('phone_calls')
      .select('id, started_at, answered_by, caller_verdict, screened_as, duration_seconds, summary')
      .eq('from_number', call.from_number).eq('is_test', call.is_test).neq('id', call.id)
      .order('started_at', { ascending: false }).limit(25),
  ]);
  return NextResponse.json({ call, number, otherCalls: others.data ?? [], region: regionText(call.from_number) });
}, { routeName: 'admin/calls/[id]' });

/** Admins can correct what the receptionist heard: caller name, callback number, kind, notes. */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const id = idOf(req);
  if (!id) return NextResponse.json({ error: 'Missing call id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = ['caller_name', 'callback_number', 'kind', 'details', 'property_address', 'service', 'project_id'] as const;
  const patch: Record<string, string | null> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k] == null ? null : String(body[k]).slice(0, 2000);
  const current = await getCall(supabaseAdmin, id);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const call = await updateCall(supabaseAdmin, current.call_sid, patch);
  return NextResponse.json({ call });
}, { routeName: 'admin/calls/[id]' });
