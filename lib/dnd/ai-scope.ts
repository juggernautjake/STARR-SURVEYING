// lib/dnd/ai-scope.ts — the HARD permission boundary for the character-builder AI
// (Phase V, Slice 8b). This is documentation-as-code: the single, authoritative
// statement of what the in-app AI agent is allowed to touch, plus a check that the
// structured edit vocabulary can never reach beyond it.
//
// ── The allowed surface ────────────────────────────────────────────────────────────
// The AI agent may ONLY affect:
//   1. Character creation      — building a character during import/ingest.
//   2. The chat stream         — its own conversation with the user (SheetEditChat).
//   3. THE TARGET CHARACTER'S OWN SHEET — its content, mechanics, and look:
//        • the character `data` (stats, feats, abilities, mechanics, transformations,
//          spells, attacks, features, resources, inventory),
//        • the character's `custom_layout` / `custom_css` (its blocks + styling),
//        • the character's `sheet_type` (its chosen skin).
//
// It may NOT, under any circumstance:
//   • edit any OTHER character (only the id it was authorized for),
//   • edit other site pages, campaigns, maps, users, or any non-character resource,
//   • perform any write that isn't gated by `requireCharacterWrite(characterId)`.
//
// ── How the boundary is enforced ───────────────────────────────────────────────────
//   • Server-side scoping: every AI-driven write route resolves the target through
//     `requireCharacterWrite(params.id)` (lib/dnd/characters.ts), so the write is keyed
//     to one character id AND the caller's owner/assigned-player/DM authorization. There
//     is no route that lets the AI address a different character or a foreign resource.
//   • Tool constraint: the AI's only mutation tool is `edit_sheet`, whose entire op
//     vocabulary maps to fields of the Character model (applied by the pure
//     `applySheetEdits`, which returns a Character and nothing else). No op names or
//     targets a page, campaign, map, user, or another character. `assertCharacterScopedOps`
//     below asserts that invariant so a future op that reached outside the sheet fails a test.
//   • Prompt constraint: the edit system prompt tells the agent to change only what the
//     user asked and to touch nothing else; the chat UI states the scope to the user.

/** Op-name prefixes that are legitimate, character-sheet-scoped mutations. Every
 *  `edit_sheet` op must start with one of these — anything else would imply a target
 *  outside the character's own sheet. */
const CHARACTER_SCOPED_PREFIXES = ['set_', 'add_', 'remove_', 'clear_', 'update_'];

/** Words that, appearing in an op name, would signal a write reaching OUTSIDE the target
 *  character's own sheet — a boundary violation. */
const FORBIDDEN_OP_TERMS = ['page', 'campaign', 'map', 'user', 'character_', 'other', 'site', 'route', 'file', 'global'];

/** Throw if any op in the given list is not strictly character-sheet-scoped. Used by the
 *  Slice 8b boundary test against the real `edit_sheet` op enum, so the guardrail is
 *  verified rather than merely asserted in prose. */
export function assertCharacterScopedOps(ops: string[]): void {
  for (const op of ops) {
    const lower = op.toLowerCase();
    if (!CHARACTER_SCOPED_PREFIXES.some((p) => lower.startsWith(p))) {
      throw new Error(`AI edit op "${op}" is not character-scoped (must be a set/add/remove/clear/update of a sheet field).`);
    }
    if (FORBIDDEN_OP_TERMS.some((t) => lower.includes(t))) {
      throw new Error(`AI edit op "${op}" appears to target a resource outside the character's own sheet.`);
    }
  }
}
