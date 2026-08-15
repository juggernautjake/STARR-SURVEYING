// C33 — "everything on this layer" as an AI scope.
//
// ── THE ONE DECISION THAT MATTERS ───────────────────────────────────────────────────────────────
//
// C32 gave the scope a pin: a frozen list of ids, which is exactly right for "these twelve". A
// layer scope is a **different kind of thing** and freezing it would be wrong in a way that is very
// hard to notice.
//
// A surveyor scopes to FENCE, draws three more fence lines while thinking, then says "shorten
// these". With a snapshot the three new ones are silently excluded — while the chip has said
// "Layer: FENCE" the entire time. The scope would be lying by omission about the one thing it
// exists to state.
//
// So: `ScopeRef` is a discriminated union, and a LAYER scope resolves live on every turn.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveScopeIds,
  scopeStaleCount,
  scopeLayerName,
  summariseScope,
} from '@/lib/cad/ai/scope';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

const layer = (id: string, name: string): Layer => ({
  id, name,
  visible: true, locked: false, frozen: false,
  color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
});

const feat = (id: string, layerId: string): Feature => ({
  id, type: 'LINE',
  geometry: { type: 'LINE' },
  layerId,
  style: { ...DEFAULT_FEATURE_STYLE },
  properties: {},
});

function docWith(features: Feature[], layers: Layer[]): DrawingDocument {
  return {
    features: Object.fromEntries(features.map((f) => [f.id, f])),
    layers: Object.fromEntries(layers.map((l) => [l.id, l])),
  } as unknown as DrawingDocument;
}

const LAYERS = [layer('L1', 'BOUNDARY'), layer('L2', 'FENCE'), layer('L3', 'DEMOLITION')];
const DOC = docWith(
  [feat('a', 'L1'), feat('b', 'L2'), feat('c', 'L2')],
  LAYERS,
);

describe('a layer scope resolves LIVE', () => {
  it('is every feature on the layer, now', () => {
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'L2' }, [], DOC).sort()).toEqual(['b', 'c']);
  });

  it('picks up features drawn AFTER the scope was chosen', () => {
    // The whole slice. With a snapshot, a surveyor who scopes to FENCE, draws three more fence
    // lines and then says "shorten these" silently loses the three — while the chip said
    // "Layer: FENCE" the entire time.
    const later = docWith(
      [feat('a', 'L1'), feat('b', 'L2'), feat('c', 'L2'), feat('d', 'L2')],
      LAYERS,
    );
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'L2' }, [], later).sort())
      .toEqual(['b', 'c', 'd']);
  });

  it('drops features moved OFF the layer', () => {
    const moved = docWith([feat('a', 'L1'), feat('b', 'L1'), feat('c', 'L2')], LAYERS);
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'L2' }, [], moved)).toEqual(['c']);
  });

  it('is empty for a layer with nothing on it — and that is a real scope', () => {
    // "Everything on DEMOLITION" is a meaningful thing to say about a layer about to be drawn on.
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'L3' }, ['a'], DOC)).toEqual([]);
  });

  it('is empty for a layer that no longer exists, not the live selection', () => {
    // Falling back to the selection here would silently act on a completely different set while
    // the chip still named the deleted layer.
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'GONE' }, ['a', 'b'], DOC)).toEqual([]);
  });

  it('is empty with no document to resolve against', () => {
    // Not "everything on the layer" — nothing knowable. Returning the live selection would be the
    // same silent-wrong-set failure.
    expect(resolveScopeIds({ kind: 'LAYER', layerId: 'L2' }, ['a'])).toEqual([]);
  });
});

describe('an IDS scope is still frozen', () => {
  it('does not pick up new features', () => {
    // The two kinds must behave differently, or one of them is wrong. "These twelve" stays twelve.
    const later = docWith([feat('a', 'L1'), feat('b', 'L2'), feat('z', 'L2')], LAYERS);
    expect(resolveScopeIds({ kind: 'IDS', ids: ['b'] }, [], later)).toEqual(['b']);
  });
});

describe('staleness belongs to IDS only', () => {
  it('a layer scope is never stale', () => {
    // It resolves live, so it has nothing to have lost. Reporting "3 gone" after a surveyor
    // deleted three fence lines would describe an ordinary edit as a problem with the scope.
    const emptied = docWith([feat('a', 'L1')], LAYERS);
    expect(scopeStaleCount(emptied, { kind: 'LAYER', layerId: 'L2' })).toBe(0);
  });

  it('an ids scope still reports what it lost', () => {
    expect(scopeStaleCount(DOC, { kind: 'IDS', ids: ['b', 'gone'] })).toBe(1);
  });
});

describe('naming the layer', () => {
  it('uses the layer name', () => {
    expect(scopeLayerName(DOC, 'L2')).toBe('FENCE');
  });

  it('falls back to the id so a deleted layer still reads as something', () => {
    expect(scopeLayerName(DOC, 'GONE')).toBe('GONE');
  });

  it('and the summary of a layer scope is the layer’s features', () => {
    const ids = resolveScopeIds({ kind: 'LAYER', layerId: 'L2' }, [], DOC);
    expect(summariseScope(DOC, ids).layers).toEqual(['FENCE']);
  });
});

describe('wiring', () => {
  const store = readFileSync(
    join(process.cwd(), 'lib/cad/store/ai-conversations-store.ts'), 'utf8',
  );
  const chip = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/AIScopeChip.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const panel = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/LayerPanel.tsx'), 'utf8',
  );

  it('the store can pin a layer', () => {
    expect(store).toMatch(/pinLayerScope: \(layerId\) => set\(\{ pinnedScope: \{ kind: 'LAYER', layerId \} \}\)/);
  });

  it('an EMPTY layer is still pinnable, unlike an empty selection', () => {
    // Different rules on purpose: "everything on DEMOLITION" is meaningful for a layer about to be
    // drawn on; "these zero features" is not meaningful about a selection.
    expect(store).not.toMatch(/pinLayerScope[\s\S]{0,120}length > 0/);
  });

  it('the send path resolves against the document', () => {
    // Sliced rather than pattern-matched across the call: the comment inside it is long enough
    // that every window I tried either missed the argument or was wide enough to be meaningless.
    const call = store.slice(store.indexOf('resolveScopeIds('));
    expect(call.slice(0, 500)).toMatch(/\bdoc,/);
    expect(call.slice(0, 500)).toMatch(/get\(\)\.pinnedScope/);
  });

  it('the chip names the layer rather than repeating the breakdown', () => {
    // "Layer: FENCE" is what the surveyor chose; "9 features · 9 LINE · FENCE" describes the same
    // thing without saying the scope keeps up as they draw.
    expect(chip).toMatch(/pinnedScope\?\.kind === 'LAYER'/);
    expect(chip).toMatch(/isLayer \? 'Layer'/);
    expect(chip).toMatch(/scopeLayerName\(doc, pinnedScope\.layerId\)/);
  });

  it('an empty layer scope does not read as "Nothing selected"', () => {
    expect(chip).toMatch(/summary\.count === 0 && !isLayer/);
  });

  it('is reachable from the layer context menu, and opens the panel', () => {
    // Scoping to a layer and then having to go find the AI panel would leave the surveyor
    // wondering whether it took.
    expect(panel).toMatch(/Use as AI scope/);
    expect(panel).toMatch(/pinLayerScope\(contextMenu\.layerId\)/);
    expect(panel).toMatch(/pinLayerScope\(contextMenu\.layerId\);[\s\S]{0,120}\.open\(\)/);
  });
});
