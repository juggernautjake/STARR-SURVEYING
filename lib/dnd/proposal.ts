// lib/dnd/proposal.ts — turning a tool call the assistant WANTS to make into a proposal a player can
// judge before it saves.
//
// The sheet chat is two-phase: phase 1 answers or proposes, phase 2 commits. A proposal is only worth
// anything if it says the two things you need to decide — WHAT it changes and WHERE on the sheet the
// result will be — so this builds both deterministically from the tool input. Pure (no DB, no second
// model call), which also makes it the testable half of the feature.
import {
  describeEdit, editLocations, whereToView, pf2EditLocation, igEditLocation, proposalText,
} from './edit-location';
import type { SheetEdit } from './sheet-edits';
import { parseIGEditToolCall } from './systems/intuitive-games/ai';
import { describeIgEdit } from './systems/intuitive-games/edit';
import { parsePF2EditToolCall } from './systems/pathfinder2e/ai';
import { describePf2Edit } from './systems/pathfinder2e/edit';

export interface Proposal {
  /** One line: what this change does. */
  description: string;
  /** Where to look for it afterwards ("see the Features tab"), or '' when there is nowhere to point. */
  where: string;
  /** The full chat message — the model's own prose (if any), then description + where-to-check. */
  text: string;
  /** How many discrete edits it carries (1 for the single-op bespoke/level-up tools). */
  editCount: number;
}

/** Build the player-facing proposal for a tool call, without applying anything. */
export function describeProposal(tool: string, input: unknown, modelText = ''): Proposal {
  const inp = (input ?? {}) as { summary?: string; edits?: unknown[]; toLevel?: number; mode?: string };
  let description = typeof inp.summary === 'string' ? inp.summary.trim() : '';
  let where = '';
  let editCount = 0;

  if (tool === 'edit_sheet') {
    const edits = (Array.isArray(inp.edits) ? inp.edits : []) as SheetEdit[];
    editCount = edits.length;
    if (!description) description = edits.map(describeEdit).join('; ') || 'change the sheet';
    where = whereToView(editLocations(edits));
  } else if (tool === 'customize_layout') {
    editCount = Array.isArray(inp.edits) ? inp.edits.length : 0;
    if (!description) description = 'restyle the sheet itself';
    where = 'the sheet on this page — the layout changes in place';
  } else if (tool === 'edit_pf2_sheet') {
    const parsed = parsePF2EditToolCall(input);
    editCount = 1;
    if (!description) description = 'error' in parsed ? 'change this Pathfinder 2e character' : describePf2Edit(parsed.edit);
    where = whereToView(['error' in parsed ? 'Combat' : pf2EditLocation(parsed.edit.op)], { bespoke: true });
  } else if (tool === 'edit_ig_sheet') {
    const parsed = parseIGEditToolCall(input);
    editCount = 1;
    if (!description) description = 'error' in parsed ? 'change this Intuitive Games character' : describeIgEdit(parsed.edit);
    where = whereToView(['error' in parsed ? 'Combat' : igEditLocation(parsed.edit.op)], { bespoke: true });
  } else if (tool === 'level_up_character') {
    editCount = 1;
    if (!description) description = `level this character up to level ${inp.toLevel ?? '?'}${inp.mode ? ` (${inp.mode})` : ''}`;
    where = whereToView(['Overview', 'Combat', 'Features']);
  } else if (tool === 'undo_last_change') {
    editCount = 1;
    if (!description) description = 'undo my most recent change to this character';
  } else if (!description) {
    description = 'change this character';
  }

  // The model's own prose (when it wrote any alongside the tool call) leads — it carries the reasoning;
  // the deterministic description + location follow, so the player always gets the concrete facts even
  // when the model said nothing.
  const lead = modelText.trim();
  const body = proposalText(description, where);
  return { description, where, text: lead ? `${lead}\n\n${body}` : body, editCount };
}
