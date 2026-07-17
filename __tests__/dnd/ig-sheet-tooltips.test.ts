// __tests__/dnd/ig-sheet-tooltips.test.ts — the IG sheet's Combat panel must DISPLAY the active stance +
// conditions with a hover tooltip explaining each (owner: "if they have a condition/stance, clearly
// display it; hovering shows how it works"). Source-anchored (the render needs the component + an IG
// character); the pure tooltip text is covered by ig-in-play.test.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8');

describe('IGSheet shows in-play stances + conditions with tooltips', () => {
  it('sources the tooltip text from the tested in-play model, not ad-hoc strings', () => {
    expect(SRC).toContain("from '@/lib/dnd/systems/intuitive-games/inPlay'");
    expect(SRC).toContain('igStanceInPlay(');
    expect(SRC).toContain('igConditionInPlay(');
  });

  it('renders a hover tooltip (title) on both the stance and condition chips', () => {
    // Both the stance chip and the condition chip pass the model's tooltip to a title attribute.
    expect(SRC).toMatch(/title=\{e\?\.tooltip/);
    // A help cursor signals the tooltip affordance on each.
    expect((SRC.match(/cursor: 'help'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the stance at the character level (Basic below Lv 5 / Advanced at Lv 5+)', () => {
    expect(SRC).toMatch(/igStanceInPlay\(name, derived\.level\)/);
    expect(SRC).toMatch(/one active at a time/i); // the label tells the player only one stance applies
  });

  it('surfaces the active condition penalty legibly (mechanics, not just names)', () => {
    expect(SRC).toContain('igConditionSummary(cb.conditions)');
    expect(SRC).toMatch(/to attacks, saves &amp; skill checks/);
  });

  it('shows the active stance\'s precise mechanical effect (B5)', () => {
    expect(SRC).toContain('igStanceMechanicNote(cb.stances[0], derived.level)');
  });

  it('offers write-gated edit controls that POST to the ig-edit route', () => {
    // Controls only render for a viewer who can write (canDoEdit), and they hit the ig-edit route.
    expect(SRC).toContain('canDoEdit');
    expect(SRC).toMatch(/\/api\/dnd\/characters\/\$\{characterId\}\/ig-edit/);
    // Stance selector sets/clears the active stance; condition controls add/remove.
    expect(SRC).toContain("op: 'set_active_stance'");
    expect(SRC).toContain("op: 'clear_stance'");
    expect(SRC).toContain("op: 'add_condition'");
    expect(SRC).toContain("op: 'remove_condition'");
  });

  it('gives feat chips a full-rules hover tooltip (B3)', () => {
    expect(SRC).toContain('findIGFeat(f)');
    expect(SRC).toMatch(/def \? `\$\{def\.name\}/); // tooltip built from the feat's real effect text
  });

  it('offers write-gated feat add/remove controls that POST to ig-edit (B3)', () => {
    expect(SRC).toContain("op: 'remove_feat'");
    expect(SRC).toContain("op: 'add_feat'");
    expect(SRC).toContain('igAllFeats()'); // the add picker is populated from the full catalog
    expect(SRC).toMatch(/optgroup label="General"/); // grouped by category
  });

  it('renders the ancestry traits panel with per-trait tooltips (B1)', () => {
    expect(SRC).toContain('findIGAncestry(id.ancestry)');
    expect(SRC).toMatch(/anc\.traits\.map/);
    expect(SRC).toMatch(/title=\{t\.text\}/); // each trait hover-explains itself
  });

  it('shows Brendan\'s race art in the ancestry panel, with attribution (A20)', () => {
    expect(SRC).toContain('igAncestryArt(anc.name)');
    expect(SRC).toMatch(/Intuitive Games race art/); // alt text
    expect(SRC).toMatch(/Brendan \(Intuitive Games\)/); // visible credit
  });

  it('the character page passes write access to the sheet', () => {
    const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
    expect(PAGE).toMatch(/<IGSheet[^>]*canEdit=\{canWrite\}[^>]*characterId=\{character\.id\}/);
  });
});
