// __tests__/dnd/builder-phases-per-system.test.ts — every system's guided builder walks the same phases.
//
// Found in the final-QA walkthrough (slice 15) by actually driving the PF2 builder UI rather than probing
// its planner: the guided builder gave **5e** Foundations → Levels → Review, and **PF2 and IG** only
// Foundations → Review. Both systems have a working level walker of their own — `PF2LevelBuilder` and
// `IGLevelBuilder`, each with its own route and test suite, both already mounted on the standalone
// /levels page — they were simply never wired into this flow. So a Pathfinder or IG player walking the
// guided builder never reached the walker, while a 5e player did.
//
// The repo's signature defect, one more time: authored, tested, and not wired.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/builder/page.tsx'), 'utf8');

describe('the guided builder offers a Levels phase for every levelled system', () => {
  it('mounts each system’s OWN walker, not a shared one', () => {
    // These are genuinely different implementations reading different routes (/levels, /pf2-levels,
    // /ig-levels) — the point is that each system reaches its own, not that they share code.
    expect(SRC).toContain('import PF2LevelBuilder');
    expect(SRC).toContain('import IGLevelBuilder');
    expect(SRC).toContain('<PF2LevelBuilder');
    expect(SRC).toContain('<IGLevelBuilder');
    expect(SRC).toContain('<LevelBuilder');
  });

  it('pushes a Levels phase in all three branches', () => {
    const levelsSteps = SRC.match(/id: 'levels', title: 'Level by level', phase: 'Levels'/g) ?? [];
    expect(levelsSteps.length, 'expected a Levels step for 5e, PF2 and IG').toBe(3);
  });

  it('feeds each walker the identity it keys off', () => {
    // PF2 walks by class; IG walks by SUBCLASS (its schedule is per-subclass), with the class as fallback.
    expect(SRC).toMatch(/<PF2LevelBuilder[\s\S]{0,220}className=\{data\.meta\?\.className \?\? ''\}/);
    expect(SRC).toMatch(/<IGLevelBuilder[\s\S]{0,220}subclass=\{data\.meta\?\.subclass \|\| data\.meta\?\.className \|\| ''\}/);
  });

  it('keeps Review last for every system', () => {
    // The Review step is pushed after the per-system branches, so adding a Levels phase cannot reorder it.
    expect(SRC.indexOf("id: 'review'")).toBeGreaterThan(SRC.lastIndexOf("phase: 'Levels'"));
  });
});
