// __tests__/dnd/system-detect.test.ts — the library chat's cross-system check.
// It must (a) catch a question that's really about another system, (b) NOT fire on questions the
// focused system answers itself (false positives would nag on every message), and (c) never
// suggest the system you're already focused on.
import { describe, it, expect } from 'vitest';
import { detectOtherSystem, crossSystemInstruction } from '@/lib/dnd/system-detect';
import { SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

describe('detectOtherSystem — explicit names', () => {
  it('catches a system named outright while focused elsewhere', () => {
    const h = detectOtherSystem('how does initiative work in Pathfinder 2e?', 'dnd5e-2024');
    expect(h?.key).toBe('pathfinder2e');
    expect(h?.reason).toBe('named');
  });

  it('catches Call of Cthulhu from focus on 5e', () => {
    expect(detectOtherSystem('whats a sanity check in call of cthulhu', 'dnd5e-2014')?.key).toBe('coc7e');
  });

  it('never suggests the system you are already focused on', () => {
    expect(detectOtherSystem('how do blades in the dark clocks work?', 'blades')).toBeNull();
    expect(detectOtherSystem('explain pathfinder 2e off-guard', 'pathfinder2e')).toBeNull();
  });
});

describe('detectOtherSystem — signature mechanics', () => {
  it('flags rage while focused on Call of Cthulhu (no such concept there)', () => {
    const h = detectOtherSystem('how does rage work?', 'coc7e');
    expect(h?.key).toBe('dnd5e-2024');
    expect(h?.reason).toBe('mechanic');
    expect(h?.matched).toBe('rage');
  });

  it('flags proficiency bonus while focused on Blades', () => {
    expect(detectOtherSystem("what's my proficiency bonus?", 'blades')?.key).toBe('dnd5e-2024');
  });

  it('flags sanity while focused on Cyberpunk RED', () => {
    expect(detectOtherSystem('do I roll sanity for that?', 'cyberpunk-red')?.key).toBe('coc7e');
  });

  it('flags Essence/Decker while focused on Cyberpunk RED (adjacent but different system)', () => {
    expect(detectOtherSystem('how much essence does that cost?', 'cyberpunk-red')?.key).toBe('shadowrun6e');
  });

  it('flags Base Attack Bonus while focused on PF2e', () => {
    expect(detectOtherSystem('what is my base attack bonus at level 6', 'pathfinder2e')?.key).toBe('pathfinder1e');
  });
});

describe('detectOtherSystem — no false positives', () => {
  it('does not fire on a plain question in the focused system', () => {
    expect(detectOtherSystem('how does advantage work?', 'dnd5e-2024')).toBeNull();
    expect(detectOtherSystem('how much damage does a greatsword do?', 'dnd5e-2014')).toBeNull();
    expect(detectOtherSystem('how do I make a skill check?', 'coc7e')).toBeNull();
  });

  it('does not flag rage for a 5e focus — it is 5e’s own mechanic', () => {
    expect(detectOtherSystem('how does rage work?', 'dnd5e-2014')).toBeNull();
    expect(detectOtherSystem('how does rage work?', 'dnd5e-2024')).toBeNull();
  });

  it('does not flag a term the focused system genuinely uses', () => {
    // Pathfinder 1e HAS rage (Barbarian) — asking about it while focused there is fine.
    expect(detectOtherSystem('how does rage work?', 'pathfinder1e')).toBeNull();
    // Blades HAS stress + trauma.
    expect(detectOtherSystem('what happens at 9 stress and trauma?', 'blades')).toBeNull();
    // Shadowrun HAS essence + glitch.
    expect(detectOtherSystem('what is a glitch and how does essence drop?', 'shadowrun6e')).toBeNull();
  });

  it('does not fire when the chat has no system focus', () => {
    expect(detectOtherSystem('how does rage work?', SYSTEM_AMBIGUOUS)).toBeNull();
  });

  it('ignores an empty question', () => {
    expect(detectOtherSystem('   ', 'coc7e')).toBeNull();
  });

  it('does not match a term inside a longer word', () => {
    // "outrageous" must not trigger the "rage" signature.
    expect(detectOtherSystem('that seems outrageous, is it balanced?', 'coc7e')).toBeNull();
  });
});

describe('crossSystemInstruction', () => {
  it('tells the model to answer FIRST and then ask — never to refuse or switch', () => {
    const h = detectOtherSystem('how does rage work?', 'coc7e')!;
    const ins = crossSystemInstruction(h, 'Call of Cthulhu 7e');
    expect(ins).toMatch(/Answer as best you can for Call of Cthulhu 7e/);
    expect(ins).toMatch(/never answer using D&D 5e \(2024\)'s rules/i);
    expect(ins).toMatch(/ONE short question asking whether they meant D&D 5e \(2024\)/);
    expect(ins).toMatch(/switch the chat's system focus/);
  });
});
