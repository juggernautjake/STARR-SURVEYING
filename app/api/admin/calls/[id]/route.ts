// app/api/admin/calls/[id]/route.ts — one call, and the few things an admin can change on it.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getCall, updateCall } from '@/lib/receptionist/calls';

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
  return NextResponse.json({ call });
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
