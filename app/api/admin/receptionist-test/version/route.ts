// app/api/admin/receptionist-test/version/route.ts — which receptionist answers LIVE calls.
//
//   GET                                   → { version, updatedBy, updatedAt }
//   PUT { version: 'answering-machine' | 'agent' }
//
// Owner, 2026-09-15: live calls get the answering machine "for now", while the full agent is honed
// privately on the test bench. This is the switch for the day it is ready — admins only, and the
// answering machine is what any missing or unreadable setting means (lib/receptionist/version.ts).
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { parseVersion } from '@/lib/receptionist/version';
import { readLiveVersion, writeLiveVersion } from '@/lib/receptionist/version-server';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  return NextResponse.json(await readLiveVersion(supabaseAdmin));
}, { routeName: 'admin/receptionist-test/version' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = (await req.json().catch(() => ({}))) as { version?: string };
  const version = parseVersion(body.version);
  if (!version) return NextResponse.json({ error: 'version must be "answering-machine" or "agent".' }, { status: 400 });
  const saved = await writeLiveVersion(supabaseAdmin, version, gate.email as string);
  console.log(`[receptionist] ${gate.email} set live calls to ${version}`);
  return NextResponse.json(saved);
}, { routeName: 'admin/receptionist-test/version' });
