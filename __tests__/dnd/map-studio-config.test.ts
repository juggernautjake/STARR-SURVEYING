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
});
