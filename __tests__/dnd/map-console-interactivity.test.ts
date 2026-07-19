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

describe('stations render no phantom atmosphere (owner 2026-07-18)', () => {
  const STUDIO = readFileSync(join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
  it('only round bodies (planet/moon) get the circular .artbg backing — not stations/debris/asteroids', () => {
    // The border-radius:50% .artbg disc behind a NON-round station read as an atmosphere halo.
    expect(SRC).toContain('const solid=["planet","planet3d","moon"].includes(i.kind)');
    expect(SRC).not.toContain('["planet","planet3d","moon","station","debris","asteroid"].includes(i.kind)');
    expect(STUDIO).toContain('if(!["planet","planet3d","moon"].includes(i.kind))return ""');
  });
});

describe('zoom/pan is rAF-throttled (no per-event jank)', () => {
  it('apply() coalesces to one requestAnimationFrame instead of running synchronously each event', () => {
    expect(SRC).toContain('if(_applyRaf!=null)return;');
    expect(SRC).toContain('_applyRaf=requestAnimationFrame(');
    expect(SRC).toContain('function _applyNow(anim)'); // the real work moved here, called once per frame
  });
});

describe('editor per-element interactivity toggle (map-studio)', () => {
  const STUDIO2 = readFileSync(join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
  it('the inspector has an interactive checkbox defaulting by kind', () => {
    expect(STUDIO2).toContain('id="iInteract"');
    expect(STUDIO2).toContain('i.interactable!=null?i.interactable:!["image","background"].includes(i.kind)');
  });
  it('the toggle writes i.interactable (the flag the player view reads) and re-renders', () => {
    expect(STUDIO2).toContain('iv.onchange=e=>{i.interactable=e.target.checked;renderInstances();markDirty();}');
  });
});
