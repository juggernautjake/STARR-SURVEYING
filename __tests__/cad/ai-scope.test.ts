// C32 — "do this to THESE".
//
// ── WHAT WAS ALREADY TRUE, AND WHAT THE SLICE ACTUALLY ASKS FOR ─────────────────────────────────
//
// The live selection was already sent to the model on every turn and digested by
// `buildSelectionDigest`, so the AI could always *see* it. The slice asks for something else: that
// the scope be **explicit and visible, not inferred from a prompt**. Two failures follow from
// leaving it implicit, and only one of them is about visibility:
//
//   INVISIBLE   the surveyor cannot see what the AI is about to act on before pressing send. Four
//               hundred features from a rubber-band ten minutes ago look exactly like none.
//
//   DRIFTING    the scope is read when the message is SENT, not when it was composed. Clicking the
//               canvas mid-sentence — to look at the thing being described — silently changed what
//               "these" meant. **That is the worst shape of bug**: the request was right, the
//               answer was right for a different question, and nothing looked wrong afterwards.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  summariseScope,
  resolveScopeIds,
  scopeStaleCount,
} from '@/lib/cad/ai/scope';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

const layer = (id: string, name: string): Layer => ({
  id, name,
  visible: true, locked: false, frozen: false,
  color: '#000', lineWeight: 0.75, lineTypeId: 'SOLID', opacity: 1,
  groupId: null, sortOrder: 0, isDefault: false, isProtected: false, autoAssignCodes: [],
});

const feat = (id: string, type: Feature['type'], layerId: string): Feature => ({
  id, type,
  geometry: { type: type === 'POINT' ? 'POINT' : 'LINE' },
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

const DOC = docWith(
  [
    feat('a', 'POINT', 'L1'), feat('b', 'POINT', 'L1'), feat('c', 'POINT', 'L1'),
    feat('d', 'LINE', 'L2'), feat('e', 'LINE', 'L2'),
    feat('f', 'LINE', 'L3'),
  ],
  [layer('L1', 'BOUNDARY'), layer('L2', 'FENCE'), layer('L3', 'TOPO')],
);

describe('the label a surveyor reads before pressing send', () => {
  it('counts, types and layers', () => {
    const s = summariseScope(DOC, ['a', 'b', 'd']);
    expect(s.count).toBe(3);
    expect(s.byType).toEqual({ POINT: 2, LINE: 1 });
    expect(s.layers).toEqual(['BOUNDARY', 'FENCE']);
    expect(s.label).toBe('3 features · 2 POINT, 1 LINE · BOUNDARY, FENCE');
  });

  it('says so plainly when there is nothing', () => {
    // "0 features · ·" would be a chip that technically told the truth and read as broken.
    expect(summariseScope(DOC, []).label).toBe('Nothing selected');
  });

  it('is singular for one', () => {
    expect(summariseScope(DOC, ['a']).label).toMatch(/^1 feature ·/);
  });

  it('truncates a wide layer spread rather than wrapping', () => {
    // The chip is one line by design. A scope spanning nine layers is a fact the surveyor needs at
    // a glance, not a list they need to read.
    const many = docWith(
      Array.from({ length: 6 }, (_, i) => feat(`f${i}`, 'LINE', `L${i}`)),
      Array.from({ length: 6 }, (_, i) => layer(`L${i}`, `LAYER${i}`)),
    );
    const s = summariseScope(many, ['f0', 'f1', 'f2', 'f3', 'f4', 'f5']);
    expect(s.layers).toHaveLength(6);
    expect(s.label).toMatch(/\+3$/);
  });

  it('lists the busiest type first', () => {
    // A scope of 40 points and one line is "40 POINT, 1 LINE", not the other way round — the chip
    // has to lead with what the request is mostly about.
    expect(summariseScope(DOC, ['a', 'b', 'c', 'd']).label).toMatch(/3 POINT, 1 LINE/);
  });
});

describe('a pinned scope outlives the features in it', () => {
  it('drops ids that no longer exist from the count', () => {
    // The surveyor can pin twelve, delete four, then send. A scope claiming twelve while acting on
    // eight would be a lie in the one place this feature exists to prevent one.
    const s = summariseScope(DOC, ['a', 'ghost', 'd']);
    expect(s.count).toBe(2);
    expect(s.ids).toEqual(['a', 'd']);
  });

  it('reports the shortfall instead of silently shrinking', () => {
    // Quietly correcting would mean the surveyor sends "move these twelve", eight move, and the
    // chip agreed with itself the whole time.
    expect(scopeStaleCount(DOC, ['a', 'ghost', 'gone'])).toBe(2);
    expect(scopeStaleCount(DOC, ['a', 'd'])).toBe(0);
  });

  it('reports nothing stale when following the live selection', () => {
    expect(scopeStaleCount(DOC, null)).toBe(0);
  });
});

describe('resolving which ids a turn acts on', () => {
  it('the pin wins over the live selection', () => {
    // The whole point of pinning. Returning the live selection instead would make the pin
    // decorative — the surveyor said "these", then went on looking at the drawing.
    expect(resolveScopeIds(['a', 'b'], ['d', 'e', 'f'])).toEqual(['a', 'b']);
  });

  it('falls through to the live selection when nothing is pinned', () => {
    expect(resolveScopeIds(null, ['d'])).toEqual(['d']);
    expect(resolveScopeIds(null, [])).toEqual([]);
  });

  it('an empty pin is treated as a pin, not as absent', () => {
    // The distinction matters at the store boundary, which refuses to create one — see below.
    expect(resolveScopeIds([], ['d'])).toEqual([]);
  });
});

describe('the store', () => {
  const src = readFileSync(
    join(process.cwd(), 'lib/cad/store/ai-conversations-store.ts'), 'utf8',
  );

  it('sends the RESOLVED scope, not the raw selection', () => {
    expect(src).toMatch(/resolveScopeIds\(\s*get\(\)\.pinnedScope,/);
  });

  it('refuses to pin an empty selection', () => {
    // Freezing "nothing" and then following the live selection are confusing in both directions.
    // Refusing keeps the chip to two honest states.
    expect(src).toMatch(/pinnedScope: ids\.length > 0 \? \[\.\.\.ids\] : null/);
  });

  it('copies the ids rather than holding the caller’s array', () => {
    // The caller passes `Array.from(selectedIds)` today, but a future one holding a live reference
    // would make the pin drift — which is the exact bug being fixed.
    expect(src).toMatch(/\[\.\.\.ids\]/);
  });

  it('does NOT persist the pin', () => {
    // A pin is a statement about this conversation right now. Restoring one from last week would
    // silently scope a fresh request to features the surveyor has long forgotten choosing — the
    // failure this slice is about, put back in a worse form.
    const partialize = src.slice(src.indexOf('partialize:'), src.indexOf('partialize:') + 400);
    expect(partialize).not.toMatch(/pinnedScope/);
    expect(partialize).toMatch(/conversations: s\.conversations/);
  });
});

describe('the chip', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/admin/cad/components/AIScopeChip.tsx'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('shows the resolved scope, so pinned and live read the same way', () => {
    expect(src).toMatch(/resolveScopeIds\(pinnedScope, live\)/);
    expect(src).toMatch(/summariseScope\(doc, effective\)/);
  });

  it('says whether it is pinned', () => {
    expect(src).toMatch(/pinned \? 'Pinned' : 'Scope'/);
  });

  it('surfaces the stale count', () => {
    expect(src).toMatch(/data-testid="ai-scope-stale"/);
    expect(src).toMatch(/\{stale\} gone/);
  });

  it('cannot pin nothing', () => {
    expect(src).toMatch(/disabled=\{live\.length === 0\}/);
    expect(src).toMatch(/Select something to pin/);
  });

  it('offers the way back', () => {
    // A mode you can enter and not leave is C26's isolate bug, one panel over.
    expect(src).toMatch(/onClick=\{clearScope\}/);
    expect(src).toMatch(/follow the canvas selection again/);
  });

  it('is mounted above the composer', () => {
    // It answers "what does 'these' mean", and the surveyor needs that while they are still
    // typing rather than after the request has gone.
    const dock = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/AIChatDock.tsx'), 'utf8',
    );
    const chipAt = dock.indexOf('<AIScopeChip />');
    const composerAt = dock.indexOf('{/* Composer */}');
    expect(chipAt).toBeGreaterThan(-1);
    expect(chipAt).toBeLessThan(composerAt);
  });
});
