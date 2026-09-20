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

/**
 * The call log.
 *
 * `scope` picks which log: `live` (the default — real customers), `test` (the bench), or `both`.
 * They are separated in the QUERY rather than in the browser, because a page that asks for 200 rows
 * and hides half of them is showing 100 while claiming 200, and the oldest fall off the end unseen.
 *
 * `search` narrows server-side. The browser ranks what comes back — see call-search.ts for why the
 * two halves are deliberately different strictnesses.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Number(params.get('limit')) || 100, 500);

  const asked = params.get('scope');
  const scope = asked === 'test' || asked === 'both' ? asked : 'live';

  const calls = await listCalls(supabaseAdmin, {
    limit,
    scope,
    search: params.get('search') ?? undefined,
  });
  return NextResponse.json({ calls, scope });
}, { routeName: 'admin/calls' });
