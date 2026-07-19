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
    expect(SRC).toContain('BODY_NONINTERACTIVE_DEFAULT=new Set(["image","background","galaxy","spingalaxy"])');
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
    expect(SRC).toContain('.body.interactive:hover .artwrap{transform:scale(1.06)');
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
    expect(SRC).toContain('[data-sector]:hover,[data-sector].sector-hover{opacity:1 !important;stroke-width:3.4 !important');
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
  it('3D sectors layer back (renderOrder -3) OR front (6) per the sector layer flag', () => {
    expect(MAP3D).toContain("const front = s.layer === 'front' || s.front === true;");
    expect(MAP3D).toContain('const ro = front ? 6 : -3;');           // front paints above bodies (renderOrder 1)
    expect(MAP3D).toContain('fill.position.set(cen.x, cen.y, zPos); fill.renderOrder = ro;');
  });
  it('3D sectors are pickable (recentred fill meshes) with hover + persistent-select styling', () => {
    expect(MAP3D).toContain('this._sectorMeshes.push(fill);');
    expect(MAP3D).toContain('_pickSector(clientX, clientY)');
    expect(MAP3D).toContain('_setSectorHover3D(mesh)');
    expect(MAP3D).toContain('_selectSector(mesh)');
    // player picks only interactive regions; the editor can pick any (to edit) — like bodies
    expect(MAP3D).toContain('if (h.object.userData._interactive || this._editable) return h.object;');
    // hover enlarges slightly + brightens; select keeps a gentler glow
    expect(MAP3D).toContain("const scale = state === 'hover' ? 1.04 : (state === 'select' ? 1.02 : 1);");
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

describe('player map: procedural space audio (owner 2026-07-18)', () => {
  it('has a SpaceAudio Web Audio module: drone bed + space noises + UI cues', () => {
    expect(SRC).toContain('const SpaceAudio=(function()');
    expect(SRC).toContain('function startDrone()'); // gliding sine-voice drone
    expect(SRC).toContain('const FAMILIES=['); // chatter/telemetry/sonar/servo/groan
    expect(SRC).toContain('function scheduleNoise()'); // Poisson-timed interjections
    expect(SRC).toMatch(/select\(\)\{if\(!ctx\|\|muted\|\|uiMuted\)return/); // select cue (also honours SFX mute)
  });
  it('exposes + wires the UI cues (click/hover/tick/zoom/select)', () => {
    expect(SRC).toContain('click(){this._blip(1200');
    expect(SRC).toContain('tick(){');
    expect(SRC).toContain('zoom(dir){');
    expect(SRC).toContain('pulseScan();hovering=false;SpaceAudio.select()'); // select cue on map pick
    expect(SRC).toContain('SpaceAudio.hover();};p.onmouseleave'); // sector hover cue
    expect(SRC).toContain('consoleDeck.addEventListener("click"'); // deck button clicks blip
  });
  it('has AUDIO controls (mute lamp + volume slider) persisted to localStorage', () => {
    expect(SRC).toContain('id="audMute"');
    expect(SRC).toContain('id="audVol"');
    expect(SRC).toContain('localStorage.setItem("starmap.audio.muted"');
  });
  it('starts audio only on a user gesture (autoplay policy)', () => {
    expect(SRC).toContain('["pointerdown","touchstart","keydown"].forEach');
  });
});

describe('player map: wheel-zoom never scrolls the page (over text or anywhere)', () => {
  it('binds the wheel handler to #mapPane (the whole container), not #stage', () => {
    expect(SRC).toContain('$("#mapPane").addEventListener("wheel"');
    expect(SRC).not.toContain('stage.addEventListener("wheel"'); // moved off stage so labels can\'t leak to page scroll
  });
});

describe('player map: systems enlarge on hover + two-way legend highlight (2D/hybrid)', () => {
  it('a hovered system enlarges (scale) + brightens, from map hover OR the list', () => {
    expect(SRC).toContain('[data-sector]:hover,[data-sector].sector-hover{opacity:1 !important;stroke-width:3.4 !important;filter:brightness(1.4) drop-shadow(0 0 6px currentColor);transform:scale(1.015);}');
    expect(SRC).toContain('transform-box:fill-box;transform-origin:center;');
  });
  it('setSectorHover links the on-map region and its system-list row both ways', () => {
    expect(SRC).toContain('function setSectorHover(id,on)');
    expect(SRC).toContain('p.classList.toggle("sector-hover",on)');
    expect(SRC).toContain('row.classList.toggle("hl",on)');
    expect(SRC).toContain('r.onmouseenter=()=>{setSectorHover(s.id,true)'); // legend row → map
    expect(SRC).toContain('setSectorHover(p.dataset.sector,true)'); // map sector → legend
  });
  it('the legend row shows a highlight style', () => {
    expect(SRC).toContain('.legrow:hover,.legrow.hl{color:var(--ink)');
  });
});

describe('3D body hover: enlarge + glow (owner 2026-07-18)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('a pointermove raycasts the body under the cursor and hovers it', () => {
    expect(MAP3D).toContain("el.addEventListener('pointermove'");
    expect(MAP3D).toContain('const bodyHover = h && h.userData.interactive ? h : null;');
    expect(MAP3D).toContain('this._setHover3D(bodyHover);');
    expect(MAP3D).toContain("el.addEventListener('pointerleave'");
  });
  it('_setHover3D enlarges ~12% + adds a soft additive glow sprite, reverting the previous', () => {
    expect(MAP3D).toContain('_setHover3D(holder)');
    expect(MAP3D).toContain('holder.scale.setScalar(holder.userData._baseScale * 1.06)');
    expect(MAP3D).toContain('_hoverGlowTex()');
    expect(MAP3D).toContain('this._hoverHolder = null;'); // reset on rebuild so no stale ref
  });
});

describe('2D body hover is a clear enlarge + glow', () => {
  it('the art scales up and glows on hover (planet/star/moon/station — all interactive)', () => {
    expect(SRC).toContain('.body.interactive:hover .artwrap{transform:scale(1.06);filter:drop-shadow(0 0 5px rgba(150,205,255,.6)) brightness(1.06);}');
  });
});

describe('console deck rework (owner 2026-07-18): audio, magnify, meter, sfx, dpad', () => {
  it('trimmed status lamps (navlink/comms/alert removed) + a scrollable bank so all toggles show', () => {
    expect(SRC).not.toContain('id="lampNav"');
    expect(SRC).not.toContain('id="lampComm"');
    expect(SRC).not.toContain('id="lampAlert"');
    expect(SRC).toMatch(/\.bank\{[^}]*overflow-y:auto/);
  });
  it('the GAIN dial is gone; MAGNIFY cycles 4 zoom framings on the selected target + spins', () => {
    expect(SRC).not.toContain('id="dialGain"');
    expect(SRC).toContain('const MAG=[6.5,4,2.6,1.7]'); // far → close framings
    expect(SRC).toContain('magLevel=(magLevel+1)%MAG.length');
    expect(SRC).toContain('dz.classList.add("spin")'); // physical spin on click
    expect(SRC).toContain('.dial.spin{animation:dialspin');
  });
  it('SFX mutes ONLY the control/zoom cues (uiMuted), not the ambient drone/noises', () => {
    expect(SRC).toContain('SpaceAudio.setUiMuted(!sfxOn)');
    expect(SRC).toContain('setUiMuted(m){uiMuted=m;}');
    expect(SRC).toContain('if(!ctx||muted||uiMuted)return'); // UI blip gated by uiMuted
  });
  it('the signal bar is a live ambient sound meter driven by an analyser', () => {
    expect(SRC).toContain('analyser=ctx.createAnalyser()');
    expect(SRC).toContain('level(){if(!analyser)return 0');
    expect(SRC).toContain('function meterLoop()');
  });
  it('the d-pad supports press-and-hold continuous panning', () => {
    expect(SRC).toContain('holdTO=setInterval(()=>panStep(dir),90)');
    expect(SRC).toContain('b.addEventListener("pointerdown"');
  });
  it('Galaxy View + Clear Screen are wired', () => {
    expect(SRC).toContain('$("#btnGalaxy").onclick=()=>{clearSelect();fit(true);magLevel=0');
    expect(SRC).toContain('$("#btnClose").onclick=()=>{clearSelect()');
  });
});

describe('meter smoothing + hybrid default + fullscreen (owner 2026-07-19)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('the sound meter damps the hum (fast floor) and jumps hard on noise transients (owner 2026-07-19)', () => {
    expect(SRC).toContain('sum+=v*v'); // RMS, not raw peak
    expect(SRC).toContain('_mFloor+=(lv-_mFloor)*(lv<_mFloor?0.06:0.02)');   // faster floor → the drone barely shows
    expect(SRC).toContain('const excess=Math.max(0,lv-_mFloor)');            // meter driven by transient energy, not the hum
    expect(SRC).toContain('28+spike*60');                                    // ~28% resting hum → leaps toward ~90% on a blip
    expect(SRC).toContain('_mCur+=(target-_mCur)*(target>_mCur?0.34:0.05)'); // snappy jump up, gentle fall
  });
  it('the player map defaults to HYBRID once the map has loaded', () => {
    expect(MAP3D).toContain("md.instances && md.instances.length) { _defaulted = true; clearInterval(iv); apply('hybrid'); }");
  });
  it('has a fullscreen toggle whose label flips to "Exit full screen"', () => {
    expect(SRC).toContain('id="fsBtn"');
    expect(SRC).toContain('fsBtn.textContent=on?"✕ Exit full screen":"⛶ Full screen"');
    expect(SRC).toContain('document.exitFullscreen||document.webkitExitFullscreen');
  });
  it('the embedded console iframe allows fullscreen', () => {
    const PAGE = readFileSync(join(process.cwd(), 'app/dnd/campaigns/[id]/console/page.tsx'), 'utf8');
    expect(PAGE).toContain('allowFullScreen');
  });
});

describe('images get NO 3D hover/select unless explicitly interactive (owner 2026-07-19)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('the 3D holder carries the interactable flag (default: images/backdrops non-interactive)', () => {
    expect(MAP3D).toContain("holder.userData.interactive = it.interactable != null ? !!it.interactable : !(it.kind === 'image' || it.kind === 'background' || it.kind === 'galaxy' || it.kind === 'spingalaxy')");
  });
  it('3D hover skips non-interactive bodies (no glow on an image)', () => {
    expect(MAP3D).toContain('const bodyHover = h && h.userData.interactive ? h : null;');
    expect(MAP3D).toContain('this._setHover3D(bodyHover);');
  });
  it('editor can select-to-edit; player cannot; hover effects gated for both', () => {
    // Editor can always select-to-edit (incl. non-interactive images); the player can only select interactive.
    expect(MAP3D).toContain('(this._editable || o.userData.interactive)) return this._select(o)');
    // But the hover EFFECTS are gated on interactive in BOTH views, so a non-interactive object never lights up.
    expect(MAP3D).toContain('const bodyHover = h && h.userData.interactive ? h : null;');
    expect(MAP3D).toContain('this._setHover3D(bodyHover);');
  });
  it('the 3D hover glow is subtler (scale 1.06, half-opacity sprite)', () => {
    expect(MAP3D).toContain('holder.userData._baseScale * 1.06');
    expect(MAP3D).toContain('opacity: 0.5');
  });
});

describe('sectors: layer + interactivity in the player (owner 2026-07-19)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  const STUDIO = readFileSync(join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
  it('2D: a sector honours layer (front/back) + interactive; non-interactive is pointer-events:none', () => {
    expect(SRC).toContain('const front=s.layer==="front"||s.front===true;const inter=s.interactive!==false;');
    expect(SRC).toContain('pointer-events:${inter?"auto":"none"}');
    expect(SRC).toContain('if(front)innerF+=piece;else innerB+=piece;');   // front → the above-bodies SVG layer
  });
  it('2D: image/galaxy/backdrop instances render BEHIND sectors (z4) so a sector is never stuck behind an image', () => {
    // Matches 3D (backdrops renderOrder -4 < sectors). Stack: backdrop(4) < back-sector(6) < body(10) < front-sector(11).
    expect(SRC).toContain('z-index:${i.behind?3:(["galaxy","image","background","spingalaxy"].includes(i.kind)?4:10)}');
    expect(SRC).toContain('const svg=mkSvg(6),svgF=mkSvg(11)');   // back sectors z6 (> backdrops), front sectors z11
  });
  it('2D: a front sector is click-through — a body under it still wins the click', () => {
    expect(SRC).toContain('if(p.dataset.front){for(const el of document.elementsFromPoint');
  });
  it('a 3D sector pick drives the same CRT + legend as a 2D click (bridges)', () => {
    expect(SRC).toContain('window.map3dSelectSector = (id) => { if(id) select({ type:"sector", id }); }');
    expect(SRC).toContain('window.map3dSectorHover = (id, on) => { if(id) setSectorHover(id, !!on); }');
    expect(SRC).toContain('else clearSelect();'); // a null 3D pick deselects the CRT
  });
  it('the editor exposes a per-sector Layer choice + Interactive toggle, and serialises them', () => {
    expect(STUDIO).toContain('id="sLayer"');
    expect(STUDIO).toContain('id="sInteract"');
    expect(STUDIO).toContain('s.layer=e.target.value;s.front=(e.target.value==="front")');
    expect(STUDIO).toContain('s.interactive=e.target.checked');
    expect(STUDIO).toContain('z:s.z,front:s.front,layer:s.layer,interactive:s.interactive');
  });
  it('the editor 3D viewer can select a sector for editing', () => {
    expect(STUDIO).toContain('window.map3dSelectSector=function(id)');
  });
});

describe('player labels: toggles reach 3D + never block the wheel (owner 2026-07-19)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('3D CSS3D labels are tagged by category so MAP LABELS toggles hide them', () => {
    expect(MAP3D).toContain('_addText(it, cat)');
    expect(MAP3D).toContain('obj.userData.labelCat = cat || null;');
    expect(MAP3D).toContain('setLabelVis(vis)');
    expect(MAP3D).toContain("it.kind === 'star' ? 'stars' : 'planets'"); // body label category
    expect(MAP3D).toContain("this._addText({ name: s.name, label: s.label, x: c.x, y: c.y }, 'systems')"); // sector label category
  });
  it('the console pushes label visibility into the 3D engine on every toggle', () => {
    expect(SRC).toContain('window.getLabelVis=()=>labelVis;');
    expect(SRC).toContain('if(window.Map3D&&window.Map3D.setLabelVis)window.Map3D.setLabelVis(labelVis);');
  });
  it('the label overlay is pointer-events:none so labels never swallow a wheel-zoom or click', () => {
    expect(SRC).toContain('#labelLayer,#labelLayer *{pointer-events:none !important;}');
  });
});

describe('player zoom: faster + double-click + works over any element (owner 2026-07-19)', () => {
  it('wheel zoom steps are larger (faster in/out) and captured before any overlay', () => {
    expect(SRC).toContain('const fdir=e.deltaY<0?1.32:0.76;');   // was 1.14 / 0.88
    expect(SRC).toContain('{passive:false,capture:true}');       // capture phase → runs first, over labels too
  });
  it('double-clicking anywhere on the map zooms in on that point', () => {
    expect(SRC).toContain('$("#mapPane").addEventListener("dblclick"');
    expect(SRC).toContain('zoomAround(e.clientX-r.left,e.clientY-r.top,2.1)');
  });
  it('hybrid zoom syncs the 3D camera SYNCHRONOUSLY on input (not a frame later) so it is not slow/dead', () => {
    expect(SRC).toContain('function sync3d()');
    expect(SRC).toContain('window.Map3D._syncFromView()');
    // called directly on the zoom inputs (wheel + zoomAround) AND from _applyNow for every view change
    expect(SRC).toContain('view.scale=ns;apply();sync3d();');           // wheel
    expect(SRC).toContain('view.scale=ns;apply(true);sync3d();');       // zoomAround (double-click, +/- buttons)
  });
});

describe('player animations stay live across tab visibility (owner 2026-07-19)', () => {
  it('re-fits + (re)starts every animation engine when the tab becomes visible', () => {
    // rAF (and CSS animation) pauses while a tab is hidden; a map opened in a background tab must animate the
    // instant the player focuses it — the swirling galaxy, spiral IMAGES, 3D-planet sprites and the starfield.
    expect(SRC).toContain('function kickAnimations()');
    expect(SRC).toContain('restart(dsCenter)');
    expect(SRC).toContain('spiralLiveImg[id].engine');
    expect(SRC).toContain('spriteLive[id]');
    expect(SRC).toContain('document.addEventListener("visibilitychange"');
  });
  it('spiral IMAGES mount a DiffSpinGalaxy engine + start it (parity with the DM editor)', () => {
    expect(SRC).toContain('function mountSpiralImages()');
    expect(SRC).toContain('rec.engine.setImage(src).then(()=>{rec.engine.fromConfig(inst.spiral);rec.engine.start();})');
    // normalizeMap must preserve each instance's spiral config + look so the player renders what the DM built
    expect(SRC).toContain('role:"",...i,look:i.look||{kind:i.kind}');
  });
});

describe('player renders spinning galaxies (kind "spingalaxy") like the editor (owner 2026-07-19)', () => {
  const MAP3D = readFileSync(join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  it('a spingalaxy body gets a live dscanvas + a mountDiffspinInstances engine (was static art() before)', () => {
    expect(SRC).toContain('else if(i.kind==="spingalaxy")bodyHTML=`<canvas class="dscanvas"');
    expect(SRC).toContain('if(i.kind==="spingalaxy")el.dataset.ds=i.id;');
    expect(SRC).toContain('function mountDiffspinInstances()');
    // drives the same engine as the DM editor, from look.image + look.dsCfg
    expect(SRC).toContain('rec.engine.setImage(look.image).then(()=>{if(look.dsCfg)rec.engine.fromConfig(look.dsCfg);rec.engine.start();})');
    expect(SRC).toContain('mountSpriteInstances();mountSpiralImages();mountDiffspinInstances();buildLegend();');
  });
  it('spingalaxy (+ galaxy) are backdrops: non-interactive by default and behind the bodies', () => {
    expect(SRC).toContain('BODY_NONINTERACTIVE_DEFAULT=new Set(["image","background","galaxy","spingalaxy"])');
  });
  it('in HYBRID the 2D layer owns spingalaxy (map3d skips it), so the 2D spin is what players see', () => {
    // map3d only renders native-3D kinds in overlay; spingalaxy is not one, so it must animate in 2D.
    expect(MAP3D).toContain('if (overlay && !this._isNative3D(it.kind)) continue;');
    expect(MAP3D).not.toContain("kind === 'spingalaxy' || kind === 'planet3d'"); // spingalaxy is NOT native-3D
  });
});

describe('player edge-feather (fade) parity with the editor (owner 2026-07-19)', () => {
  it('the console applies the same fadeMask (radial + edges shapes) as map-studio', () => {
    expect(SRC).toContain('function fadeMask(i){const f=i.fade||0;if(f<=0)return "";');
    expect(SRC).toContain('radial-gradient(closest-side, #000 ${start}%, rgba(0,0,0,${endA}) 100%)'); // radial fade
    expect(SRC).toContain('mask-composite:intersect;'); // rectangular "edges" fade
  });
  it('the fade mask is applied to a body\'s .art (image + spinning galaxy feathered to transparent)', () => {
    expect(SRC).toContain('const fadeCss=fadeMask(i);');
    expect(SRC).toContain('(i.kind==="image"||i.kind==="spingalaxy")?` style="overflow:hidden;${fadeCss}"`');
  });
  it('spiral RING blending is the engine feather (fromConfig(dsCfg) sets it) — same slices as the DM', () => {
    // DiffSpinGalaxy.fromConfig copies cfg.feather → this.feather, then re-slices with feathered ring edges.
    expect(SRC).toContain('if(cfg.feather!=null)this.feather=cfg.feather;');
    expect(SRC).toMatch(/fromConfig\(cfg\)\{[\s\S]*if\(this\.img\)this\._slice\(\);\}/);
  });
});
