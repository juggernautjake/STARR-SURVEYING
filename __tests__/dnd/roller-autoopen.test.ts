// __tests__/dnd/roller-autoopen.test.ts — click-to-roll pops the roller open on EVERY template + system.
//
// The owner's rule: clicking a rollable element rolls it AND, if the floating roller was minimized/closed,
// pops it open so the throw is seen — on any system, any template. Every roller STAGE (what PF2/IG mount,
// and the 5e stage path) must therefore call `useExpandOnRoll` with its feed token. This source-anchors that
// so a new roller or a refactor can't silently drop the auto-open on one template.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the auto-open hook is centralized', () => {
  it('FloatingRoller exports a single useExpandOnRoll that expands on a NEW token', () => {
    const src = read('app/dnd/_sheet/components/rollers/FloatingRoller.tsx');
    expect(src).toContain('export function useExpandOnRoll');
    expect(src).toMatch(/token === seen\.current/); // only fires on a token it hasn't seen
    expect(src).toMatch(/expand\(\)/);
  });
});

describe('every roller stage wires the auto-open (so it works on every template + system)', () => {
  const stages: [string, string][] = [
    ['Dice Core', 'app/dnd/_sheet/components/RollStage.tsx'],
    ['Sigil Stack', 'app/dnd/_sheet/components/rollers/SigilStack.tsx'],
    ['Roll Board', 'app/dnd/_sheet/components/rollers/RollBoard.tsx'],
    ['Impact', 'app/dnd/_sheet/components/rollers/ImpactRoller.tsx'],
  ];
  for (const [name, path] of stages) {
    it(`${name} calls useExpandOnRoll(activeRoll?.token)`, () => {
      const src = read(path);
      expect(src).toContain('useExpandOnRoll');
      expect(src).toMatch(/useExpandOnRoll\(activeRoll\?\.token\)/);
    });
  }
});

describe('the bespoke PF2/IG sheets mount the roller inside a FloatingRoller (so expand() is real)', () => {
  for (const path of ['app/dnd/_ui/IGSheet.tsx', 'app/dnd/_ui/PF2Sheet.tsx']) {
    it(`${path} wraps its roller node in <FloatingRoller>`, () => {
      const src = read(path);
      expect(src).toMatch(/<FloatingRoller[^>]*>\{roller\}<\/FloatingRoller>/);
    });
  }
});
