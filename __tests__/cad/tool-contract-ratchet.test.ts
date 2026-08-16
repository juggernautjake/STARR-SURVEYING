// C14b — the per-tool sweep against docs/cad-click-order-contract.md, kept true.
//
// The sweep itself is `scripts/cad-tool-contract-audit.mjs`. This runs it and asserts it is clean,
// for the reason C13 and C27 both paid for: a measurement taken once is a snapshot, and every
// snapshot in this document went stale before anybody looked at it again.
//
// What it is guarding is narrow and worth stating, because a guard whose meaning is vague gets
// waived the first time it fires. A tool is "staged" when its handler parks a pending pick between
// clicks. There are 29 of them, and two separate pieces of code have to know which field each one
// parks it in — the command prompt, so it can ask for the SECOND pick, and the Escape handler, so
// it can abandon the pick rather than the tool. C14b made both read one list. This fails when a
// tool starts parking a pick in a field that list does not name, which is precisely the moment
// both behaviours would silently break for that tool and for nothing else.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

function audit(): { wiring: { escapeUsesShared: boolean; promptUsesShared: boolean }; tools: Array<{ tool: string; staged: boolean; uncovered: string[]; hasPrompt: boolean; hasPreview: boolean }> } {
  const out = execFileSync(
    process.execPath,
    ['scripts/cad-tool-contract-audit.mjs', '--json'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

describe('every tool obeys the click-order contract', () => {
  const result = audit();

  it('the prompt and Escape both route through the shared definition', () => {
    // Checked first: if either stops doing so, every per-tool assertion below becomes vacuous
    // rather than false, which is the failure mode that lets a ratchet pass while broken.
    expect(result.wiring.promptUsesShared, 'CommandBar must feed getPromptHint pickStage()').toBe(true);
    expect(result.wiring.escapeUsesShared, 'the Escape handler must ask hasPendingPick()').toBe(true);
  });

  it('no staged tool parks a pick the store does not know about', () => {
    const blind = result.tools.filter((t) => t.uncovered.length > 0);
    expect(
      blind.map((t) => `${t.tool} parks ${t.uncovered.join(', ')}`),
      'add the field to PENDING_PICK_FIELDS in lib/cad/store/tool-store.ts — otherwise this tool’s '
      + 'prompt will freeze on stage 1 and Escape will drop the tool instead of the pick',
    ).toEqual([]);
  });

  it('every tool says what it wants next', () => {
    // C15's result, ratcheted. It was 22 of 51 before that slice.
    const silent = result.tools.filter((t) => !t.hasPrompt).map((t) => t.tool);
    expect(silent).toEqual([]);
  });

  it('every tool that creates something previews it', () => {
    // Exemptions live in the script with their reasons attached, so adding one is an edit somebody
    // has to justify in a diff rather than a number that quietly drops.
    const blind = result.tools.filter((t) => !t.hasPreview).map((t) => t.tool);
    expect(blind).toEqual([]);
  });

  it('the sweep still covers the whole toolbar', () => {
    // A parser that silently matched zero tools would make every assertion above pass.
    expect(result.tools.length).toBe(51);
    expect(result.tools.filter((t) => t.staged).length).toBeGreaterThan(20);
  });
});
