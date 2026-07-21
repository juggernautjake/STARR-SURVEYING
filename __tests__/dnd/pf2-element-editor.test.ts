// __tests__/dnd/pf2-element-editor.test.ts — editing and authoring on the PF2 sheet (S15a/S15b).
//
// Owner ask: "fully customize spells and feats and armor and weapons... create whole new ones too...
// same functionality as the 2024 edition character sheet". The PF2 sheet could render content and
// add catalogued content, but could not change what it held or invent anything.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyPf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { gatePf2Edit } from '@/lib/dnd/systems/pathfinder2e/rules-gate';
import { blankPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const editor = read('app/dnd/_ui/PF2ElementEditor.tsx');
const sheet = read('app/dnd/_ui/PF2Sheet.tsx');

describe('one component both edits and authors', () => {
  it('distinguishes the two by whether `initial` was supplied', () => {
    expect(editor).toContain('const creating = !initial');
  });

  it('authoring saves through the SAME add op as a catalogued pick', () => {
    // Ground Rule 4 — custom content is the same shape as official content. A parallel "custom"
    // pathway is how a system ends up with two half-working ones.
    expect(editor).toContain("op: 'add_spell'");
    expect(editor).toContain("op: 'add_feat'");
  });

  it('editing renames via `to` rather than remove + re-add', () => {
    // Remove + re-add drops every field not re-supplied.
    expect(editor).toContain("op: 'update_spell'");
    expect(editor).toContain('renamed ? { to: trimmed }');
  });

  it('requires a name before it will save', () => {
    expect(editor).toContain('const canSave = trimmed.length > 0');
    expect(editor).toContain('if (!canSave) return');
  });

  it('uses PF2 vocabulary — rank, not spell level', () => {
    expect(editor).toContain('Rank (0 = cantrip)');
  });
});

describe('homebrew is allowed through, deliberately', () => {
  it('an uncatalogued spell is not refused even for a vanilla character', () => {
    // Homebrew makes no claim to be official content, so refusing it would block authoring rather
    // than close a hole. The gate misses on lookup and passes it.
    const c = blankPF2Character('T');
    const vanilla = { ...c, identity: { ...c.identity, className: 'Wizard', level: 1 } };
    const r = gatePf2Edit(vanilla, { op: 'add_spell', name: 'Ember Lash', rank: 9 },
      { enforce: true }, { feats: [], spells: [] });
    expect(r.edit).toBeTruthy();
    expect(r.refusal).toBeUndefined();
  });

  it('and lands on the sheet with no offRules marker', () => {
    // It was never claiming to be official, so flagging it off-rules would be wrong — that axis is
    // for content the character may not legally take, not for content we simply don't stock.
    const c = applyPf2Edit(blankPF2Character('T'), { op: 'add_spell', name: 'Ember Lash', rank: 2 });
    expect(c.spellcasting.spells![0].offRules).toBeUndefined();
  });

  it('the editor says so, rather than leaving the player to guess', () => {
    expect(editor).toContain('never claimed to be official');
  });
});

describe('the sheet wires both affordances up', () => {
  it('offers ＋ (catalogued) and ✎ New (homebrew) for feats and spells', () => {
    expect(sheet).toContain("setPicker('feat')");
    expect(sheet).toContain("setEditor({ kind: 'feat' })");
    expect(sheet).toContain("setPicker('spell')");
    expect(sheet).toContain("setEditor({ kind: 'spell' })");
  });

  it('offers a per-element Edit that pre-fills from the element', () => {
    expect(sheet).toMatch(/setEditor\(\{ kind: 'feat', initial: \{ name: f\.name/);
    expect(sheet).toMatch(/setEditor\(\{ kind: 'spell', initial: \{ name: s\.name/);
  });

  it('renders ✎ on customized elements, alongside ⚑ rather than instead of it', () => {
    // Two axes: ✎ = edited, ⚑ = not legally available. An element can carry both, so neither may
    // replace the other.
    expect(sheet).toContain('f.customized &&');
    expect(sheet).toContain('s.customized &&');
    expect(sheet).toContain('OffRulesMark');
  });

  it('saves through the gated pf2-edit route', () => {
    expect(sheet).toContain('void postEdit(edit)');
  });

  it('shows edit controls only to someone who can write', () => {
    expect(sheet).toMatch(/canDoEdit && \(\s*<button[\s\S]{0,200}setEditor/);
  });
});
