// app/api/dnd/characters/[id]/ai-edit/route.ts — AI sheet build/edit (Phase I2). The
// DM (or owner) sends a natural-language instruction; Claude calls the edit_sheet tool
// (schema = our edit vocabulary), we apply the edits to the character's data, persist,
// and log each edit to dnd_sheet_edits. Powers G2 (build) and I3 (refine).
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, editPath, editOldValue, validateSheetEdits, revertBatch, SHEET_EDIT_TOOL, type SheetEdit, type AuditedEdit } from '@/lib/dnd/sheet-edits';
import { recentBatchDigest, latestUndoableBatch, type EditHistoryRow } from '@/lib/dnd/edit-history';
import { applyLayoutEdits, LAYOUT_EDIT_TOOL, type LayoutEdit } from '@/lib/dnd/layout-edits';
import { normalizeLayout } from '@/lib/dnd/custom-sheet';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { validateCharacterForSystem, violationsSummary } from '@/lib/dnd/system-validate';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

// Routing hint so the agent picks the right tool: mechanics → edit_sheet, look/layout →
// customize_layout. Both only ever touch THIS character (Slice 8b).
const LAYOUT_ROUTING =
  'If the user asks to change the SHEET ITSELF — its layout, sections, blocks, widgets, styling, colors, ' +
  'fonts, or format (move/resize/restyle/add/remove elements, set CSS) — call customize_layout. If they ask ' +
  'to change the CHARACTER — feats, abilities, mechanics, transformations, spells, attacks, stats — call ' +
  'edit_sheet. If they ask to UNDO, REVERT, or PUT BACK your most recent change (or "take my character back ' +
  'to what it was"), call undo_last_change. Never touch anything outside this character.';

/** The tool the model picks to undo its own most recent change to this character. No inputs — the route
 *  reverts the latest un-reverted AI batch. */
const UNDO_TOOL = {
  name: 'undo_last_change',
  description: 'Undo the most recent change you made to this character — reverts your last edit batch, ' +
    'restoring the character to how it was before. Use when the user says undo, revert, put it back, or ' +
    'take my character back to what it was.',
  input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
};

/** A compact index of the current custom blocks so the agent can target them by position. */
function layoutSummary(raw: unknown): string {
  const { blocks } = normalizeLayout(raw);
  if (!blocks.length) return '(none yet — a layout edit starts a custom sheet)';
  return blocks.map((b, i) => `${i}:${b.type}`).join(', ');
}

// A system-agnostic architect prompt; the per-character system grounding (Slice 3) is
// folded in below so edits stay strictly within the character's chosen ruleset and never
// borrow from — or invent — another system's mechanics (Slice 8: the grounded edit path).
const SYSTEM =
  'You are a tabletop RPG character architect. You receive a character sheet (JSON) and an instruction, ' +
  'and you make ONLY the change the user asked for — adding or altering feats, abilities, mechanics, ' +
  'transformations, spells, attacks, features, resources, stats, or inventory. Call the edit_sheet tool ' +
  'with the minimal, valid set of structured edits that satisfies the instruction. Ability scores are raw ' +
  'values (e.g. 16), never modifiers. When asked to build a full character from scratch, produce a complete, ' +
  'playable, level-appropriate kit: name, level, all six abilities, AC/HP/speed, save proficiencies, a few ' +
  'skills, one or more attacks, signature features, and notable inventory. Do not touch anything the user did ' +
  'not ask about.';

function sheetDigest(c: Character): string {
  return JSON.stringify({
    name: c.meta.name, level: c.meta.level, className: c.meta.className, species: c.meta.species,
    abilities: c.abilities,
    combat: { ac: c.combat.ac, maxHp: c.combat.maxHp, speed: c.combat.speed },
    saves: Object.fromEntries(Object.entries(c.saves).filter(([, s]) => s.proficient).map(([k]) => [k, true])),
    attacks: c.attacks.map((a) => a.name),
    features: c.features.map((f) => f.name),
    inventory: c.inventory.map((i) => i.name),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const { instruction } = await req.json().catch(() => ({}));
  if (!instruction || !String(instruction).trim()) return NextResponse.json({ error: 'An instruction is required.' }, { status: 400 });

  // The single write chokepoint (Slice 8b boundary): keyed to THIS character id + the
  // caller's owner/assigned-player/DM authorization. No path writes elsewhere.
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character;
  const isDM = access.access.isDM;
  const instr = String(instruction).trim();

  const current: Character = (row.data as unknown as Character | null) ?? blankCharacter(row.name);

  // System grounding (Slice 3/8): edits must stay inside the character's chosen system —
  // no cross-system rules, no invented mechanics.
  const grounding = await systemGroundingBlock((row as { system?: string }).system, instr).catch(() => null);

  // Recent edit history (history/undo C): lets the AI answer "what did you change?" and gives
  // "undo that" a target. Best-effort — a missing table/column just yields an empty digest.
  const { data: histRows } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('batch_id, source, field_path, summary, created_at')
    .eq('character_id', params.id)
    .order('created_at', { ascending: false })
    .limit(80);
  const history = (histRows ?? []) as EditHistoryRow[];
  const historyDigest = recentBatchDigest(history);

  let result;
  try {
    // The agent picks the right tool per request: edit_sheet for MECHANICS (Slice 8) or
    // customize_layout for LAYOUT/STYLING of the custom sheet (Slice 12: add/remove/move/
    // resize/restyle blocks, set CSS). Both are scoped to this one character (Slice 8b).
    result = await dndToolCall<{ summary?: string; edits: unknown[] }>({
      system: [SYSTEM, LAYOUT_ROUTING, grounding?.instruction].filter(Boolean).join('\n\n'),
      user: [
        `Current sheet:\n${sheetDigest(current)}`,
        `Current custom layout blocks: ${layoutSummary((row as { custom_layout?: unknown }).custom_layout)}`,
        historyDigest || null,
        grounding?.block || null,
        `Instruction: ${instr}`,
      ].filter(Boolean).join('\n\n'),
      tools: [SHEET_EDIT_TOOL, LAYOUT_EDIT_TOOL, UNDO_TOOL],
      toolChoice: { type: 'auto' },
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI call failed.' }, { status: 502 });
  }
  // ── Undo path (history/undo C1): the user asked to undo/revert/put it back ────────────
  if (result?.name === 'undo_last_change') {
    const target = latestUndoableBatch(history);
    if (!target) {
      return NextResponse.json({ ok: true, kind: 'undo', reverted: 0, batchId: null, summary: 'There is no recent change of mine to undo on this character.' });
    }
    // The rows we selected for the digest don't carry old_value/new_value, so fetch the full batch.
    const { data: full } = await supabaseAdmin
      .from('dnd_sheet_edits')
      .select('old_value, new_value, created_at')
      .eq('character_id', params.id)
      .eq('batch_id', target.batchId)
      .order('created_at', { ascending: true });
    const audited = ((full ?? []) as { old_value: unknown; new_value: SheetEdit | null }[])
      .filter((r): r is { old_value: unknown; new_value: SheetEdit } => !!r.new_value)
      .map((r): AuditedEdit => ({ edit: r.new_value, oldValue: r.old_value }));
    if (!audited.length) return NextResponse.json({ ok: true, kind: 'undo', reverted: 0, batchId: null, summary: 'There is no recent change of mine to undo on this character.' });

    const reverted = revertBatch(current, audited);
    const { error: rErr } = await supabaseAdmin.from('dnd_characters').update({ data: reverted, name: reverted.meta?.name || row.name }).eq('id', params.id);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    await supabaseAdmin.from('dnd_sheet_edits').insert({
      character_id: params.id, editor_user_id: session.userId, is_dm: isDM,
      field_path: `revert-batch:${target.batchId}`, old_value: null, new_value: null, scope: 'permanent',
      source: 'revert', summary: `Undid a change of ${audited.length} edit(s)${target.summary ? `: ${target.summary}` : ''}`,
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, kind: 'undo', reverted: audited.length, batchId: target.batchId, summary: `Undone — reverted my last change${target.summary ? ` (${target.summary})` : ''}. Your character is back to how it was.` });
  }

  const editsRaw = result?.input?.edits;
  if (!Array.isArray(editsRaw) || editsRaw.length === 0) return NextResponse.json({ error: 'The AI did not return any edits.' }, { status: 502 });

  // ── Layout / styling path (Slice 12) ───────────────────────────────────────────────
  if (result?.name === 'customize_layout') {
    const { layout, css } = applyLayoutEdits(
      (row as { custom_layout?: unknown }).custom_layout,
      (row as { custom_css?: string | null }).custom_css,
      editsRaw as LayoutEdit[],
    );
    // Applying a layout edit switches the character onto its custom sheet so the change shows.
    const { error: upErr } = await supabaseAdmin
      .from('dnd_characters')
      .update({ custom_layout: layout, custom_css: css, sheet_type: 'custom' })
      .eq('id', params.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'layout', summary: result?.input?.summary ?? null, editCount: editsRaw.length, blockCount: layout.blocks.length });
  }

  // ── Mechanics path (Slice 8) ───────────────────────────────────────────────────────
  const edits = editsRaw as SheetEdit[];
  // An item's effects that the registry refused were DROPPED by applySheetEdits (never coerced);
  // surface them so a bonus that didn't take is visible, not silently missing (Slice 14).
  const rejectedEffects = validateSheetEdits(edits);
  const updated = applySheetEdits(current, edits);
  const { error: upErr } = await supabaseAdmin.from('dnd_characters').update({ data: updated, name: updated.meta.name || row.name }).eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit each edit (best-effort — don't fail the request if logging fails). Capture old_value from
  // the PRE-edit character (Slice 26), so the DM review queue can show the diff and Revert can restore
  // the prior value — computed against `current`, before any edit in the batch applied. Every edit from
  // THIS request shares one `batch_id` so the whole change can be undone as a unit (history/undo A2).
  const batchId = randomUUID();
  const batchSummary = (result?.input?.summary ?? '').toString().slice(0, 500) || `${edits.length} edit(s)`;
  await supabaseAdmin.from('dnd_sheet_edits').insert(
    edits.map((e) => ({ character_id: params.id, editor_user_id: session.userId, is_dm: isDM, field_path: editPath(e), old_value: (editOldValue(current, e) ?? null) as unknown, new_value: e as unknown, scope: 'permanent', batch_id: batchId, source: 'ai', summary: batchSummary })),
  ).then(() => {}, () => {});

  // Safety net (Slice 3): flag anything that doesn't belong to the character's system so a wrong-system
  // mechanic is surfaced to the user rather than silently kept.
  const violations = validateCharacterForSystem(updated, normalizeSystem((row as { system?: string }).system));
  const summary = [
    result?.input?.summary ?? null,
    violations.length ? `⚠ Check: ${violationsSummary(violations)}` : null,
    rejectedEffects.length ? `⚠ Dropped ${rejectedEffects.length} invalid effect(s): ${rejectedEffects.map((r) => r.reason).join(' ')}` : null,
  ].filter(Boolean).join('\n');
  // Return the batch id + a compact preview so the chat can offer an immediate "Undo this change"
  // button bound to exactly the edits this request made (history/undo A3).
  const editsPreview = edits.map((e) => ({ op: e.op, path: editPath(e) }));
  return NextResponse.json({ ok: true, kind: 'mechanics', summary: summary || null, editCount: edits.length, name: updated.meta.name, violations, rejectedEffects, batchId, batchSummary, editsPreview });
}
