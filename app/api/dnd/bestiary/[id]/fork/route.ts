// app/api/dnd/bestiary/[id]/fork/route.ts — make a catalogue creature your own (B3-1b).
//
// Owner: *"Each listing of a creature when viewed should have the option to create a variant of the
// creature … Variants can be saved and made public or private or be shared just like classes and feats and
// characters and stuff."*
//
// ── THE CATALOGUE IS IMMUTABLE; YOUR CHANGES FORK (G1) ───────────────────────────────────────────────
//
// This does NOT edit `dnd_creatures`. It writes a normal `dnd_homebrew` piece of kind `creature` with
// `forked_from` naming its ancestor, which is the design seed 462 chose and the reason the owner's
// "shareable just like classes and feats" comes for free: a forked creature is editable, private/public,
// adoptable and history-tracked by every mechanism the Studio already has. Nothing here re-implements any
// of it.
//
// It also keeps the catalogue re-importable. `npm run import:bestiary` upserts 829 rows on every run; if
// editing wrote back to `dnd_creatures`, the next import would silently clobber someone's work.
//
// ── WHY A DEDICATED ROUTE RATHER THAN THE GENERIC CREATE ─────────────────────────────────────────────
//
// `POST /api/dnd/homebrew` exists and could almost do this — but `pickCreatorWritable` deliberately drops
// `forked_from`, and it should: a client that can name its own ancestor can claim descent from anything.
// Provenance is a server-side fact. This route sets it because it is the only one that has verified the
// ancestor actually exists.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const variantId = typeof body?.variantId === 'string' ? body.variantId : null;

  const { data: creature, error } = await supabaseAdmin
    .from('dnd_creatures')
    .select('id, name, system, type, size, cr, statblock, description, source, licence, attribution')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: `Could not read that creature: ${error.message}` }, { status: 500 });
  if (!creature) return NextResponse.json({ error: 'No such creature.' }, { status: 404 });

  const c = creature as {
    id: string; name: string; system: string; type: string | null; size: string | null;
    cr: string | null; statblock: Record<string, unknown>; description: string | null;
    source: string; licence: string; attribution: string;
  };

  // Forking a VARIANT starts from the variant's numbers, not the parent's. A DM who clicked "make this
  // mine" on the Elite Ogre wants the elite as their starting point; handing them the base would silently
  // discard the adjustment they were looking at.
  let name = c.name;
  let statblock = c.statblock;
  let lineage = c.name;
  if (variantId) {
    const { data: v } = await supabaseAdmin
      .from('dnd_creature_variants').select('name, statblock, creature_id').eq('id', variantId).maybeSingle();
    const row = v as { name?: string; statblock?: Record<string, unknown>; creature_id?: string } | null;
    // The variant must belong to THIS creature. Without the check, a caller could graft any variant's
    // statblock onto any ancestor and the provenance line would be a lie.
    if (!row || row.creature_id !== c.id) {
      return NextResponse.json({ error: 'That variant does not belong to this creature.' }, { status: 400 });
    }
    name = row.name ?? name;
    statblock = row.statblock ?? statblock;
    lineage = `${row.name ?? c.name} (variant of ${c.name})`;
  }

  // ATTRIBUTION TRAVELS WITH THE CONTENT. The catalogue's licence requires it, and a fork is a derivative
  // work — so the credit is written into the copy's description rather than left behind on the row it came
  // from. `dnd_homebrew` has no licence columns, which is why it goes in the prose.
  const provenance =
    `Based on ${lineage} — ${c.source}${c.licence ? `, ${c.licence}` : ''}.` +
    (c.attribution ? ` ${c.attribution}` : '');
  const description = [c.description, provenance].filter(Boolean).join('\n\n');

  const { data: created, error: insertErr } = await supabaseAdmin
    .from('dnd_homebrew')
    .insert({
      owner_user_id: session.userId,
      kind: 'creature',
      system: c.system,
      // "Copy" rather than the bare name, so a DM's own list never has two identically-named rows and they
      // can tell at a glance which one they are editing.
      name: `${name} (my version)`,
      summary: `Your version of ${lineage}.`,
      description,
      tags: [c.type].filter(Boolean),
      payload: statblock,
      // PRIVATE AND DRAFT. A fork is a starting point, not a publication — the owner decides when it is
      // worth sharing, using the same visibility control every other Studio piece has.
      status: 'draft',
      visibility: 'private',
      forked_from: c.id,
      forked_from_label: lineage,
    })
    .select('id, name')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: `Could not create your version: ${insertErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ piece: created }, { status: 201 });
}
