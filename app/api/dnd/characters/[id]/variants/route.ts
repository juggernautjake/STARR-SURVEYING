// app/api/dnd/characters/[id]/variants/route.ts — the character VARIANT-TRACKER endpoint (VT).
//
// A character holds up to MAX_VARIANTS versions (the "system slots" from lib/dnd/system-variants). This route
// adds the tracker operations on top of the existing switch/rename/delete (which stay on /system):
//   • fork         — branch a NEW variant off the sheet the user is viewing (git-like lineage), make it
//                    active, and (best-effort) generate its AI summary. Refused at the 20-version cap.
//   • summary      — (re)generate + persist the AI summary for one sheet (the "saved after changes" trigger).
//   • set-campaign — attach a variant to a campaign (drives the Campaign tag).
// Owner / assigned-player / DM scoped via requireCharacterWrite — it only ever writes this one character.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndComplete, dndAiConfigured } from '@/lib/dnd/ai';
import { normalizeSystem } from '@/lib/dnd/systems';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import {
  readVariants, readActiveSlotMeta, withActiveSlotMeta, resolveOriginSlotId, isAtVariantCap,
  forkSheet, switchToSlot, beginDraft, commitDraftToOriginal, promoteDraftToVariant, discardDraft,
  MAX_VARIANTS, variantSystemOf, type ActiveSheet, type SystemVariants,
} from '@/lib/dnd/system-variants';
import { generateVariantSummary, type SummaryInputs } from '@/lib/dnd/variant-summary';

interface CharRow {
  id: string; name: string; data: unknown; system?: string; sheet_type: string;
  custom_layout?: unknown; custom_css?: string | null; system_variants?: unknown;
  art_url?: string | null; campaign_id?: string | null;
}

/** Fold the active sheet's live columns + slot metadata into an ActiveSheet (mirrors /system). */
function activeFromRow(row: CharRow): ActiveSheet {
  const meta = readActiveSlotMeta(row.system_variants);
  return {
    system: normalizeSystem(row.system),
    data: row.data ?? blankCharacter(row.name),
    sheet_type: row.sheet_type || 'default',
    custom_layout: row.custom_layout,
    custom_css: row.custom_css ?? '',
    ...(meta.slotId ? { slotId: meta.slotId } : {}),
    kind: meta.kind,
    ...(meta.name ? { name: meta.name } : {}),
    artUrl: row.art_url ?? meta.artUrl ?? null,
    ...(meta.parentSlotId ? { parentSlotId: meta.parentSlotId } : {}),
    ...(meta.campaignId != null ? { campaignId: meta.campaignId } : {}),
    ...(meta.summary != null ? { summary: meta.summary } : {}),
    ...(meta.summaryUpdatedAt ? { summaryUpdatedAt: meta.summaryUpdatedAt } : {}),
    ...(meta.summaryHash ? { summaryHash: meta.summaryHash } : {}),
  };
}

/** The active sheet's slot id as the UI/route sees it (real id or the `active:` marker). */
function activeSlotIdOf(active: ActiveSheet): string {
  return active.slotId ?? `active:${normalizeSystem(active.system)}`;
}

/** The {data, system} for a given slot id (active or stored), or null if it doesn't exist. */
function sheetInputsFor(slotId: string, active: ActiveSheet, variants: SystemVariants): SummaryInputs | null {
  if (slotId === activeSlotIdOf(active)) return { data: active.data, system: normalizeSystem(active.system) };
  const v = variants[slotId];
  return v ? { data: v.data, system: variantSystemOf(v, slotId) } : null;
}

/** Persist a new active-sheet transition (full column set) — matches the /system switch/fork writes. Art is
 *  non-destructive (falls back to the current column). */
function persistActiveTransition(id: string, row: CharRow, next: { active: ActiveSheet; variants: SystemVariants }) {
  return supabaseAdmin.from('dnd_characters').update({
    system: next.active.system,
    data: next.active.data,
    sheet_type: next.active.sheet_type,
    custom_layout: next.active.custom_layout ?? { blocks: [] },
    custom_css: next.active.custom_css ?? '',
    art_url: next.active.artUrl ?? row.art_url ?? null,
    system_variants: withActiveSlotMeta(next.variants, next.active),
  }).eq('id', id);
}

/** Best-effort AI summary regen for the resulting active sheet vs the character's origin; mutates next.active. */
async function regenActiveSummary(next: { active: ActiveSheet; variants: SystemVariants }): Promise<void> {
  if (!dndAiConfigured()) return;
  try {
    const originId = resolveOriginSlotId(next.active, next.variants);
    const originInputs = sheetInputsFor(originId, next.active, next.variants);
    const gen = await generateVariantSummary({ data: next.active.data, system: normalizeSystem(next.active.system) }, originInputs, dndComplete);
    next.active.summary = gen.summary;
    next.active.summaryUpdatedAt = new Date().toISOString();
    next.active.summaryHash = gen.hash;
  } catch { /* summaries are best-effort */ }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as CharRow;

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : 'fork';

  const active = activeFromRow(row);
  const variants = readVariants(row.system_variants);
  const activeSlotId = activeSlotIdOf(active);

  // ── FORK — branch a new variant off the viewed (or a named) sheet, make it active. ──
  if (action === 'fork') {
    // The 20-version cap (owner): at the limit, refuse with a message to delete one first.
    if (isAtVariantCap(active, variants)) {
      return NextResponse.json({
        error: `You’ve hit the ${MAX_VARIANTS}-version limit for this character. Delete a variant to make room for a new one.`,
        atCap: true,
      }, { status: 409 });
    }
    const fromSlotId = typeof body?.fromSlotId === 'string' && body.fromSlotId ? body.fromSlotId : activeSlotId;
    let forked;
    try { forked = forkSheet(active, variants, { fromSlotId, name: typeof body?.name === 'string' ? body.name : undefined }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not fork that sheet.' }, { status: 400 }); }

    // Make the fork active so the user immediately edits it (matches the spec: fork → into the editor).
    const next = switchToSlot(forked.active, forked.variants, forked.newSlotId);

    // Best-effort summary for the freshly-created variant (creation is a summary trigger). The original for
    // comparison is whichever sheet is the lineage root. Failure never blocks the fork.
    if (dndAiConfigured()) {
      try {
        const originId = resolveOriginSlotId(next.active, next.variants);
        const originInputs = sheetInputsFor(originId, next.active, next.variants);
        const gen = await generateVariantSummary(
          { data: next.active.data, system: normalizeSystem(next.active.system) },
          originInputs,
          dndComplete,
        );
        next.active.summary = gen.summary;
        next.active.summaryUpdatedAt = new Date().toISOString();
        next.active.summaryHash = gen.hash;
      } catch { /* summary is best-effort; leave it unset for the browser to generate on demand */ }
    }

    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({
        system: next.active.system,
        data: next.active.data,
        sheet_type: next.active.sheet_type,
        custom_layout: next.active.custom_layout ?? { blocks: [] },
        custom_css: next.active.custom_css ?? '',
        art_url: next.active.artUrl ?? row.art_url ?? null,
        system_variants: withActiveSlotMeta(next.variants, next.active),
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'fork', slotId: forked.newSlotId, system: next.active.system });
  }

  // ── SUMMARY — (re)generate + persist the AI summary for one sheet. ──
  if (action === 'summary') {
    if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured — summaries are unavailable.' }, { status: 503 });
    const slotId = typeof body?.slotId === 'string' && body.slotId ? body.slotId : activeSlotId;
    const target = sheetInputsFor(slotId, active, variants);
    if (!target) return NextResponse.json({ error: 'No such sheet.' }, { status: 400 });

    const originId = resolveOriginSlotId(active, variants);
    const originInputs = sheetInputsFor(originId, active, variants);

    let gen;
    try { gen = await generateVariantSummary(target, originInputs, dndComplete); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not generate a summary.' }, { status: 502 }); }
    const now = new Date().toISOString();

    // Persist into the active-slot meta (if the target is the active sheet) or the stored slot object.
    if (slotId === activeSlotId) {
      const nextActive: ActiveSheet = { ...active, summary: gen.summary, summaryUpdatedAt: now, summaryHash: gen.hash };
      const { error } = await supabaseAdmin.from('dnd_characters')
        .update({ system_variants: withActiveSlotMeta(variants, nextActive) }).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const nextVariants: SystemVariants = { ...variants, [slotId]: { ...variants[slotId], summary: gen.summary, summaryUpdatedAt: now, summaryHash: gen.hash } };
      const { error } = await supabaseAdmin.from('dnd_characters')
        .update({ system_variants: withActiveSlotMeta(nextVariants, active) }).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind: 'summary', slotId, summary: gen.summary, summaryUpdatedAt: now });
  }

  // ── SET-CAMPAIGN — attach a variant to a campaign (for the Campaign tag). null clears it. ──
  if (action === 'set-campaign') {
    const slotId = typeof body?.slotId === 'string' && body.slotId ? body.slotId : activeSlotId;
    const campaignId = typeof body?.campaignId === 'string' && body.campaignId ? body.campaignId : null;
    if (slotId === activeSlotId) {
      const nextActive: ActiveSheet = { ...active, campaignId };
      const { error } = await supabaseAdmin.from('dnd_characters')
        .update({ system_variants: withActiveSlotMeta(variants, nextActive) }).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      if (!(slotId in variants)) return NextResponse.json({ error: 'No such sheet.' }, { status: 400 });
      const nextVariants: SystemVariants = { ...variants, [slotId]: { ...variants[slotId], campaignId } };
      const { error } = await supabaseAdmin.from('dnd_characters')
        .update({ system_variants: withActiveSlotMeta(nextVariants, active) }).eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind: 'set-campaign', slotId, campaignId });
  }

  // ── BEGIN-DRAFT — start editing a version on a working copy (Edit-flow). Allowed even at the cap. ──
  if (action === 'begin-draft') {
    const fromSlotId = typeof body?.fromSlotId === 'string' && body.fromSlotId ? body.fromSlotId : activeSlotId;
    let begun;
    try { begun = beginDraft(active, variants, { fromSlotId }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start editing.' }, { status: 400 }); }
    const { error } = await persistActiveTransition(params.id, row, begun);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'begin-draft', draftSlotId: begun.draftSlotId });
  }

  // ── SAVE-TO-ORIGINAL — commit the draft's edits onto the version it came from (no new version). ──
  if (action === 'save-to-original') {
    if (!active.draft) return NextResponse.json({ error: 'No draft in progress.' }, { status: 400 });
    let next;
    try { next = commitDraftToOriginal(active, variants); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save.' }, { status: 400 }); }
    await regenActiveSummary(next);
    const { error } = await persistActiveTransition(params.id, row, next);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'save-to-original', slotId: next.targetSlotId });
  }

  // ── SAVE-AS-VARIANT — promote the draft to a permanent variant (source untouched); cap-enforced. ──
  if (action === 'save-as-variant') {
    if (!active.draft) return NextResponse.json({ error: 'No draft in progress.' }, { status: 400 });
    let next;
    try { next = promoteDraftToVariant(active, variants, { name: typeof body?.name === 'string' ? body.name : undefined }); }
    catch (e) {
      const atCap = /limit/i.test(e instanceof Error ? e.message : '');
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save as a variant.', atCap }, { status: atCap ? 409 : 400 });
    }
    await regenActiveSummary(next);
    const { error } = await persistActiveTransition(params.id, row, next);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'save-as-variant', slotId: next.active.slotId });
  }

  // ── DISCARD-DRAFT — throw the draft away and return to its source version. ──
  if (action === 'discard-draft') {
    if (!active.draft) return NextResponse.json({ error: 'No draft in progress.' }, { status: 400 });
    let next;
    try { next = discardDraft(active, variants); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not discard.' }, { status: 400 }); }
    const { error } = await persistActiveTransition(params.id, row, next);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'discard-draft', slotId: next.active.slotId });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
