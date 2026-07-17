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
