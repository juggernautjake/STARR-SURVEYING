// app/api/admin/caller-registry/route.ts — read and edit the caller ID memory.
//
// Owner, 2026-09-16: "Please build out the whole infrastructure for the call id rememberance log
// that attaches call info and names and stuff to a number."
//
// The receptionist writes to this table by itself after every real call (lib/receptionist/finish.ts
// → rememberCaller), but everything it learns that way is `observed` — overheard on a call, good
// enough to recognise a name, not good enough to greet someone by it. This route is the other half:
// the place a PERSON puts a name to a number on purpose, which is what makes the receptionist
// willing to say "is this Jacob?" to one number and to no other.
//
// GET    ?search=      the list, most recently heard from first
// PUT    { phone, … }  save one entry. A name typed here is verified by definition.
// DELETE ?phone=       forget a number completely (it will be re-learned on the next call)
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  listRegistry, saveRegistryEntry, deleteRegistryEntry, lookupRegistry, registryKey,
  RELATIONSHIPS, type Relationship,
} from '@/lib/receptionist/registry';

export const dynamic = 'force-dynamic';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email as string };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const g = await gate();
  if (g.error) return g.error;
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');
  if (phone) {
    const entry = await lookupRegistry(supabaseAdmin, phone);
    return NextResponse.json({ entry });
  }
  const entries = await listRegistry(supabaseAdmin, {
    search: searchParams.get('search') ?? undefined,
    limit: Number(searchParams.get('limit')) || undefined,
  });
  return NextResponse.json({ entries, relationships: RELATIONSHIPS });
}, { routeName: 'admin/caller-registry' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const g = await gate();
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string; displayName?: string | null; email?: string | null; company?: string | null;
    relationship?: string; notes?: string | null; neverAssume?: boolean;
  };
  if (!registryKey(body.phone)) {
    return NextResponse.json({ error: 'A ten-digit US phone number is required.' }, { status: 400 });
  }
  if (body.relationship !== undefined && !(RELATIONSHIPS as readonly string[]).includes(body.relationship)) {
    return NextResponse.json({ error: `relationship must be one of: ${RELATIONSHIPS.join(', ')}.` }, { status: 400 });
  }
  const entry = await saveRegistryEntry(supabaseAdmin, body.phone as string, {
    ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.company !== undefined ? { company: body.company } : {}),
    ...(body.relationship !== undefined ? { relationship: body.relationship as Relationship } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.neverAssume !== undefined ? { neverAssume: body.neverAssume } : {}),
  }, g.email as string);
  console.log(`[caller-registry] ${g.email} saved ${entry.phone} (${entry.displayName ?? 'no name'}, ${entry.relationship})`);
  return NextResponse.json({ entry });
}, { routeName: 'admin/caller-registry' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const g = await gate();
  if (g.error) return g.error;
  const phone = new URL(req.url).searchParams.get('phone') ?? '';
  if (!registryKey(phone)) return NextResponse.json({ error: 'A ten-digit US phone number is required.' }, { status: 400 });
  await deleteRegistryEntry(supabaseAdmin, phone);
  console.log(`[caller-registry] ${g.email} forgot ${registryKey(phone)}`);
  return NextResponse.json({ ok: true });
}, { routeName: 'admin/caller-registry' });
