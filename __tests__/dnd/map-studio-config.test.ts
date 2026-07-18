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
