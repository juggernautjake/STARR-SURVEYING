// lib/dnd/transpose/source-sheet.ts — choosing which existing sheet a transpose ADAPTS FROM (owner 2026-07-18:
// "we should always keep track of the original character sheet that was made … that is the character sheet we
// should use to develop new character sheets in new systems … OR the user just chooses which already-built
// version they want the AI to use to generate the new custom character in a new system").
//
// A character can hold several system sheets (`listSheets` → `SheetSlot[]`). The transpose route today always
// adapts from the ACTIVE sheet; this lets the caller pick a source explicitly and, when they don't, defaults to
// the ORIGINAL sheet — the first-created slot — so a character's canonical build (not a half-finished later
// port) seeds the new system. Pure + framework-free + tested. (The route then re-gears any custom content into
// the target system, per `system/route.ts` grounding — this module only decides WHICH sheet feeds that.)
import type { SheetSlot } from '@/lib/dnd/system-variants';

/** The ORIGINAL sheet — the first slot in `listSheets` order (slots are listed active-first then in creation
 *  order, so the original is the earliest-created non-active, falling back to the active when it's the only /
 *  first one). We treat the first NON-transposed vanilla slot as original when present, else the first slot. */
export function originalSheet(sheets: SheetSlot[]): SheetSlot | null {
  if (!sheets || sheets.length === 0) return null;
  // A vanilla slot is a hand-built sheet; a custom slot is usually an AI transpose. Prefer the first vanilla
  // one as "the original character sheet that was made", else just the first slot.
  return sheets.find((s) => s.kind === 'vanilla') ?? sheets[0];
}

/** Is `slotId` a real, choosable source among the character's sheets? */
export function isValidSourceChoice(sheets: SheetSlot[], slotId: string | null | undefined): boolean {
  return !!slotId && (sheets ?? []).some((s) => s.slotId === slotId);
}

/**
 * Which sheet the transpose should adapt from: the caller's explicit choice when valid, else the ORIGINAL
 * sheet (so new-system sheets grow from the canonical build, not whatever happens to be active). Returns null
 * only when the character has no sheets at all.
 */
export function pickSourceSheet(sheets: SheetSlot[], chosenSlotId?: string | null): SheetSlot | null {
  if (isValidSourceChoice(sheets, chosenSlotId)) return sheets.find((s) => s.slotId === chosenSlotId) ?? null;
  return originalSheet(sheets);
}

/** A short label for the chosen source, for the transpose UI ("Adapting from: {name} · {system}"). */
export function sourceSheetLabel(sheet: SheetSlot | null, systemLabelFn: (s: string) => string): string {
  if (!sheet) return 'this character';
  return `${sheet.name} · ${systemLabelFn(sheet.system)}`;
}
