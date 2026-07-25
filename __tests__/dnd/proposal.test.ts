// __tests__/dnd/proposal.test.ts — the confirm-before-save contract (Workstream B).
//
// The sheet assistant proposes a change instead of applying it, and the player approves it from the text
// alone. So the proposal must, for EVERY tool the assistant can call, say what the change is and where the
// result appears — including for the bespoke PF2 / Intuitive Games sheets, which have their own panels.
import { describe, it, expect } from 'vitest';
import { describeProposal } from '@/lib/dnd/proposal';

describe('describeProposal — mechanics edits', () => {
  it('describes the edits and points at the tabs when the model gave no summary', () => {
    const p = describeProposal('edit_sheet', {
      edits: [
        { op: 'add_feat', feat: 'Alert' },
        { op: 'set_ability', ability: 'str', value: 18 },
      ],
    });
    expect(p.editCount).toBe(2);
    expect(p.description).toContain('add the Alert feat');
    expect(p.description).toContain('set STR to 18');
    // Both places, in sheet order, in the where-to-check line.
    expect(p.where).toBe('see the Abilities and Features tabs');
    expect(p.text).toContain('Where to check it: see the Abilities and Features tabs.');
  });

  it("prefers the model's own summary as the description, but still adds the location", () => {
    const p = describeProposal('edit_sheet', {
      summary: 'Give Vex the Alert feat so they act first',
      edits: [{ op: 'add_feat', feat: 'Alert' }],
    });
    expect(p.description).toBe('Give Vex the Alert feat so they act first');
    expect(p.text).toContain('see the Features tab');
  });

  it('leads with the model prose when it wrote any, then the concrete facts', () => {
    const p = describeProposal('edit_sheet', { edits: [{ op: 'add_feat', feat: 'Alert' }] }, 'Alert fits a scout.');
    expect(p.text.startsWith('Alert fits a scout.')).toBe(true);
    expect(p.text).toContain('add the Alert feat');
  });

  it('never produces an empty description, even with no edits at all', () => {
    const p = describeProposal('edit_sheet', {});
    expect(p.editCount).toBe(0);
    expect(p.description).toBe('change the sheet');
  });
});

describe('describeProposal — every other tool the assistant can call', () => {
  it('layout edits point at the page itself', () => {
    const p = describeProposal('customize_layout', { edits: [{ op: 'add_block' }] });
    expect(p.description).toBe('restyle the sheet itself');
    expect(p.where).toContain('the layout changes in place');
  });

  it('a PF2 edit is described from its own vocabulary and panel', () => {
    const p = describeProposal('edit_pf2_sheet', { op: 'apply_damage', amount: 7 });
    expect(p.editCount).toBe(1);
    expect(p.where).toBe('see the Health panel');
    expect(p.description.length).toBeGreaterThan(0);
  });

  it('a PF2 death-track edit points at the death track', () => {
    const p = describeProposal('edit_pf2_sheet', { op: 'set_dying', value: 2 });
    expect(p.where).toBe('see the Death track panel');
  });

  it('a level-up says which level and where the new bits land', () => {
    const p = describeProposal('level_up_character', { toLevel: 6, mode: 'vanilla' });
    expect(p.description).toBe('level this character up to level 6 (vanilla)');
    expect(p.where).toBe('see the Overview, Combat and Features tabs');
  });

  it('an undo has no location to point at — and says so by omitting the line', () => {
    const p = describeProposal('undo_last_change', {});
    expect(p.where).toBe('');
    expect(p.text).toBe('undo my most recent change to this character');
    expect(p.text).not.toContain('Where to check it');
  });

  it('an unrecognised tool still yields a usable proposal rather than blank text', () => {
    const p = describeProposal('some_future_tool', {});
    expect(p.description).toBe('change this character');
    expect(p.text.length).toBeGreaterThan(0);
  });
});

describe('a malformed bespoke tool call degrades instead of throwing', () => {
  it('PF2', () => {
    const p = describeProposal('edit_pf2_sheet', { op: 'not-a-real-op' });
    expect(p.description).toBe('change this Pathfinder 2e character');
    expect(p.where).toBe('see the Combat panel');
  });
  it('Intuitive Games', () => {
    const p = describeProposal('edit_ig_sheet', { op: 'not-a-real-op' });
    expect(p.description).toBe('change this Intuitive Games character');
    expect(p.where).toBe('see the Combat panel');
  });
});
