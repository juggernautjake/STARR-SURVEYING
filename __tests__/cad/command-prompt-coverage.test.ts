// C15 — every tool says what it wants next.
//
// ── WHY THE DEFAULT WAS WORSE THAN SILENCE ──────────────────────────────────────────────────────
//
// `getPromptHint` had a case for 22 of the 51 tools. The other 29 fell through to:
//
//     'Type a command (e.g. line, polyline, move, rotate) or coordinates (x,y or @dx,dy)'
//
// That is the IDLE message. So a surveyor who picked Trim, looked at the command line, and read it
// was told to type a command — not silence, which would merely be unhelpful, but active
// misdirection about what the tool was waiting for. The contract
// (`docs/cad-click-order-contract.md`) puts it plainly: a tool that is silent about what it wants
// next is the root of "unintuitive".
//
// This is a ratchet rather than a one-off check. A new tool added to `ToolType` without a prompt
// falls through to that same idle message, and nothing about it looks broken — the bar shows text,
// it is just the wrong text.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const types = readFileSync(join(process.cwd(), 'lib/cad/types.ts'), 'utf8');
const bar = readFileSync(join(process.cwd(), 'app/admin/cad/components/CommandBar.tsx'), 'utf8');

/** Every member of the `ToolType` union. */
function allTools(): string[] {
  const m = types.match(/export type ToolType =([\s\S]*?);/);
  if (!m) throw new Error('ToolType union not found');
  return [...new Set([...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]))];
}

/** Every tool with its own `case` in `getPromptHint`. */
function promptedTools(): Set<string> {
  const start = bar.indexOf('function getPromptHint');
  const end = bar.indexOf('export default function CommandBar');
  const body = bar.slice(start, end);
  return new Set([...body.matchAll(/case '([A-Z_]+)':/g)].map((x) => x[1]));
}

describe('command prompt coverage', () => {
  const tools = allTools();
  const prompted = promptedTools();

  it('found the real tool list', () => {
    // A regex that silently matched nothing would make every assertion below vacuous.
    expect(tools.length).toBeGreaterThan(40);
    expect(tools).toContain('DRAW_POLYLINE');
  });

  it('every tool has its own prompt — none falls through to the idle message', () => {
    const missing = tools.filter((t) => !prompted.has(t));
    expect(
      missing,
      'these tools show "Type a command…" while active, which tells the surveyor the wrong thing',
    ).toEqual([]);
  });
});

describe('the prompts say what the contract requires', () => {
  const start = bar.indexOf('function getPromptHint');
  const body = bar.slice(start, bar.indexOf('export default function CommandBar'));

  it('the pick-two tools name WHICH pick is which', () => {
    // "Click a line" twice is not a prompt, it is the same prompt twice. FILLET and CHAMFER both
    // take two picks whose order changes the result.
    expect(body).toMatch(/FIRST line/);
    expect(body).toMatch(/SECOND line/);
  });

  it('the variable-length tools say how they end', () => {
    // MEASURE_AREA takes an unbounded number of vertices; without this the surveyor does not know
    // whether it ever stops.
    const area = body.slice(body.indexOf("case 'MEASURE_AREA'"));
    expect(area.slice(0, 400)).toMatch(/Enter to finish/);
  });

  it('the three-click arc distinguishes its three clicks', () => {
    const arc = body.slice(body.indexOf("case 'DRAW_ARC'"), body.indexOf("case 'DRAW_CIRCLE_EDGE'"));
    expect(arc).toMatch(/start point/i);
    expect(arc).toMatch(/ALONG the arc/);
    expect(arc).toMatch(/end point/i);
  });

  it('EXTEND says which end it will lengthen', () => {
    // The tool acts on whichever endpoint the cursor is nearer, which is invisible unless said.
    expect(body).toMatch(/click near the END/i);
  });
});
