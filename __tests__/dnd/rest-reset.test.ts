// __tests__/dnd/rest-reset.test.ts — short/long rest reset behavior.
//
// shortRest and longRest are store callbacks (not pure), so source-anchored like other client-only
// behavior. These pin the RAW-correct reset rules that were otherwise unguarded: a short rest refreshes
// only short-reset resources; a long rest refreshes everything (all resources, all spell slots, HP to
// max, temp HP cleared, exhaustion down one). A regression that (say) refreshed long-rest resources on a
// short rest, or forgot to restore spell slots on a long rest, now fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const shortRest = STORE.slice(STORE.indexOf('const shortRest'), STORE.indexOf('const longRest'));
const longRest = STORE.slice(STORE.indexOf('const longRest'), STORE.indexOf('const rollDeathSave'));

describe('short rest refreshes only short-reset resources', () => {
  it('resets resources whose resetOn is "short" to max, leaves others', () => {
    expect(shortRest).toMatch(/resetOn === 'short' \? \{ \.\.\.r, current: r\.max \}/);
  });
  it('does NOT touch spell slots (short rest never restores slots — Warlock pact aside)', () => {
    expect(shortRest).not.toContain('spellcasting');
  });
});

describe('long rest refreshes everything (RAW)', () => {
  it('restores HP to max and clears temp HP', () => {
    expect(longRest).toContain('currentHp: c.combat.maxHp');
    expect(longRest).toContain('tempHp: 0');
  });
  it('resets EVERY resource (no short/long filter) and restores every spell slot', () => {
    expect(longRest).toMatch(/resources: c\.resources\.map\(\(r\) => \(\{ \.\.\.r, current: r\.max \}\)\)/);
    expect(longRest).toMatch(/slots:[\s\S]*current: s!\.max/);
  });
  it('removes one level of exhaustion (2024), floored at 0', () => {
    expect(longRest).toContain('exhaustion: Math.max(0, c.combat.exhaustion - 1)');
  });
  it('clears death-save progress and resets the transform surge', () => {
    expect(longRest).toContain('deathSuccess: 0');
    expect(longRest).toContain('deathFail: 0');
    expect(longRest).toContain('transformsThisRest: 0');
  });
});
