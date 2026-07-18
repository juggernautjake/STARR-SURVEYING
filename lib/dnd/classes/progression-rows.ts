// lib/dnd/classes/progression-rows.ts — turn a class definition into the sheet's Progression-table rows
// (Slice 7), so the Progression tab renders from the class DATA (progressionTable / featuresGainedAt)
// instead of a hand-authored per-character array. Any class — official or homebrew — gets a correct
// 1→20 table for free. Pure + tested. `level`, `proficiency bonus`, and per-level `features` map
// faithfully; the two bespoke middle columns are filled best-effort from the class's tracked resources
// (Rage, Ki, Sorcery Points…) or spell slots, since those are what a class table conventionally shows.
import type { ClassDefinition, SubclassDefinition } from './types';
import type { ProgressionRow } from '@/app/dnd/_sheet/types';
import { snapshotAtLevel, featuresGainedAt } from './engine';

export interface ProgressionColumns { col3Label: string; col4Label: string }

/** Choose the two middle-column labels from the class's resources / spellcasting (best-effort). */
export function progressionColumns(def: ClassDefinition): ProgressionColumns {
  const res = def.resources ?? [];
  const col3Label = res[0]?.name ?? (def.spellcasting ? 'Spell Slots' : '—');
  const col4Label = res[1]?.name ?? (def.spellcasting ? 'Cantrips' : '—');
  return { col3Label, col4Label };
}

/** The full 1→20 progression rows for a class (+ optional subclass). `currentLevel` marks the "here" row. */
export function progressionRows(def: ClassDefinition, sub?: SubclassDefinition | null, currentLevel?: number): ProgressionRow[] {
  return Array.from({ length: 20 }, (_, i) => {
    const lv = i + 1;
    const snap = snapshotAtLevel(def, lv, sub);
    const gained = featuresGainedAt(def, lv, sub);
    const res = snap.resources ?? [];
    // Middle columns: the first two tracked resources' max at this level, else spell-slot / cantrip counts.
    const slotCount = snap.spellSlots ? snap.spellSlots.filter((n) => n > 0).length : 0;
    const col3 = res[0] ? String(res[0].max) : (def.spellcasting ? (slotCount ? `${slotCount} ranks` : '—') : '—');
    const col4 = res[1] ? String(res[1].max) : (def.spellcasting && snap.cantripsKnown ? String(snap.cantripsKnown) : '—');
    return {
      level: lv,
      prof: `+${snap.proficiencyBonus}`,
      col3,
      col4,
      features: gained.map((f) => f.name).join(', ') || '—',
      here: currentLevel === lv,
    };
  });
}
