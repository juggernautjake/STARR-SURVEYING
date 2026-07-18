// app/api/dnd/suggestions/[id]/route.ts — delete one suggestion (Phase T).
// The review page (/dnd/suggestions) is readable by anyone on the hidden hub, but MANAGING a
// request (deleting it) is owner-only — the board is the owner's queue of work to do, and an
// unauthenticated delete let anyone wipe others' requests. Gated on isDndOwner (Area A3).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, isDndOwner } from '@/lib/dnd/auth';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDndOwner(getDndSession())) {
    return NextResponse.json({ error: 'Only the owner can manage requests.' }, { status: 403 });
  }
  try {
    const { error } = await supabaseAdmin.from('dnd_suggestions').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not delete that suggestion.' }, { status: 500 });
  }
}

const STATUSES = new Set(['untouched', 'pending', 'complete']);

// Change a request's status (untouched → pending → complete). Owner-only, like DELETE.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDndOwner(getDndSession())) {
    return NextResponse.json({ error: 'Only the owner can manage requests.' }, { status: 403 });
  }
  let body: { status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const status = String(body.status ?? '').trim();
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'Status must be untouched, pending, or complete.' }, { status: 400 });
  }
  try {
    const { error } = await supabaseAdmin.from('dnd_suggestions').update({ status }).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json({ error: 'Could not update that request.' }, { status: 500 });
  }
}
