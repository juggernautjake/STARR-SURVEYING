// __tests__/dnd/ig-element-editor.test.ts — editing and authoring on the IG sheet (IG-S2).
//
// IG-S1 gave IG the ops; this is the surface that reaches them. Without it the ops would be the
// same "built but unwired" failure the orphan guard now exists to catch — which is exactly why the
// last assertions here check the sheet, not just the component.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const editor = read('app/dnd/_ui/IGElementEditor.tsx');
// The editor wiring moved into the IG panel set (useIgPanels, T-6a); the Classic shell (IGSheet) is now
// thin. Read both so the source anchor holds wherever the code lives.
const sheet = read('app/dnd/_ui/IGSheet.tsx') + read('app/dnd/_ui/ig/useIgPanels.tsx');

describe('one component edits and authors, across all three kinds', () => {
  it('handles powers, feats and weapons', () => {
    expect(editor).toContain("kind: IGEditorKind");
    for (const k of ['power', 'feat', 'weapon']) expect(editor).toContain(`'${k}'`);
  });

  it('distinguishes authoring from editing by whether `initial` was supplied', () => {
    expect(editor).toContain('const creating = !initial');
  });

  it('authoring saves through the SAME add ops as a catalogued pick', () => {
    // Ground Rule 4 — custom content is the same shape as official content.
    for (const op of ['add_power', 'add_feat', 'add_attack']) expect(editor).toContain(op);
  });
});

describe('authoring a power emits TWO ops, because IG add ops carry only a name', () => {
  it('the editor emits add then update when there is rules text', () => {
    // IG powers are a bare string[], so the rules text has to land via the update op that writes
    // customEffects. Emitting both together means a half-finished element cannot be left behind.
    expect(editor).toContain('const ops: Record<string, unknown>[] = [{ op: addOp, name: trimmed }]');
    expect(editor).toContain('ops.push({ op: updateOp, name: trimmed, effect })');
  });

  it('and that sequence actually produces a power WITH its text', () => {
    // End-to-end through the pure ops, so the two-step is verified rather than assumed.
    let c = blankIGCharacter('T');
    c = applyIgEdit(c, { op: 'add_power', name: 'Ember Lash' });
    c = applyIgEdit(c, { op: 'update_power', name: 'Ember Lash', effect: 'Homebrew.' });
    expect(c.powers).toContain('Ember Lash');
    expect(c.customEffects?.['Ember Lash']).toBe('Homebrew.');
  });

  it('skips the second op when there is no text to attach', () => {
    expect(editor).toContain('if (effect.trim()) ops.push');
  });
});

describe('clearing an override restores the original text', () => {
  it('the editor always sends `effect` when editing, including empty', () => {
    // Omitting it would mean "leave alone"; sending empty means "clear". Different intents.
    expect(editor).toMatch(/onSave\(\[\{[\s\S]*?op: updateOp[\s\S]*?effect,\s*\}\]\)/);
  });

  it('tells the player what clearing does', () => {
    expect(editor).toContain('Clearing this restores the original rules text');
  });

  it('and the sheet falls back to the catalogue text when cleared', () => {
    expect(sheet).toContain('ig.customEffects?.[p]');
    expect(sheet).toContain(': effectOf(p)');
  });
});

describe('the sheet wires it up', () => {
  it('mounts the editor', () => {
    expect(sheet).toContain('<IGElementEditor');
  });

  it('offers per-power Edit and a New button for homebrew', () => {
    expect(sheet).toMatch(/setIgEditor\(\{ kind: 'power', initial:/);
    expect(sheet).toContain("setIgEditor({ kind: 'power' })");
  });

  it('renders ✎ alongside ⚑ rather than instead of it', () => {
    // Two axes: ✎ edited, ⚑ not legally available. An element can carry both.
    expect(sheet).toContain('ig.customEffects?.[p] && <span title="Hand-customized');
    expect(sheet).toContain('OffRulesMark');
  });

  it('applies a sequence in order and refreshes once', () => {
    expect(sheet).toContain('const postEdits = async (edits: Record<string, unknown>[])');
    expect(sheet).toContain('for (const [i, edit] of edits.entries())');
  });

  it('stops the sequence when the gate refuses an op, AND reports it', () => {
    // Continuing would apply a partial edit the server already rejected part of. Both halves are
    // asserted together because stopping silently was the old behaviour, and it is the reporting
    // that makes the stop comprehensible to the player.
    expect(sheet).toMatch(/if \(err\) \{[\s\S]*?setRefusal\([\s\S]*?break;/);
  });

  it('shows edit controls only to someone who can write', () => {
    expect(sheet).toMatch(/canDoEdit && \(\s*<button[\s\S]{0,240}setIgEditor/);
  });
});

describe('weapons are editable at all now', () => {
  it('the editor validates the damage die', () => {
    expect(editor).toContain(".test(damage.trim())");
    expect(editor).toContain('^\\d+$'); // a flat-damage weapon is still valid
  });

  it('emits add_attack when creating and update_attack when editing', () => {
    expect(editor).toContain("op: 'add_attack'");
    expect(editor).toContain("op: 'update_attack'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The gate's refusal reaches the player (IG-S2, completed 2026-07-21).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `gateIgEdit` composes a genuinely useful refusal — it names the element, the reason, and the two
 * ways forward ("build a custom one, or have the DM grant it"). The sheet threw all of it away on
 * the theory that an unchanged sheet was itself the signal. It is not: an unchanged sheet is
 * indistinguishable from a slow one, so a refused edit read as the app ignoring you.
 */
describe('a refused edit says so', () => {
  it('reads the error out of the response instead of discarding it', () => {
    expect(sheet).toContain('const postOne = async');
    expect(sheet).toContain("body?.error || 'That edit was refused.'");
  });

  it('both the single-op and sequence paths report through the same helper', () => {
    // Two paths reporting failure differently is how one of them ends up reporting nothing.
    const calls = sheet.match(/await postOne\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(sheet).not.toContain('/* surfaced by the unchanged sheet');
  });

  it('renders the refusal, dismissibly', () => {
    // The banner is a conditional on `refusal` — `&&` when it was inline JSX, `? (…) : null` now that the
    // panel set returns it as a node. Either form is the same dismissible render.
    expect(sheet).toMatch(/refusal (?:&&|\?) \(/);
    expect(sheet).toContain('setRefusal(null)');
  });

  it('names the half-applied case when a LATER op in a sequence fails', () => {
    // Authoring a power is add-then-update. If the update fails the element exists with no rules
    // text, and saying so is the difference between a confusing result and a finishable one.
    expect(sheet).toContain('The element was created, but its later details were not saved');
  });
});

describe('authoring a power is predicted, not merely refused', () => {
  it('mirrors gateIgEdit: DM or custom may author powers, vanilla may not', () => {
    expect(sheet).toContain("const canAuthorPowers = !!isDM || variantKind === 'custom'");
  });

  it('gates ONLY the power authoring button, because the server gates only add_power', () => {
    // The mirror-image bug would be the UI inventing a restriction the rules do not have. IG feats
    // have free-prose prerequisites and stances may legitimately be held off-list; both are
    // ungated on the server for stated reasons, so both must stay ungated here.
    const uses = sheet.match(/canAuthorPowers/g) ?? [];
    // The definition, the disabled check, the title, the cursor and the opacity — and nothing that
    // reaches the feat or weapon editors.
    expect(uses.length).toBeGreaterThanOrEqual(4);
    expect(sheet).toContain("disabled={editing || !canAuthorPowers}");
    expect(sheet).not.toMatch(/canAuthorPowers[\s\S]{0,120}kind: 'feat'/);
    expect(sheet).not.toMatch(/canAuthorPowers[\s\S]{0,120}kind: 'weapon'/);
  });

  it('explains the refusal on the disabled button rather than just greying it out', () => {
    expect(sheet).toContain('This is a vanilla character, so its powers are held to its class and level');
  });
});

describe('the hint cannot disagree with the gate that decides', () => {
  it('the sheet takes isDM and the variant as props rather than guessing them', () => {
    expect(sheet).toContain('isDM?: boolean');
    expect(sheet).toContain("variantKind?: 'vanilla' | 'custom'");
    // Defaulting to vanilla is the SAFE direction: it under-promises, matching the server.
    expect(sheet).toContain("variantKind = 'vanilla'");
  });

  it('and the page passes the same server-derived values the route uses', () => {
    const page = read('app/dnd/characters/[id]/page.tsx');
    expect(page).toMatch(/<IGSheet[\s\S]{0,400}isDM=\{isDM\}/);
    expect(page).toMatch(/<IGSheet[\s\S]{0,400}variantKind=\{readActiveSlotMeta/);
    // The ig-edit route derives both exactly this way; drifting apart would make the hint lie.
    const route = read('app/api/dnd/characters/[id]/ig-edit/route.ts');
    expect(route).toContain('readActiveSlotMeta');
    expect(route).toContain('access.access.isDM');
  });
});
