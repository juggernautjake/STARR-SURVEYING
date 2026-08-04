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
import { isReservedDrawLayer, getDefaultLayerOrder } from '@/lib/cad/styles/default-layers';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/cad/components/PropertyPanel.tsx'), 'utf8');

describe('both move-to-layer selects filter the reserved layer', () => {
  it('uses a filtered list rather than every layer in layerOrder', () => {
    expect(src).toContain('isReservedDrawLayer');
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
