// app/api/dnd/characters/[id]/classes/route.ts — set a 5e character's MULTICLASS split (MC-5e-4).
//
// Writes `data.meta.classes` (the ClassLevel[] the multiclass engine reads via `resolveClassLevels`) and
// keeps `data.meta.level` = the TOTAL character level + `data.meta.className` = the primary class's name, so
// single-class code paths and the sheet stay consistent. Owner/DM-scoped like every character write. 5e only
// — PF2 multiclasses via archetypes, IG has no multiclass rules.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { normalizeSystem } from '@/lib/dnd/systems';
import { findClass } from '@/lib/dnd/classes/registry';
import { totalClassLevel } from '@/lib/dnd/classes/engine';
import { characterMulticlass, applyMulticlassSlots, type SlotBlock } from '@/lib/dnd/classes/multiclass-resolve';
import type { ClassLevel } from '@/lib/dnd/classes/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });

  const row = access.access.character as unknown as { id: string; system?: string; data?: Record<string, unknown> | null };
  const system = normalizeSystem(row.system);
  if (system !== 'dnd5e-2014' && system !== 'dnd5e-2024') {
    return NextResponse.json({ error: 'Multiclassing is a D&D 5e feature. (PF2 multiclasses via archetypes.)' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { classes?: { classKey?: string; subclassKey?: string; level?: number }[] };
  const clean: ClassLevel[] = [];
  for (const c of body.classes ?? []) {
    const key = String(c?.classKey ?? '').trim();
    if (!key || !findClass(system, key)) continue; // must be a real class in this system
    if (clean.some((x) => x.classKey === key)) continue; // one entry per class
    const level = Math.max(1, Math.min(20, Math.floor(Number(c?.level) || 0)));
    clean.push({ classKey: key, ...(c?.subclassKey ? { subclassKey: String(c.subclassKey) } : {}), level });
  }
  if (!clean.length) return NextResponse.json({ error: 'Pick at least one class.' }, { status: 400 });

  const total = totalClassLevel(clean);
  if (total > 20) return NextResponse.json({ error: `Total level ${total} exceeds the 20-level cap.` }, { status: 400 });

  const data = { ...(row.data ?? {}) } as Record<string, unknown>;
  const meta = { ...((data.meta as Record<string, unknown>) ?? {}) };
  meta.classes = clean;
  meta.level = total;
  meta.className = findClass(system, clean[0].classKey)?.name ?? meta.className;
  data.meta = meta;

  // Apply the rules-correct spell slots for the split — the flagship multiclass synergy (the PHB combined
  // caster-level table, which most trackers get wrong). We only REWRITE the slot COUNTS of an EXISTING
  // spellcasting block: which ability a multiclass casts with is per-class and the sheet models a single
  // ability, so we don't invent a spellcasting block for a non-caster who dipped into a caster. This makes
  // the level manager's "(multiclass table)" preview and the saved sheet agree.
  const spellcasting = data.spellcasting as { ability?: unknown; slots?: SlotBlock } | undefined;
  if (spellcasting && spellcasting.ability != null) {
    const { snapshot } = characterMulticlass(system, { classKey: clean[0].classKey, level: clean[0].level }, clean);
    const nextSlots = applyMulticlassSlots(snapshot.spellSlots, spellcasting.slots);
    if (nextSlots) data.spellcasting = { ...spellcasting, slots: nextSlots };
  }

  const { error } = await supabaseAdmin.from('dnd_characters').update({ data }).eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Could not save the class split.' }, { status: 500 });

  return NextResponse.json({ ok: true, classes: clean, total });
}
