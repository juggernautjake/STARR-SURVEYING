// __tests__/cad/hotkeys/chord-hud-user-bindings.test.ts
//
// cad-domain-audit Slice J — ChordHUD builds its completion index
// from the ENGINE-MERGED bindings (user override → default), not
// from `defaultKey` alone. A surveyor who rebinds `p l` (Polyline)
// to `p x` now sees `[X] Polyline` in the HUD instead of stale
// defaults; clearing a binding drops it from the list entirely.

import { describe, it, expect } from 'vitest';
import { buildChordIndex } from '@/app/admin/cad/components/ChordHUD';
import type { BindableAction, UserBinding } from '@/lib/cad/hotkeys';

const action = (
  id: string,
  defaultKey: string,
  over: Partial<BindableAction> = {},
): BindableAction => ({
  id,
  category: 'TOOLS',
  label: id,
  description: id,
  defaultKey,
  isChord: defaultKey.includes(' '),
  context: 'CANVAS',
  ...over,
});

describe('buildChordIndex — user bindings win', () => {
  it('uses the registry defaults when there are no user bindings', () => {
    const idx = buildChordIndex(
      [action('tool.polyline', 'p l'), action('tool.point', 'p')],
      [],
    );
    expect(idx.get('p')?.map((c) => c.rest)).toEqual(['l']);
  });

  it('a user override REPLACES the default chord step in the HUD', () => {
    const idx = buildChordIndex(
      [action('tool.polyline', 'p l')],
      [{ actionId: 'tool.polyline', key: 'p x' } as UserBinding],
    );
    expect(idx.get('p')?.map((c) => c.rest)).toEqual(['x']);
  });

  it('an empty-string override means "no binding" — action drops out', () => {
    const idx = buildChordIndex(
      [action('tool.polyline', 'p l')],
      [{ actionId: 'tool.polyline', key: '' } as UserBinding],
    );
    expect(idx.get('p')).toBeUndefined();
  });

  it('a user override that demotes a chord to a single key drops it from the HUD', () => {
    // The HUD only displays multi-step chords — single-key bindings
    // fire instantly and don't need the "…then" prompt.
    const idx = buildChordIndex(
      [action('tool.polyline', 'p l')],
      [{ actionId: 'tool.polyline', key: 'shift+l' } as UserBinding],
    );
    expect(idx.get('p')).toBeUndefined();
    // And the new single-key binding isn't surfaced as a chord either.
    expect(idx.get('shift+l')).toBeUndefined();
  });

  it('completions are sorted alphabetically by `rest` for predictable display', () => {
    const idx = buildChordIndex(
      [
        action('tool.polygon',  'p g'),
        action('tool.polyline', 'p l'),
        action('tool.path',     'p a'),
      ],
      [],
    );
    expect(idx.get('p')?.map((c) => c.rest)).toEqual(['a', 'g', 'l']);
  });

  it('a non-overridden action keeps its default chord when others get overrides', () => {
    const idx = buildChordIndex(
      [
        action('tool.polyline', 'p l'),
        action('tool.polygon',  'p g'),
      ],
      [{ actionId: 'tool.polyline', key: 'p x' } as UserBinding],
    );
    expect(idx.get('p')?.map((c) => `${c.id}:${c.rest}`).sort()).toEqual([
      'tool.polygon:g',
      'tool.polyline:x',
    ]);
  });
});
