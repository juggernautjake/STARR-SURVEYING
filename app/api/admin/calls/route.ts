// app/api/admin/calls/route.ts — the call log for /admin/calls.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { listCalls } from '@/lib/receptionist/calls';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 100, 500);
  const calls = await listCalls(supabaseAdmin, limit);
  return NextResponse.json({ calls });
}, { routeName: 'admin/calls' });
