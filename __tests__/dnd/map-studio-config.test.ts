// __tests__/dnd/map-studio-config.test.ts — Slice 29 regression guard: the map studio's editor names some
// planet controls differently from the 3D model's fields (cloudAmount/cloudColor vs cloudCov/cloudTint), and
// _genericPlanetCfg is the single chokepoint that must TRANSLATE them so a slider actually reaches the model
// (a control that silently does nothing is worse than a missing one). This locks that translation + the
// cloud-style→shape mapping against regression. Source-anchored: map3d.js is a vanilla browser script (no ES
// exports), so we assert on its source rather than importing it — the same approach used for other
// client-only behaviors.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
// Just the _genericPlanetCfg body, so we don't match a coincidence elsewhere in the 1200-line file.
const cfg = SRC.slice(SRC.indexOf('_genericPlanetCfg(it)'), SRC.indexOf('_debrisModel(it)'));

describe('map studio: _genericPlanetCfg translates editor field names to the model (Slice 29)', () => {
  it('exists and is the caller-shared config builder', () => {
    expect(cfg).toContain('_genericPlanetCfg(it)');
    expect(cfg.length).toBeGreaterThan(200);
  });

  it('translates the editor cloud controls (cloudAmount/cloudColor) into the model fields (cloudCov/cloudTint)', () => {
    // The bug the doc fixed: cranking the cloud slider updated edWork but never told the model, because the
    // names didn't match. These translations are what make the slider reach the 3D preview.
    expect(cfg).toMatch(/rich\.cloudCov\s*=\s*\+?L\.cloudAmount/);
    expect(cfg).toMatch(/rich\.cloudTint\s*=\s*L\.cloudColor/);
  });

  it('maps cloudStyle "none" to zero cover so 2D and 3D agree, and named styles to shape knobs', () => {
    expect(cfg).toMatch(/cloudStyle\b/);
    expect(cfg).toMatch(/=== 'none'.*rich\.cloudCov\s*=\s*0/s);
    // A couple of the style→shape mappings the fix added, so "banded"/"storm" look like themselves in 3D.
    expect(cfg).toMatch(/=== 'banded'/);
    expect(cfg).toMatch(/=== 'storm'/);
  });

  it('forwards the rich pass-through fields (clouds, storms, rings, tilt, atmosphere) only when set', () => {
    // The allowlist that carries editor-set fields through to buildPlanetModel — a dropped name here is the
    // classic "slider does nothing" bug. Spot-check the key groups are present in the list.
    for (const field of ['cloudCov', 'storms', 'ringColor', 'tilt', 'atmoDensity', 'lightOn']) {
      expect(cfg, `rich field "${field}" missing from the pass-through list`).toContain(`'${field}'`);
    }
  });

  it('forwards city / lava / lightColor to the model, and the model consumes them (Slice 29)', () => {
    // The doc's finding: these ARE forwarded + consumed — they read as "missing" only because they're
    // self-lit and glow on the NIGHT side while the preview sun leaves almost no terminator (a separate,
    // deferred visual concern). Lock the PLUMBING so a future edit can't silently drop it and recreate the
    // "slider does nothing" bug for lava/city/light colour the way clouds and water once were.
    expect(cfg).toMatch(/const lava\s*=\s*num\(L\.lava/);
    expect(cfg).toMatch(/city\s*=\s*L\.city\s*!=\s*null/);
    expect(cfg).toMatch(/lightColor\s*=\s*L\.lightColor/);
    expect(cfg).toMatch(/lava,\s*city,\s*lightColor/); // carried onto the assembled config for planet + moon

    const MODEL = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/planet3d-model.js'), 'utf8');
    expect(MODEL).toMatch(/cfg\.lava/);
    expect(MODEL).toMatch(/cfg\.city/);
    expect(MODEL).toMatch(/cfg\.lightColor/);
  });

  it('forwards the TERRAIN fields (sea/cscale/coast/ice) to the model, and the model reads them (Slice 29)', () => {
    // Water was the second big mapping fix (the sea slider was inverted + not reaching 3D). These are
    // confirmed-3D fields — _genericPlanetCfg forwards each via num(L.<field>, …) for planet AND moon, and
    // planet3d-model reads cfg.<field> to shade the surface — so guarding them (no visual judgment needed)
    // stops a regression that silently drops terrain from the 3D preview the way clouds/water once were.
    for (const f of ['sea', 'cscale', 'coast', 'ice']) {
      expect(cfg, `_genericPlanetCfg drops "${f}"`).toMatch(new RegExp(`${f}:\\s*num\\(L\\.${f}`));
    }
    const MODEL = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/planet3d-model.js'), 'utf8');
    for (const f of ['sea', 'cscale', 'coast', 'ice']) {
      expect(MODEL, `planet3d-model never reads cfg.${f}`).toMatch(new RegExp(`cfg\\.${f}`));
    }
  });
});

describe('map studio: object-editor sliders re-render in REAL TIME, not on release (Slice 29 / DND_RULES 2385)', () => {
  const STUDIO = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
  // The original report — "the clouds are not increasing whenever I crank the slider" — is a control that
  // only reacts on release. The fix is that every continuous slider binds `.oninput` (fires on every drag
  // step) and calls edPreview() so the preview updates live. Lock the reported controls so a regression to
  // `.onchange` (release-only) fails here.
  for (const id of ['edSea', 'edCloudAmt', 'edLava', 'edCity']) {
    it(`#${id} binds .oninput and re-renders the preview live (never .onchange)`, () => {
      // the binding drives edWork + calls edPreview() on every input step
      const re = new RegExp(`\\$\\("#${id}"\\)\\.oninput\\s*=\\s*e\\s*=>\\{[^}]*edPreview\\(\\)`);
      expect(STUDIO).toMatch(re);
      // and it must NOT be wired on the release-only change event
      expect(STUDIO).not.toContain(`$("#${id}").onchange`);
    });
  }
});

// ── The exhaustive per-field audit (rules-platform doc, Slice 35a) ──────────────────────────────────
// The doc's standing worry: "Two of these have now been mapping gaps; assume more are." Auditing every
// editor field against the `_genericPlanetCfg` chokepoint found exactly one more — atmosphere thickness —
// and classified the rest. These lock the finding and the classification.
describe('map studio: every editor field reaches the renderer it claims to (Slice 35a audit)', () => {
  const STUDIO = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
  const MAP3D = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map3d.js'), 'utf8');
  const MODEL = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/planet3d-model.js'), 'utf8');

  it('translates Atmosphere → Thickness (atmoThick) into the model field (atmoDensity)', () => {
    // The editor writes `atmoThick` and the 2D art reads it; the shader reads `atmoDensity`, which nothing
    // set — so the slider moved the 2D rim and left 3D untouched. Same class as the cloud bug, same fix site.
    expect(STUDIO).toMatch(/edWork\.atmoThick=\+e\.target\.value\/100/);   // the editor writes atmoThick…
    expect(MODEL).toContain('cfg.atmoDensity');                             // …the shader reads atmoDensity…
    expect(MAP3D).toMatch(/rich\.atmoDensity\s*=\s*\+L\.atmoThick/);        // …so the chokepoint translates.
  });

  it('preserves every existing map’s appearance by mapping the editor default to density 1', () => {
    // atmoThick defaults to 0.55 and density defaults to 1. Dividing by the editor's own default is what
    // keeps an untouched planet rendering exactly as it did before the control was wired up.
    expect(STUDIO).toMatch(/edWork\.atmoThick!=null\?edWork\.atmoThick:0\.55/);
    expect(MAP3D).toMatch(/\+L\.atmoThick \/ 0\.55/);
  });

  it('star fields bypass the planet mapping entirely — the whole look goes to buildStarModel', () => {
    // Why the audit's "not forwarded by _genericPlanetCfg" list is not a bug list: stars never go through
    // that function. If this ever changes to a mapped cfg, every star field below needs re-checking.
    expect(MAP3D).toMatch(/buildStarModel\(b\.it\.look \|\| \{\}/);
    for (const f of ['c1', 'c2', 'c3', 'brightness', 'coronaSize', 'breathe', 'raySpec']) {
      expect(MODEL, `buildStarModel should read ${f}`).toContain(`cfg.${f}`);
    }
  });

  it('says so in the UI where a field genuinely cannot exist in 3D', () => {
    // svgData is the one genuinely 2D-only appearance field: an imported SVG is inlined as markup, which WebGL
    // cannot draw (unlike an image body's src, which becomes a textured plane). The editor promises both
    // renderers honour its controls, so the exception is labelled rather than left as a dead control.
    expect(MAP3D).not.toContain('svgData');
    expect(STUDIO).toContain('2D map only');
    expect(STUDIO).toMatch(/Use an <b>Image<\/b> body if you need it to appear in 3D/);
  });
});

// ── Backdrop spiral (rules-platform doc, Slice 35c) ────────────────────────────────────────────────
// "If feasible: a background mode that applies the ring-spin (inner rings faster → a spiral), with the
// existing spiral controls exposed for the background." Feasible, and built by reusing the SAME
// DiffSpinGalaxy engine the placed-image spiral already uses — the only blocker was that #bgLayer is a
// CSS background-image while ring-spin needs a canvas to slice.
describe('map studio: the backdrop can ring-spin into a spiral (Slice 35c)', () => {
  const STUDIO = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');

  it('swaps #bgLayer to a full-bleed canvas when the mode is on, and back to CSS when off', () => {
    // The two paths are exclusive: leaving the CSS background set under the canvas would double-draw.
    expect(STUDIO).toMatch(/if\(bg\.spiral&&bg\.spiral\.on\)\{[\s\S]{0,200}canvas class="bgspiralcanvas"/);
    expect(STUDIO).toMatch(/L\.style\.backgroundImage="";[\s\S]{0,120}bgspiralcanvas/);
  });

  it('reuses the placed-image spiral engine rather than a second implementation', () => {
    expect(STUDIO).toMatch(/spiralBg=\{engine:new DiffSpinGalaxy\(cv,\{rings:bg\.spiral\.rings\|\|6/);
    expect(STUDIO).toContain('spiralBg.engine.fromConfig(bg.spiral)');
  });

  it('re-decodes the image only when the source changes, so a knob drag cannot restart the rotation', () => {
    // Rebuilding the engine per render would reset the ring angles and re-decode the image every frame.
    expect(STUDIO).toMatch(/if\(spiralBg\.imageURL!==bg\.src\)/);
    expect(STUDIO).toMatch(/const [rmf]=\$\("#bgSp[RMF]"\);[^\n]*mountSpiralBackground\(\)/);
  });

  it('tears the engine down when the mode is switched off', () => {
    expect(STUDIO).toMatch(/if\(!want\)\{if\(spiralBg\)\{try\{spiralBg\.engine\.destroy\(\)/);
  });

  it('exposes the same three knobs the placed-image spiral has', () => {
    for (const id of ['bgSpOn', 'bgSpR', 'bgSpM', 'bgSpF']) expect(STUDIO).toContain(`id="${id}"`);
    expect(STUDIO).toContain('{on:false,rings:6,master:1,feather:0.12}'); // identical defaults
  });

  it('keeps the knob column in a CLASS, not inline, so revealing the box cannot flatten it to a row', () => {
    // The toggle handler sets only `display`; an inline flex-direction would be lost the moment the box
    // was revealed live, laying the three sliders side by side in the narrow sidebar. (Found in a
    // screenshot, not by a test — hence the guard.)
    expect(STUDIO).toMatch(/\.bgspwrap\{display:flex;flex-direction:column/);
    expect(STUDIO).toContain('id="bgSpWrap" class="bgspwrap"');
    expect(STUDIO).not.toMatch(/w\.style\.display=e\.target\.checked\?"flex":"none"/);
  });
});
