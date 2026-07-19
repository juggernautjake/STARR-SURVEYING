// __tests__/dnd/map-console-interactivity.test.ts — player-view element interactivity (owner 2026-07-18:
// "making ALL elements interactive by default makes for weird behavior; images should not be interactive by
// default, planets/moons should be; add a per-element toggle"). Before, EVERY .body in the player console was
// interactive (cursor:pointer, hover-halo, and hover z-index:200), so hovering an image raised it in front of
// the planets. Now interactivity is defaulted by kind (images/backdrops off, bodies on) + honours an explicit
// `interactable` flag, and only interactive bodies react to hover. Source-anchored (vanilla HTML page).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'public/dnd/maps/console.html'), 'utf8');

describe('player console: default interactivity by kind', () => {
  it('images + backdrops are the non-interactive-by-default kinds', () => {
    expect(SRC).toContain('BODY_NONINTERACTIVE_DEFAULT=new Set(["image","background"])');
  });
  it('interactivity honours an explicit per-element flag, else defaults by kind', () => {
    expect(SRC).toContain('i.interactable != null ? !!i.interactable : !BODY_NONINTERACTIVE_DEFAULT.has(i.kind)');
    expect(SRC).toContain('(interactive?" interactive":" noninteractive")');
  });
  it('a non-interactive body is pointer-events:none so hover passes through (never captures/raises)', () => {
    expect(SRC).toContain('.body.noninteractive{pointer-events:none;}');
  });
  it('only an interactive body raises above the rest on hover (the fixed z-index bug)', () => {
    expect(SRC).toContain('.body.interactive:hover{z-index:200 !important;}');
    expect(SRC).not.toContain('.body:hover{z-index:200 !important;}'); // the old unscoped rule is gone
  });
  it('interactive bodies get a hover affordance — enlarge + glow', () => {
    expect(SRC).toContain('.body.interactive:hover .artwrap{transform:scale(1.07);}');
    expect(SRC).toMatch(/\.body\.interactive:hover\{filter:drop-shadow/);
  });
  it('non-interactive bodies wire no select/hover handlers', () => {
    expect(SRC).toContain('if(interactive){');
  });
});
