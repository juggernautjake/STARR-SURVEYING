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
//   • Tool constraint: the AI's mutation tools are `edit_sheet` (game mechanics),
//     `edit_ig_sheet` (Intuitive Games mechanics), and `customize_layout` (the sheet's
//     HTML/CSS + blocks). Every op in all three maps to fields of the Character model / its
//     own custom_layout + custom_css (applied by the pure `applySheetEdits` / `applyIgEdit` /
//     `applyLayoutEdits`, each returning a Character or its layout and nothing else). No op
//     names or targets a page, campaign, map, user, or another character.
//     `assertCharacterScopedOps` below asserts that invariant for ALL THREE vocabularies
//     (ai-scope.test.ts) so a future op that reached outside the sheet fails a test.
//   • Prompt constraint: the edit system prompt tells the agent to change only what the
//     user asked and to touch nothing else; the chat UI states the scope to the user.

/** Op-name prefixes that are legitimate, character-sheet-scoped mutations. Every
 *  `edit_sheet` op must start with one of these — anything else would imply a target
 *  outside the character's own sheet. */
const CHARACTER_SCOPED_PREFIXES = ['set_', 'add_', 'remove_', 'rename_', 'clear_', 'update_', 'move_', 'append_', 'define_', 'tag_', 'equip_', 'apply_'];

/** A few whole-op verbs that are inherently sheet-local but aren't prefixed (e.g. the HP verb `heal`). Listed
 *  explicitly so the prefix guard accepts them without loosening the general rule. */
const CHARACTER_SCOPED_EXACT = new Set(['heal']);

/** Words that, appearing in an op name, would signal a write reaching OUTSIDE the target
 *  character's own sheet — a boundary violation. Includes privilege-escalation-shaped terms
 *  (role/permission/auth/…) so an op that LOOKS like it grants access or touches credentials is
 *  refused even with a valid set_/add_/update_ prefix — defense-in-depth behind the server-side
 *  `requireCharacterWrite` that is the primary boundary. (No real sheet-edit op contains these:
 *  `add_power`/`set_defensive_power` carry "power", never "permission" — verified by the
 *  every-vocabulary-is-scoped test that runs this over the real op enums.) */
const FORBIDDEN_OP_TERMS = ['page', 'campaign', 'map', 'user', 'character_', 'other', 'site', 'route', 'file', 'global', 'role', 'permission', 'auth', 'password', 'credential', 'secret'];

/** Throw if any op in the given list is not strictly character-sheet-scoped. Used by the
 *  Slice 8b boundary test against the real `edit_sheet` op enum, so the guardrail is
 *  verified rather than merely asserted in prose. */
export function assertCharacterScopedOps(ops: string[]): void {
  for (const op of ops) {
    const lower = op.toLowerCase();
    if (!CHARACTER_SCOPED_EXACT.has(lower) && !CHARACTER_SCOPED_PREFIXES.some((p) => lower.startsWith(p))) {
      throw new Error(`AI edit op "${op}" is not character-scoped (must be a set/add/remove/clear/update/apply of a sheet field).`);
    }
    if (FORBIDDEN_OP_TERMS.some((t) => lower.includes(t))) {
      throw new Error(`AI edit op "${op}" appears to target a resource outside the character's own sheet.`);
    }
  }
}
