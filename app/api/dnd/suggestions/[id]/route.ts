// app/api/dnd/suggestions/[id]/route.ts — delete one suggestion (Phase T).
// The review page (/dnd/suggestions) is open on the hidden hub, matching the platform's
// open-access model; the client confirms before calling this.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await supabaseAdmin.from('dnd_suggestions').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not delete that suggestion.' }, { status: 500 });
  }
}
