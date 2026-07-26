// app/api/dnd/characters/[id]/exceptions/review/route.ts — the DM rules on ONE non-vanilla facet.
//
// The owner's ask: *"if the character is used in a campaign, the DM would need to be able to review all of
// the non-vanilla facets of the character and deny or approve them."*
//
// `SheetApprovalPanel` could already LIST a character's exceptions (S8c) but the only controls were
// approve-or-reject the whole submission — all-or-nothing on a character that might have one questionable
// feat and four fine ones. This is the per-facet ruling.
//
// A DENIAL DOES NOT DELETE THE PICK. Silently removing a player's content is the failure this codebase
// refuses everywhere else, and a denial the player never sees explains nothing. The pick stays, marked
// denied with the DM's note, so both sides can see exactly what was refused and why — and the player can
// change it themselves, which is the conversation a table actually wants.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter, normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import { reviewExceptions, type ExceptionReview } from '@/lib/dnd/slots/entitlement';
import { sheetExceptions } from '@/lib/dnd/slots/sheet-exceptions';

/** Where each system keeps its choice ledger. Mirrors `sheet-exceptions.ts` — one place knows the keys. */
const LEDGER: Record<string, string> = {
  'dnd5e-2014': 'build',
  'dnd5e-2024': 'build',
  pathfinder2e: 'pf2Build',
  'intuitive-games': 'igBuild',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  // DM ONLY. A player marking their own exception "approved" would make the flag worthless — the whole
  // point is that someone else signed it off. `requireCharacterWrite` grants the owner too, so the DM
  // check is separate and explicit rather than implied by write access.
  if (!access.access.isDM) {
    return NextResponse.json({ error: 'Only the DM can rule on a character\'s exceptions.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; decision?: unknown; note?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const decision = body.decision === 'approved' || body.decision === 'denied' ? body.decision : null;
  if (!name || !decision) {
    return NextResponse.json({ error: 'Body must be { name, decision: "approved" | "denied", note? }.' }, { status: 400 });
  }
  // A denial without a reason is not a review — the player has nothing to act on. Approval needs none.
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (decision === 'denied' && !note) {
    return NextResponse.json({ error: 'Say why you are denying it, so the player knows what to change.' }, { status: 400 });
  }

  const row = access.access.character as unknown as { id: string; name: string; system?: string; data?: unknown };
  const system = normalizeSystem(row.system);
  const key = LEDGER[system];
  if (!key) return NextResponse.json({ error: 'This system does not record exceptions.' }, { status: 400 });

  const data = normalizeCharacter((row.data as unknown) ?? blankCharacter(row.name)) as unknown as Record<string, unknown>;
  const block = (data[key] ?? {}) as { choices?: unknown[] };
  const before = sheetExceptions(data, system);
  if (!before.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) {
    // Ruling on something that is not there would write a decision nobody can see.
    return NextResponse.json({ error: `“${name}” is not a recorded exception on this character.` }, { status: 404 });
  }

  const review: ExceptionReview = {
    decision,
    by: 'DM',
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
  };
  const next = {
    ...data,
    [key]: { ...block, choices: reviewExceptions(block.choices as { exception?: unknown }[] | undefined, name, review) },
  };

  const { error } = await supabaseAdmin.from('dnd_characters').update({ data: next }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not record the ruling.' }, { status: 500 });

  // The BADGE does not move. An approved exception is still an exception — the character still departed
  // from the rules, and the DM saying "fine" records consent rather than rewriting history. Collapsing it
  // back to plain vanilla would erase the very thing the next DM needs to see.
  return NextResponse.json({ ok: true, exceptions: sheetExceptions(next, system) });
}
