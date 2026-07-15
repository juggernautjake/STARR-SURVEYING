// app/api/dnd/characters/[id]/ingest/route.ts — AI import ingestion (Phase M4). Reads
// the character's uploaded source files (text/PDF/images) + notes, asks Claude to fill
// the generic sheet via the edit_sheet tool, applies the edits, and records whatever
// couldn't be mapped in import_notes (surfaced to the owner). DM/owner-gated.
import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { normalizeBuildMode, buildModeInstruction } from '@/lib/dnd/build-modes';

const IMG = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXTY = /\.(txt|md|csv|json|text)$/i;
const MAX_FILES = 8;

const SYSTEM =
  'You are importing a Dungeon & Dragons character into a generic 5e character sheet from the ' +
  "player's uploaded source materials (exported sheets, PDFs, screenshots, notes). Extract as much " +
  'as you can and call edit_sheet: name, level, all six ability scores (raw numbers), AC/HP/speed, ' +
  'save proficiencies, notable skills, every attack, class/species/feat features, and notable inventory. ' +
  'Prefer accuracy over guessing. Put anything you CANNOT represent on the generic sheet — homebrew ' +
  'mechanics, unique resources, unreadable files, lore with no field — into the `unmapped` array.';

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('id, campaign_id, owner_user_id, name, data, system, build_mode').eq('id', params.id).maybeSingle();
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  const row = ch as { id: string; campaign_id: string; owner_user_id: string | null; name: string; data: Character | null; system: string | null; build_mode: string | null };
  const isDM = (await getCampaignRole(row.campaign_id)) === 'dm';
  if (!isDM && row.owner_user_id !== session.userId) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const { data: ups } = await supabaseAdmin.from('dnd_character_uploads').select('url, filename, mime, kind').eq('character_id', params.id).eq('kind', 'source').order('created_at', { ascending: true }).limit(MAX_FILES);
  const uploads = (ups ?? []) as { url: string; filename: string | null; mime: string | null; kind: string }[];

  // Build the multimodal content blocks the AI reads.
  const content: unknown[] = [{ type: 'text', text: `Import this character (row name: "${row.name}"). Use every source below.` }];
  const unreadable: string[] = [];
  for (const u of uploads) {
    const name = u.filename ?? 'file';
    const mime = u.mime ?? '';
    if (mime.startsWith('text/') || TEXTY.test(name)) {
      const b = await fetchBytes(u.url);
      if (b) content.push({ type: 'text', text: `--- ${name} ---\n${b.toString('utf8').slice(0, 20000)}` });
    } else if (IMG.has(mime)) {
      const b = await fetchBytes(u.url);
      if (b) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b.toString('base64') } });
    } else if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
      const b = await fetchBytes(u.url);
      if (b) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.toString('base64') } });
    } else {
      unreadable.push(`${name} — format not machine-readable during import; review it manually.`);
    }
  }

  // System-scoped grounding: retrieve ONLY the character's system's rules and forbid cross-system /
  // invented mechanics. The query is the sources' text so retrieval is relevant to this character.
  const queryText = [
    row.name,
    ...content.filter((b): b is { type: 'text'; text: string } => (b as { type?: string }).type === 'text').map((b) => b.text),
  ].join('\n').slice(0, 6000);
  const grounding = await systemGroundingBlock(row.system, queryText).catch(() => ({ instruction: '', block: '', matched: 0 }));
  if (grounding.block) content.push({ type: 'text', text: grounding.block });
  const modeInstruction = buildModeInstruction(normalizeBuildMode(row.build_mode));

  let result;
  try {
    result = await dndToolCall<{ edits: SheetEdit[]; unmapped?: string[]; questions?: string[] }>({
      system: [SYSTEM, grounding.instruction, modeInstruction].filter(Boolean).join('\n\n'),
      user: [{ role: 'user', content: content as Anthropic.MessageParam['content'] }],
      tools: [SHEET_EDIT_TOOL],
      toolChoice: { type: 'tool', name: 'edit_sheet' },
      maxTokens: 4096,
      temperature: 0.3,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI ingestion failed.' }, { status: 502 });
  }

  const edits = Array.isArray(result?.input?.edits) ? result!.input.edits : [];
  const updated = applySheetEdits(row.data ?? blankCharacter(row.name), edits);
  const unmapped = [...(result?.input?.unmapped ?? []), ...unreadable];
  const importNotes = unmapped.length ? unmapped.map((u) => `• ${u}`).join('\n') : null;
  // Open questions the AI needs the user to resolve (gaps / ambiguity / conflicting uploads).
  const questions = (Array.isArray(result?.input?.questions) ? result!.input.questions : [])
    .map((q) => String(q).trim())
    .filter(Boolean);

  const { error: upErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: updated, name: updated.meta.name || row.name, import_notes: importNotes, build_questions: questions })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, editCount: edits.length, unmapped, questions });
}
