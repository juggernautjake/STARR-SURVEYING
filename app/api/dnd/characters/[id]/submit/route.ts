// app/api/dnd/characters/[id]/submit/route.ts — a player submits a character to the DM for approval
// (IG builder Slice 4). Recomputes the flagged provenance inventory, applies the campaign's custom
// policy (a vanilla-only campaign blocks any non-DM-granted custom content, returning exactly what
// blocks it), and sets the character to `submitted`. Owner/DM-scoped via the write chokepoint.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { summarizeCharacterProvenance, type ElementKind } from '@/lib/dnd/provenance';
import { evaluateSubmission } from '@/lib/dnd/submission';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as {
    id: string; name: string; campaign_id: string | null; data: Character | null; system?: string; dm_granted?: unknown;
  };

  const system = normalizeSystem(row.system);
  const data = (row.data as Character | null) ?? blankCharacter(row.name);
  const dmGranted = (Array.isArray(row.dm_granted) ? row.dm_granted : []) as { kind?: ElementKind; name: string; grantedBy?: string | null; mechanics?: string | null }[];
  const summary = summarizeCharacterProvenance(data, system, dmGranted);

  // The campaign's custom policy (default allow when there's no campaign or the column is missing).
  let allowCustom = true;
  if (row.campaign_id) {
    const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('allow_custom').eq('id', row.campaign_id).maybeSingle();
    allowCustom = (camp as { allow_custom?: boolean } | null)?.allow_custom !== false;
  }

  const check = evaluateSubmission(allowCustom, summary);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, blocking: check.blocking, allowCustom }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ submission_status: 'submitted', custom_content: summary.elements, submitted_at: new Date().toISOString(), dm_review_notes: null })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true, status: 'submitted',
    counts: { vanilla: summary.vanilla.length, custom: summary.custom.length, dmGranted: summary.dmGranted.length },
  });
}
