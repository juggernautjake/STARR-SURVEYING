// lib/dnd/layout-edits.ts — real-time layout/style edits for the custom sheet (Slice 12).
//
// The in-page AI agent can restructure a character's custom sheet live: add, remove, move
// (reflow), and replace (resize/restyle) building blocks, and set/append the sheet CSS.
// A pure `applyLayoutEdits(layout, css, edits)` returns the new `{ layout, css }`, and
// `LAYOUT_EDIT_TOOL` is the Claude tool whose schema IS this vocabulary. Blocks are
// re-validated through `normalizeLayout` on apply, so an AI/user can never inject an
// unknown block type or malformed structure — every op stays inside the sheet's own model.
import type Anthropic from '@anthropic-ai/sdk';
import { normalizeLayout, type CustomSheetLayout, type CustomBlock } from './custom-sheet';

export type LayoutEdit =
  | { op: 'set_title'; value: string }
  | { op: 'add_block'; block: unknown; index?: number }
  | { op: 'remove_block'; index: number }
  | { op: 'move_block'; from: number; to: number }
  | { op: 'update_block'; index: number; block: unknown }
  | { op: 'set_css'; value: string }
  | { op: 'append_css'; value: string };

function clampIndex(i: number, len: number): number {
  if (!Number.isFinite(i)) return len;
  return Math.max(0, Math.min(len, Math.round(i)));
}

/** Apply layout/style edits, returning a fresh, re-validated `{ layout, css }` (pure). */
export function applyLayoutEdits(
  rawLayout: unknown,
  rawCss: string | null | undefined,
  edits: LayoutEdit[],
): { layout: CustomSheetLayout; css: string } {
  const layout = normalizeLayout(rawLayout);
  let blocks: CustomBlock[] = [...layout.blocks];
  let title = layout.title;
  let css = String(rawCss ?? '');

  for (const e of edits) {
    switch (e?.op) {
      case 'set_title':
        title = String(e.value ?? '');
        break;
      case 'add_block': {
        // Validate the incoming block through the layout normalizer (drops it if unknown).
        const [b] = normalizeLayout({ blocks: [e.block] }).blocks;
        if (b) blocks.splice(clampIndex(e.index ?? blocks.length, blocks.length), 0, b);
        break;
      }
      case 'remove_block':
        if (e.index >= 0 && e.index < blocks.length) blocks.splice(e.index, 1);
        break;
      case 'move_block': {
        const from = e.from;
        if (from >= 0 && from < blocks.length) {
          const [b] = blocks.splice(from, 1);
          blocks.splice(clampIndex(e.to, blocks.length), 0, b);
        }
        break;
      }
      case 'update_block': {
        const [b] = normalizeLayout({ blocks: [e.block] }).blocks;
        if (b && e.index >= 0 && e.index < blocks.length) blocks[e.index] = b;
        break;
      }
      case 'set_css':
        css = String(e.value ?? '');
        break;
      case 'append_css':
        css = `${css}\n${String(e.value ?? '')}`.trim();
        break;
      default: {
        // Exhaustiveness: every LayoutEdit op must have a case above, or an op the AI can emit to restyle
        // the sheet would silently do nothing (the AI reports the layout change, the sheet is unchanged).
        // A new union op without a handler fails to compile; the runtime break still absorbs a bad payload.
        const _exhaustive: never = e;
        void _exhaustive;
        break;
      }
    }
  }

  // A final pass so the stored layout is always a clean, validated set of blocks.
  const clean = normalizeLayout({ title, blocks });
  return { layout: clean, css };
}

export const LAYOUT_EDIT_TOOL: Anthropic.Tool = {
  name: 'customize_layout',
  description:
    'Restructure or restyle THIS character’s custom sheet: add, remove, move (reflow), or replace ' +
    '(resize/restyle) building blocks, retitle it, or set/append the sheet CSS. Use this for layout and ' +
    'styling/format requests (as opposed to edit_sheet, which changes game mechanics). Blocks use the ' +
    'custom-sheet block model: heading, text, note, stats, list, table, html, and the interactive widgets ' +
    'field, counter, toggle. Positions are zero-based indices into the current block list.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One sentence describing the change, for the user.' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['set_title', 'add_block', 'remove_block', 'move_block', 'update_block', 'set_css', 'append_css'] },
            index: { type: 'number', description: 'Target block index for remove_block / update_block, or insert position for add_block.' },
            from: { type: 'number', description: 'move_block: current index.' },
            to: { type: 'number', description: 'move_block: destination index.' },
            value: { type: 'string', description: 'set_title / set_css / append_css text.' },
            block: {
              type: 'object',
              description: 'The block for add_block / update_block. Must be a valid custom-sheet block (has a `type`).',
              properties: { type: { type: 'string' } },
              additionalProperties: true,
            },
          },
          required: ['op'],
        },
      },
    },
    required: ['edits'],
  },
};
