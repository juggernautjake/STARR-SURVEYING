// app/api/admin/calls/[id]/verdict — a person corrects what a call turned out to be.
//
// POST { verdict: 'person' | 'silent' | 'robocall' | 'spam' | 'hangup' | 'unknown' }
//
// The fail-safe behind "that was a real customer": the correction sticks (the automatic rules never
// overwrite a verdict a person set) and the number is recomputed straight away, so a customer
// wrongly judged silent rings through on their very next call. See lib/receptionist/screening.ts.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getCall } from '@/lib/receptionist/calls';
import { lookupRegistry } from '@/lib/receptionist/registry';
import { markCall } from '@/lib/receptionist/screening';

export const dynamic = 'force-dynamic';

const VERDICTS = ['person', 'silent', 'robocall', 'spam', 'hangup', 'unknown'] as const;
type Settable = (typeof VERDICTS)[number];

/** `withErrorHandler` forwards only `req`; the id is the segment before `verdict`. */
function idOf(req: NextRequest): string | null {
  const segs = new URL(req.url).pathname.split('/').filter(Boolean);
  return segs[segs.length - 2] ?? null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = idOf(req);
  if (!id) return NextResponse.json({ error: 'Missing call id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { verdict?: string };
  if (!(VERDICTS as readonly string[]).includes(body.verdict ?? '')) {
    return NextResponse.json({ error: `verdict must be one of: ${VERDICTS.join(', ')}.` }, { status: 400 });
  }
  await markCall(supabaseAdmin, id, body.verdict as Settable, session.user.email);
  const call = await getCall(supabaseAdmin, id);
  console.log(`[calls] ${session.user.email} marked call ${id} as ${body.verdict}`);
  return NextResponse.json({ call, number: call ? await lookupRegistry(supabaseAdmin, call.from_number) : null });
}, { routeName: 'admin/calls/[id]/verdict' });
