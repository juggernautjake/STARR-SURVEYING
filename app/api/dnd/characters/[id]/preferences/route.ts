// app/api/dnd/characters/[id]/preferences/route.ts — set a character's own PLAYER PREFERENCES (S-2).
//
// The settings overhaul's per-character rules/display preferences (the `PlayerPreferences` shape:
// autoMechanics, exhaustion/long-rest models, equip limits, dice style, record mode, …). Like the
// layout and roller axes, they live inside the `data` blob (`data.playerPreferences`) rather than a
// column, so setting them is a read-patch-write of the one field and works for EVERY system.
//
// Twin of `/layout` and `/roller`: owner/DM-gated, and the body is run through
// `normalizePlayerPreferences` so only valid enum values survive — a partial or junk payload can never
// wedge the sheet. These are the PLAYER's side of the campaign-DM ∩ player fold; a DM lock
// (`playerCanChoose: false`) still wins at resolve time (`resolvePreferences`), so persisting a choice
// here can never override a locked campaign rule — the lock is enforced when the sheet reads, not here.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizePlayerPreferences } from '@/lib/dnd/preferences';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = (await req.json().catch(() => ({}))) as { preferences?: unknown };
  // Normalize to drop anything invalid; the result is the FULL set of chosen overrides to store (an
  // unset field simply falls back to the campaign value at resolve time).
  const preferences = normalizePlayerPreferences(body.preferences);

  const row = access.access.character as unknown as { id: string; data?: Record<string, unknown> | null };
  const data = { ...(row.data ?? {}), playerPreferences: preferences };
  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not update preferences.' }, { status: 500 });

  return NextResponse.json({ ok: true, preferences });
}
