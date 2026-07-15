// app/api/dnd/systems/[key]/entries/route.ts — browse / search / curate a single system's rules
// store. Everything here is SCOPED to `params.key`, so a query can never surface another system's
// entries. GET: list (`?kind=`) or semantic search (`?q=`). POST: add curated entries (signed-in).
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { listSystemEntries, searchSystemEntries, addSystemEntries, type SystemEntryInput } from '@/lib/dnd/system-store';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const kind = url.searchParams.get('kind')?.trim() || undefined;
  try {
    const entries = q ? await searchSystemEntries(params.key, q) : await listSystemEntries(params.key, kind);
    return NextResponse.json({ system: params.key, entries });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lookup failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const entries = (Array.isArray(body?.entries) ? body.entries : []) as SystemEntryInput[];
  if (!entries.length) return NextResponse.json({ error: 'No entries provided.' }, { status: 400 });
  try {
    const result = await addSystemEntries(params.key, entries);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ingest failed.' }, { status: 500 });
  }
}
