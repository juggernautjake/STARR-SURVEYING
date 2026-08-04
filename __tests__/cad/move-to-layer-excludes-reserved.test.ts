// CAD_AUDIT Slice S13h — the reserved sheet-info layer is not offered as a move destination.
//
// The last gap in the reserved-layer rule, and the most deliberate route into it. S13 stopped you
// DRAWING on SURVEY-INFO; S13e stopped a deleted layer's geometry MIGRATING onto it. Both
// "move to layer" selects in the Property panel still listed every layer in `layerOrder` — and
// `layerOrder[0]` is SURVEY-INFO. So a surveyor could select a boundary and simply choose it.
//
// Geometry parked there disappears the moment someone toggles the sheet furniture off, which is the
// ordinary way to look at a drawing without its title block.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isReservedDrawLayer, getDefaultLayerOrder, drawableLayerIds } from '@/lib/cad/styles/default-layers';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/cad/components/PropertyPanel.tsx'), 'utf8');

describe('both move-to-layer selects filter the reserved layer', () => {
  it('uses a filtered list rather than every layer in layerOrder', () => {
    expect(src).toContain('drawableLayerIds');
    expect(src).toContain('const moveTargets =');
  });

  it('applies it to the BULK move select', () => {
    expect(src).toContain('moveTargets(sharedLayerId)');
  });

  it('applies it to the SINGLE-feature select', () => {
    expect(src).toContain('moveTargets(feature.layerId)');
  });

  it('no longer maps the unfiltered list into an <option>', () => {
    // The specific regression: `{layers.map((l) => <option …>)}`. If it comes back, the reserved
    // layer is a destination again.
    expect(src).not.toMatch(/\{layers\.map\(\(l\) =>/);
  });
});

describe('the exception that keeps it usable', () => {
  // Reimplements the one-line predicate so the RULE is asserted, not just the source text. A feature
  // already on SURVEY-INFO — an older drawing, an AI edit, an import predating these rules — must
  // still show its current layer, or the select renders blank and the surveyor cannot see where the
  // geometry is, let alone move it off.
  const moveTargets = (layerIds: readonly string[], currentId: string | null) =>
    layerIds.filter((id) => !isReservedDrawLayer(id) || id === currentId);

  const ORDER = getDefaultLayerOrder();

  it('excludes the reserved layer for a feature on a normal layer', () => {
    const drawable = ORDER.find((id) => !isReservedDrawLayer(id))!;
    expect(moveTargets(ORDER, drawable).some(isReservedDrawLayer)).toBe(false);
  });

  it('INCLUDES it for a feature already sitting on it', () => {
    const reserved = ORDER.find(isReservedDrawLayer)!;
    expect(moveTargets(ORDER, reserved)).toContain(reserved);
  });

  it('still offers somewhere to move that feature TO', () => {
    // Including the current layer would be useless if it were the only option left.
    const reserved = ORDER.find(isReservedDrawLayer)!;
    expect(moveTargets(ORDER, reserved).filter((id) => id !== reserved).length).toBeGreaterThan(0);
  });

  it('handles a null current layer without offering the reserved one', () => {
    expect(moveTargets(ORDER, null).some(isReservedDrawLayer)).toBe(false);
  });
});

// ── S13i: the context menu had TWO more routes ───────────────────────────────────────────────────
//
// Found by verifying S13h's claim that it had closed the last one. It had not. `FeatureContextMenu`
// carries `buildLayerTransferSubmenu` (copy AND move to layer) and a `moveToLayer` submenu, both
// built from the unfiltered layer list — so a right-click still offered SURVEY-INFO as a destination
// for a boundary.
//
// Eighth and ninth sites in this family. Asserting the claim is what found them; asserting it again
// is what keeps them shut.

describe('the right-click menu also excludes the reserved layer', () => {
  const menu = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/cad/components/FeatureContextMenu.tsx'), 'utf8');

  it('filters the transfer submenu (copy and move)', () => {
    expect(menu).toContain('drawableLayerIds');
    expect(menu).toMatch(/moveTargets\(\)\.filter\(\(l\) => l && !l\.locked\)/);
  });

  it('filters the move-to-layer submenu', () => {
    expect(menu).toContain('moveTargets(feature.layerId).map');
  });

  it('no longer builds either submenu from the unfiltered list', () => {
    // The specific regressions: `layers.filter((l) => l && !l.locked)` and `layers.map((l) => ({`.
    expect(menu).not.toMatch(/targets = layers\.filter/);
    expect(menu).not.toMatch(/submenu: layers\.map/);
  });

  it('keeps excluding LOCKED layers as well — the pre-existing rule', () => {
    // The reserved filter is additive. Dropping the locked check while adding this one would trade
    // one silent-destination bug for another.
    expect(menu).toContain('!l.locked');
  });
});

// ── S13j: one definition, and a guard against a thirteenth site ──────────────────────────────────
//
// Going looking (rather than trusting S13i's paragraph) found THREE more: the feature-properties
// dialog's layer select and both "Send to layer" controls in the point viewer. Tenth, eleventh and
// twelfth.
//
// At that point the fix stopped being "filter this list too". Two rounds of fixes had each claimed to
// find the last site and each was wrong, because the filter was being RE-TYPED per site. A rule
// enforced in five places is a rule that will be enforced in four the next time someone adds a
// sixth — so it now lives once, in `drawableLayerIds`.

describe('the reserved-layer rule has ONE definition', () => {
  const CONSUMERS = [
    'app/admin/cad/components/PropertyPanel.tsx',
    'app/admin/cad/components/FeatureContextMenu.tsx',
    'app/admin/cad/components/FeaturePropertiesDialog.tsx',
    'app/admin/cad/components/PointDataViewer.tsx',
  ];

  it('every layer-destination surface imports the shared helper', () => {
    for (const f of CONSUMERS) {
      const txt = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(txt, f).toContain('drawableLayerIds');
    }
  });

  it('none of them re-implements the predicate locally', () => {
    // The exact regression that produced sites 10-12: someone filters `isReservedDrawLayer` inline
    // instead of calling the helper, and the next surface added copies THAT.
    for (const f of CONSUMERS) {
      const txt = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(txt, `${f} should call drawableLayerIds, not filter isReservedDrawLayer inline`)
        .not.toMatch(/filter\([^)]*isReservedDrawLayer/);
    }
  });

  it('the helper re-admits the current layer and excludes the rest', () => {
    // The behaviour every consumer now depends on, asserted once against the real function.
    const order = getDefaultLayerOrder();
    const reserved = order.find(isReservedDrawLayer)!;
    expect(drawableLayerIds(order).some(isReservedDrawLayer)).toBe(false);
    expect(drawableLayerIds(order, reserved)).toContain(reserved);
  });
});

// ── S13k: the thirteenth site, and the one that must NOT be filtered ─────────────────────────────
//
// S13j's sweep enumerated LayerTransferDialog among its candidates and did not check it. It has two
// layer lists, and they are different kinds — which is why "filter every layer list on sight" would
// have been the wrong fix:
//
//   * the transfer TARGET select (writes `options.targetLayerId`) — a destination. Filtered.
//   * the "By layer ▾" dropdown — SELECTS features by layer rather than moving them. Not filtered,
//     because a surveyor may legitimately want to select what is sitting on SURVEY-INFO — including,
//     specifically, geometry that landed there before these rules existed and now needs moving off.

describe('LayerTransferDialog distinguishes destination from selection', () => {
  const dlg = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/cad/components/LayerTransferDialog.tsx'), 'utf8');

  it('filters the transfer TARGET select', () => {
    expect(dlg).toContain('drawableLayerIds(layerOrder)');
  });

  it('does NOT filter the by-layer SELECTION dropdown', () => {
    // Asserted positively: the selection helper must still see every layer. If someone "tidies up"
    // by filtering both, selecting the features stranded on the reserved layer becomes impossible —
    // which would make the reserved-layer rule a trap rather than a guard.
    const byLayer = dlg.slice(dlg.indexOf('helperByLayer'));
    expect(byLayer).toContain('layerOrder.map');
  });

  it('still offers the create-a-new-layer escape hatch', () => {
    // The transfer target list is now shorter; the way out of "no suitable layer" must remain.
    expect(dlg).toContain("value=\"__new__\"");
  });
});
