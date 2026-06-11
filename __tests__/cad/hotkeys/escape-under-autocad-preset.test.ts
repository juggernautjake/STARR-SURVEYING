// __tests__/cad/hotkeys/escape-under-autocad-preset.test.ts
//
// cad-domain-audit Slice K — Slice 5's Esc-clears-chord handler
// collided with the AutoCAD preset, which rebinds Escape to
// `tool.select`. Surveyors on that preset had to press Esc TWICE
// when a chord was buffered (once to clear, once to fire Select).
// The Slice K fix re-dispatches Esc after clearing the buffer, but
// skips the redispatch when Esc resolves to the cancel-verb default
// (`edit.deselect`) so the Slice 5 behaviour survives.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findActionForKey } from '@/app/admin/cad/hooks/useHotkeys';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { AUTOCAD_PRESET } from '@/lib/cad/hotkeys/presets';
import type { UserBinding } from '@/lib/cad/hotkeys';

function presetToBindings(preset: Record<string, string>): UserBinding[] {
  return Object.entries(preset).map(([actionId, key]) => ({ actionId, key }));
}

describe('findActionForKey — resolves user-override → default', () => {
  it('returns the DEFAULT-preset action bound to Escape (edit.deselect)', () => {
    const a = findActionForKey(DEFAULT_ACTIONS, [], 'escape');
    expect(a?.id).toBe('edit.deselect');
  });

  it('when two actions collide on the same key, the last one wins (mirrors engine.buildTree)', () => {
    // Synthetic: two actions both bound to 'q' — engine.buildTree
    // overwrites the leaf, so the second action wins.
    const fakeActions = [
      {
        id: 'a.first', category: 'TOOLS', label: 'first', description: '',
        defaultKey: 'q', isChord: false, context: 'CANVAS',
      },
      {
        id: 'a.second', category: 'TOOLS', label: 'second', description: '',
        defaultKey: 'q', isChord: false, context: 'CANVAS',
      },
    ] as const;
    const a = findActionForKey(fakeActions, [], 'q');
    expect(a?.id).toBe('a.second');
  });

  it('honours the AutoCAD preset rebind: Escape → tool.select', () => {
    const bindings = presetToBindings(AUTOCAD_PRESET);
    const a = findActionForKey(DEFAULT_ACTIONS, bindings, 'escape');
    expect(a?.id).toBe('tool.select');
  });

  it('returns null when nothing is bound to the queried key', () => {
    expect(findActionForKey(DEFAULT_ACTIONS, [], 'f24')).toBeNull();
  });

  it('an empty-string override removes the binding from the lookup', () => {
    const a = findActionForKey(
      DEFAULT_ACTIONS,
      [{ actionId: 'edit.deselect', key: '' }],
      'escape',
    );
    expect(a).toBeNull();
  });
});

describe('useHotkeys — Esc dispatch logic discriminates by bound action', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'hooks', 'useHotkeys.ts'),
    'utf8',
  );

  it('reads the live userBindings off the store inside the Esc handler', () => {
    expect(SRC).toMatch(
      /event\.key === 'Escape' && engine\.getBufferedPrefix\(\)\.length > 0[\s\S]*?useHotkeysStore\.getState\(\)\.userBindings/,
    );
  });

  it('dispatches the Esc-bound action UNLESS it is the cancel-verb default', () => {
    expect(SRC).toMatch(
      /if \(escAction && escAction\.id !== 'edit\.deselect'\) \{\s*\n\s*dispatchDefaultAction\(escAction\);/,
    );
  });
});
