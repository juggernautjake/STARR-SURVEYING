// __tests__/dnd/map-studio-field-audit.test.ts — every editor field is CLASSIFIED, so a dropped one is loud.
//
// The rules-platform doc has carried this as a partial for a while: *"a fixture asserting every editable
// field of every kind reaches the 3D config — so a new slider cannot be added without wiring it"*, with the
// honest note that the full audit needs a per-field 2D-only-vs-3D judgement.
//
// This is that judgement, written down once and then enforced. The bug class is specific and has already
// bitten TWICE in this file's history:
//   · `cloudAmount` — the editor wrote it, the model read `cloudCov`, nothing translated. The slider moved
//     and the preview did not.
//   · `atmoThick` — same shape, found by auditing every field against the chokepoint after the first.
// The doc's own comment predicted more ("assume more are"), which is exactly why a one-off audit is worth
// less than a fixture: a NEW field added tomorrow re-opens the hole silently.
//
// So the rule enforced here is not "every field reaches 3D" — most legitimately do not. It is: **every
// field the editor persists is either consumed by the 3D chokepoint or listed below with a reason.** An
// unclassified field fails, which forces the author of the next slider to make the call deliberately.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const STUDIO = read('public/dnd/maps/map-studio.html');
const MAP3D = read('public/dnd/maps/map3d.js');

/** Just the chokepoint's body, so a coincidental mention elsewhere in a 1200-line file cannot satisfy us. */
const CFG = MAP3D.slice(MAP3D.indexOf('_genericPlanetCfg(it)'), MAP3D.indexOf('_debrisModel(it)'));

/** Every look field the editor persists — read from `snapshotLook`, which is what actually gets saved. */
function persistedFields(): string[] {
  const start = STUDIO.indexOf('function snapshotLook(');
  expect(start, 'snapshotLook should exist — it is the source of this list').toBeGreaterThan(-1);
  const body = STUDIO.slice(start, start + 1600);
  // Anchored on `const {`, not on the function's own opening brace. Slicing from the first `{` swept in the
  // `const {` prefix, so the FIRST field parsed as `const {kind` and was silently dropped by the identifier
  // filter below — a parser that quietly loses a field is precisely the hole this fixture exists to close.
  // Caught by the dead-entry check further down, which is why that check is worth having.
  const from = body.indexOf('const {');
  expect(from, 'snapshotLook should destructure its argument').toBeGreaterThan(-1);
  const destructure = body.slice(from + 'const {'.length, body.indexOf('}', from));
  return [...new Set(
    destructure.split(',').map((s) => s.trim()).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
  )];
}

/**
 * Fields that legitimately never reach `_genericPlanetCfg`, each with the reason it does not.
 *
 * Grouped by WHY, not alphabetically, because the grouping is the audit: a field in the wrong group is a
 * classification error someone can spot, whereas a flat ignore-list is just a way to silence the test.
 */
const NOT_PLANET_3D: Record<string, string> = {
  // ── Belong to a different body KIND, which has its own model builder ──────────────────────────────
  brightness: 'star — buildStarModel',
  coronaSize: 'star — buildStarModel',
  rays: 'star — buildStarModel',
  raySpec: 'star — buildStarModel',
  breathe: 'star — buildStarModel',
  stype: 'star subtype',
  dtype: 'debris subtype',
  c1: 'debris/asteroid/nebula palette — _debrisModel and the 2D art',
  c2: 'debris/asteroid/nebula palette',
  c3: 'nebula palette (2D)',
  arms: 'spiral galaxy (2D)',
  turns: 'spiral galaxy (2D)',
  tight: 'spiral galaxy (2D)',
  spread: 'spiral galaxy (2D)',
  len: 'spiral galaxy (2D)',
  spinDur: 'CSS animation duration for the 2D sprite, not a 3D spin rate',

  // ── Image / sprite kinds, which are drawn rather than modelled ────────────────────────────────────
  image: 'image body — a texture, not a generated planet',
  src: 'image body source',
  natW: 'intrinsic image width',
  natH: 'intrinsic image height',
  svgData: 'inline SVG body',
  sheet: 'sprite sheet',
  cols: 'sprite sheet columns',
  rows: 'sprite sheet rows',
  frames: 'sprite sheet frame count',

  // ── Structural, not a look value ──────────────────────────────────────────────────────────────────
  kind: 'the discriminator itself — chooses which builder runs',
  dsCfg: 'deep-space composite config, consumed by its own builder',
  cfg3d: 'a pre-built 3D config blob — passed to the model wholesale, not mapped field by field',
};

describe('map studio: every persisted look field is classified', () => {
  const fields = persistedFields();

  it('reads a plausible field list from snapshotLook', () => {
    // Guard the guard: if the parse breaks, this test must fail loudly rather than pass on an empty list.
    expect(fields.length).toBeGreaterThan(30);
    expect(fields).toContain('ptype');
    expect(fields).toContain('cloudAmount');
  });

  for (const f of persistedFields()) {
    it(`${f}: reaches the 3D config, or is classified as not belonging there`, () => {
      const reaches = new RegExp(`\\bL\\.${f}\\b|'${f}'`).test(CFG);
      const classified = Object.prototype.hasOwnProperty.call(NOT_PLANET_3D, f);
      expect(
        reaches || classified,
        `"${f}" is persisted by the editor but neither consumed by _genericPlanetCfg nor listed in ` +
        `NOT_PLANET_3D. If it is a planet/moon control, wire it — a slider that silently does nothing is ` +
        `worse than a missing one. If it belongs to another body kind or is 2D-only, add it with a reason.`,
      ).toBe(true);
    });
  }

  it('the classification list has no dead entries', () => {
    // A field removed from the editor should drop out of this list too, or the list rots into fiction.
    for (const f of Object.keys(NOT_PLANET_3D)) {
      expect(fields, `NOT_PLANET_3D lists "${f}", which snapshotLook no longer persists`).toContain(f);
    }
  });
});

describe('the two translations this fixture exists to protect', () => {
  it('cloudAmount still reaches the model as cloudCov', () => {
    expect(CFG).toMatch(/rich\.cloudCov\s*=\s*\+L\.cloudAmount/);
  });

  it('atmoThick still reaches the model as atmoDensity, scaled not copied', () => {
    // A straight copy would be wrong: atmoThick is 0.10–1.00 (default 0.55) and density is a multiplier
    // defaulting to 1, so dividing by the editor's own default keeps every existing map rendering as it does.
    expect(CFG).toMatch(/rich\.atmoDensity\s*=\s*\+L\.atmoThick\s*\/\s*0\.55/);
  });
});
