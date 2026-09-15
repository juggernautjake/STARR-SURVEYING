// app/api/admin/receptionist-test/version/route.ts — which receptionist answers LIVE calls.
//
//   GET                                   → { version, voice, updatedBy, updatedAt }
//   PUT { version?: 'answering-machine' | 'agent', voice?: <id from lib/receptionist/voices.ts> | null }
//
// Owner, 2026-09-15: live calls get the answering machine "for now", while the full agent is honed
// privately on the test bench. This is the switch for the day it is ready — admins only, and the
// answering machine is what any missing or unreadable setting means (lib/receptionist/version.ts).
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { parseVersion } from '@/lib/receptionist/version';
import { readLiveVersion, writeLiveSettings } from '@/lib/receptionist/version-server';
import { voiceById } from '@/lib/receptionist/voices';

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
  const body = (await req.json().catch(() => ({}))) as { version?: string; voice?: string | null };
  const version = 'version' in body ? parseVersion(body.version) : undefined;
  if ('version' in body && !version) return NextResponse.json({ error: 'version must be "answering-machine" or "agent".' }, { status: 400 });
  let voice: string | null | undefined;
  if ('voice' in body) {
    if (body.voice === null || body.voice === '') voice = null;
    else if (voiceById(body.voice)) voice = String(body.voice);
    else return NextResponse.json({ error: 'Unknown voice.' }, { status: 400 });
  }
  if (version === undefined && voice === undefined) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const saved = await writeLiveSettings(supabaseAdmin, { ...(version ? { version } : {}), ...(voice !== undefined ? { voice } : {}) }, gate.email as string);
  console.log(`[receptionist] ${gate.email} set live calls to ${saved.version}, voice ${saved.voice ?? 'default'}`);
  return NextResponse.json(saved);
}, { routeName: 'admin/receptionist-test/version' });
