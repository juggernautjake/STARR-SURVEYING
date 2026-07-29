// app/api/dnd/characters/[id]/duplicate/route.ts — copy a character into a NEW one (P4-1b).
//
// **Duplicate is not "new variant", and conflating them is the mistake this route exists to avoid.** A
// variant (`POST /variants` with `op: 'fork'`) is another VERSION inside the same character — same row, same
// identity, up to 20 versions, tracked with git-like lineage. A duplicate is a **separate character**: its
// own row, its own id, no lineage back. "What if I'd built her as a Wizard" is a variant; "I want a second
// character based on this one" is a duplicate, and the index needs the second.
//
// The copy is deliberately SHALLOW in the relational sense: the sheet data comes across, and none of the
// child rows do. See the note on `ownership` below.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // WRITE access, not read — and this was tightened after `character-mutation-authorization` flagged it.
  //
  // The first version accepted read access, reasoning that duplicating someone else's PUBLIC character is
  // harmless because the new row is owned by the caller. That is probably true, but it is a feature nobody
  // asked for: P4-1b is about managing *your own* index. The guard's own header warns that its failure mode
  // is "loosening a guard to make a correct route pass", and weakening a character-scoped write to enable
  // an unrequested capability is exactly that trade in the wrong direction. If copying a public character
  // is ever wanted, it deserves its own slice and its own thinking about visibility.
  const res = await requireCharacterWrite(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) return NextResponse.json({ error: 'You cannot copy this character.' }, { status: 403 });

  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const src = res.access.character;
  // `DndCharacterRow` does not declare `system` even though the column exists and P1-1/P3-7 both read it.
  // Selecting it here rather than widening a shared type mid-slice — the type is used in a dozen places and
  // this route is not the right context to find out what else that change touches.
  const { data: sysRow } = await supabaseAdmin
    .from('dnd_characters')
    .select('system')
    .eq('id', params.id)
    .maybeSingle();
  const system = (sysRow as { system: string | null } | null)?.system ?? null;

  const body = await req.json().catch(() => ({}));
  const requested = String(body?.name ?? '').trim();
  const name = (requested || `${src.name ?? 'Character'} (copy)`).slice(0, 80);

  const { data: created, error } = await supabaseAdmin
    .from('dnd_characters')
    .insert({
      name,
      system,
      sheet_type: src.sheet_type ?? null,
      data: src.data ?? {},
      // OWNERSHIP RESETS TO THE CALLER. Copying `owner_user_id` would hand someone a character they cannot
      // delete, and copying `played_by_user_id` would silently assign a stranger to play it.
      owner_user_id: session.userId,
      played_by_user_id: null,
      // NOT copied, each for its own reason:
      //  · `campaign_id` — a duplicate joins no campaign until someone puts it in one. Inheriting the
      //    source's campaign would drop an unapproved character into a table's roster.
      //  · `is_npc` / `roster_role` — those are a DM's editorial decisions about THAT campaign's roster.
      //  · art/token — the images belong to the original's upload ledger (P2-7); pointing a second row at
      //    them would mean deleting one character strips the other's portrait.
      is_npc: false,
    })
    .select('id, name')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Could not duplicate that character.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, character: created });
}
