// __tests__/dnd/ig-sheet-tooltips.test.ts — the IG sheet must DISPLAY the active stance + conditions with a
// hover tooltip explaining each (owner: "if they have a condition/stance, clearly display it; hovering shows
// how it works"). These live in the VITALS panel's "In Play" block (not Combat) so they surface on every
// template — Vitals leads every format and sits in the identity column / hero. Source-anchored (the render
// needs the component + an IG character); the pure tooltip text is covered by ig-in-play.test.ts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Combat/Powers/Feats/Reference sections moved into the IG panel set (useIgPanels, T-6a); the Classic
// shell (IGSheet) is now thin. Read both so these anti-drift anchors hold wherever the code lives.
const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8')
  + fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');

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
    expect(SRC).toMatch(/igStanceInPlay\(activeStance, derived\.level\)/);
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

  // ADD moved out of this file's scope in IG-S3. Both kinds were <select>s of bare names; they are
  // now IGContentPicker, which shows rules text and — the reason the change was needed — greys the
  // powers the character may not take, with the reason. A dropdown could show neither, so a vanilla
  // character picked from ~60 names and discovered the legal ones only from the refusal afterwards.
  // The catalog-source and eligibility claims now live in ig-content-picker.test.ts; what stays
  // here is the half this file is actually about: the REMOVE controls on the sheet itself.
  it('offers write-gated feat remove controls that POST to ig-edit (B3)', () => {
    expect(SRC).toContain("op: 'remove_feat'");
    expect(SRC).toMatch(/canDoEdit[\s\S]{0,200}remove_feat/);
  });

  it('offers write-gated power remove controls that POST to ig-edit (B3)', () => {
    expect(SRC).toContain("op: 'remove_power'");
    expect(SRC).toMatch(/canDoEdit[\s\S]{0,200}remove_power/);
  });

  it('and the add path is the picker, for both kinds', () => {
    expect(SRC).toContain('<IGContentPicker');
    expect(SRC).toContain("setPicker('power')");
    expect(SRC).toContain("setPicker('feat')");
    // The dropdowns are gone rather than sitting alongside it as a second, weaker path.
    expect(SRC).not.toMatch(/\+ add power…/);
    expect(SRC).not.toMatch(/optgroup label="General"/);
  });

  it('offers a write-gated defensive-power selector that POSTs set_defensive_power (B3)', () => {
    expect(SRC).toContain("op: 'set_defensive_power'");
    expect(SRC).toContain('IG_DEFENSIVE_POWERS.map'); // the picker lists all defensive powers
    expect(SRC).toMatch(/— no defensive power —/); // and can clear the single slot
  });

  it('a recognized power with no effect text is shown as WIP, not a bare name (Ground Rule 2)', () => {
    // Offering the full roster means a character can hold a power whose effect text is still pending
    // Brendan; the sheet must say so rather than render a name that reads as "no effect".
    expect(SRC).toMatch(/srcByName\.get\(p\.trim\(\)\.toLowerCase\(\)\) !== 'custom'/);
    expect(SRC).toMatch(/Effect text not yet published — work in progress\./);
  });

  it('the defensive-power chip hover-explains itself like every other in-play effect (B7)', () => {
    // effectMap includes defensive powers, and chip() passes the rules text to a title + help cursor.
    expect(SRC).toMatch(/effectMap[\s\S]*IG_DEFENSIVE_POWERS\]\s*\) if \(e\.effect\)/);
    expect(SRC).toMatch(/const chip = \(name: string\) => \{[\s\S]*const tip = effectOf\(name\)/);
    expect(SRC).toMatch(/title=\{tip \|\| undefined\}/);
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
