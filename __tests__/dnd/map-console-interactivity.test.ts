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

describe('player console: sectors visible + hover/focus (owner 2026-07-18)', () => {
  it('back sectors render ABOVE the nebula fxCanvas (z-index 5) so the DM-drawn regions show', () => {
    expect(SRC).toContain('const svg=mkSvg(6)'); // was mkSvg(2), buried under the z-index-5 nebula
    expect(SRC).not.toContain('const svg=mkSvg(2),svgF=mkSvg(11)');
  });
  it('sectors get a slight hover animation + a stronger focus highlight', () => {
    expect(SRC).toContain('[data-sector]:hover{opacity:1 !important;stroke-width:3.4 !important');
    expect(SRC).toContain('[data-sector].sector-focus{');
    expect(SRC).toContain('transition:opacity .22s ease,stroke-width .22s ease,filter .22s ease');
  });
  it('clicking a system in the legend focuses + highlights it via the sector-focus class', () => {
    expect(SRC).toContain('r.onclick=()=>select({type:"sector",id:s.id})');
    expect(SRC).toContain('p.classList.toggle("sector-focus",p.dataset.sector===s.id)');
  });
  it('sectors stay below the bodies (z-index 10) so planets in a region remain clickable', () => {
    expect(SRC).toContain('svgF=mkSvg(11)'); // front sectors above bodies; back sectors (6) below bodies (10)
  });
});

describe('3D/hybrid sector layering (owner 2026-07-18)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('3D sectors render at renderOrder -3 with depthTest off (paint order decides layering)', () => {
    expect(MAP3D).toContain('fill.position.z = zPos; fill.renderOrder = -3;');
  });
  it('backdrops (image/galaxy/…) paint BEHIND the sectors; planets IN FRONT; behind = fully back', () => {
    expect(MAP3D).toContain("const isBackdrop = it.kind === 'image' || it.kind === 'background' || it.kind === 'galaxy' || it.kind === 'spingalaxy'");
    expect(MAP3D).toContain('const bodyRO = it.behind ? -5 : (isBackdrop ? -4 : 1);');
    expect(MAP3D).toContain('plane.renderOrder = bodyRO');
    expect(MAP3D).toContain('disc.renderOrder = bodyRO');
  });
  it('the LOD-promoted full model keeps the impostor render order (send-back/front survives)', () => {
    expect(MAP3D).toContain('const ro = b.disc ? b.disc.renderOrder : 1;');
    expect(MAP3D).toContain('o.renderOrder = ro;');
  });
});

describe('player map viewer: touch support (mobile)', () => {
  it('handles 1-finger pan + 2-finger pinch-zoom (mouse handlers do not fire on touch)', () => {
    expect(SRC).toContain('stage.addEventListener("touchstart"');
    expect(SRC).toContain('stage.addEventListener("touchmove"');
    expect(SRC).toContain('stage.addEventListener("touchend"');
    expect(SRC).toContain('e.touches.length===2'); // pinch
    expect(SRC).toMatch(/pinch=\{dist:Math\.hypot/); // pinch tracks finger distance
  });
  it('gives the stage touch-action:none so the browser hands us the gestures', () => {
    expect(SRC).toContain('#stage{position:absolute;inset:0;cursor:grab;touch-action:none;}');
  });
  it('a tap on a body/sector still reaches its handler; a tap on empty deselects', () => {
    expect(SRC).toContain('t.target.closest(".body")');
    expect(SRC).toContain('if(!pan.moved&&(selectedId||curSel))clearSelect()');
  });
});

describe('player map: label-visibility toggles (owner 2026-07-18)', () => {
  it('has MAP LABELS lamps for planets/stars/systems/all in the console deck', () => {
    expect(SRC).toContain('id="lblPlanets"');
    expect(SRC).toContain('id="lblStars"');
    expect(SRC).toContain('id="lblSystems"');
    expect(SRC).toContain('id="lblAll"');
    expect(SRC).toContain('MAP LABELS');
  });
  it('labelVis gates each label category in buildLabelLayer', () => {
    expect(SRC).toContain('const labelVis={planets:true,stars:true,systems:true}');
    expect(SRC).toContain('if(labelVis.systems)(MAP.sectors||[]).forEach'); // systems → sector labels
    expect(SRC).toContain('const cat=bodyLabelCat(i.kind)'); // planets vs stars by kind
    expect(SRC).toContain('bodyLabelCat(kind){return kind==="star"?"stars":"planets";}');
  });
  it('toggling a lamp rebuilds just the label overlay (refreshLabels), and ALL is a master', () => {
    expect(SRC).toContain('function refreshLabels()');
    expect(SRC).toContain('function toggleLabel(cat){labelVis[cat]=!labelVis[cat]');
    expect(SRC).toContain('labelVis.planets=labelVis.stars=labelVis.systems=next');
  });
});
