// __tests__/cad/hotkeys/select-instant.test.ts
//
// cad-ux-cleanup-pass Slice 5 — plain `s` is now an instant Select.
// Scale + Spline moved off the `s` chord prefix to `Shift+S` /
// `Shift+P`, so the engine sees `s` as a clean leaf and fires it on
// keydown (no chord-timeout wait). Esc dismisses any buffered chord
// without firing the pending action, and the ChordHUD surfaces the
// dismiss hint.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHotkeyEngine } from '@/lib/cad/hotkeys/engine';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import type { BindableAction } from '@/lib/cad/hotkeys/types';

function engine(onAction: (a: BindableAction) => void) {
  // Fake timers — pending-fires never auto-trigger so a missing
  // instant-fire shows up as a missed call instead of a delayed one.
  return createHotkeyEngine({
    actions: DEFAULT_ACTIONS,
    getContext: () => 'CANVAS',
    chordTimeoutMs: 1_000_000,
    onAction,
    setTimer: () => 0,
    clearTimer: () => undefined,
  });
}

const press = (
  key: string,
  { shift = false, ctrl = false, alt = false, meta = false } = {},
) => ({
  key, ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta,
});

describe('registry — `s` chord prefix removed', () => {
  const find = (id: string) => DEFAULT_ACTIONS.find((a) => a.id === id)!;

  it('tool.select is a single-key `s` (no chord)', () => {
    const a = find('tool.select');
    expect(a.defaultKey).toBe('s');
    expect(a.isChord).toBe(false);
  });

  it('tool.scale is Shift+S (no chord)', () => {
    const a = find('tool.scale');
    expect(a.defaultKey).toBe('shift+s');
    expect(a.isChord).toBe(false);
  });

  it('tool.spline is Shift+P (no chord)', () => {
    const a = find('tool.spline');
    expect(a.defaultKey).toBe('shift+p');
    expect(a.isChord).toBe(false);
  });
});

describe('engine — `s` fires Select instantly', () => {
  it('plain `s` keydown fires tool.select with no pending wait', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('s'));
    expect(fired).toEqual(['tool.select']);
    expect(eng.getBufferedPrefix()).toBe('');
  });

  it('Shift+S fires tool.scale instantly', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('s', { shift: true }));
    expect(fired).toEqual(['tool.scale']);
  });

  it('Shift+P fires tool.spline instantly', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('p', { shift: true }));
    expect(fired).toEqual(['tool.spline']);
  });

  it('Shift held on plain `s` does NOT fall through to Select', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('s', { shift: true }));
    expect(fired).toEqual(['tool.scale']);
  });
});

describe('engine — remaining chord prefixes still buffer (Esc dismissible)', () => {
  it('`p` is still ambiguous (Point vs polyline/polygon) so it buffers a pending fire', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('p'));
    expect(fired).toEqual([]);
    expect(eng.getBufferedPrefix()).toBe('p');
  });

  it('resetBuffer clears a pending chord without firing the buffered action', () => {
    const fired: string[] = [];
    const eng = engine((a) => fired.push(a.id));
    eng.handleKeyEvent(press('p'));
    eng.resetBuffer();
    expect(fired).toEqual([]);
    expect(eng.getBufferedPrefix()).toBe('');
  });
});

describe('useHotkeys — chord timeout + Escape dismiss wired in', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'hooks', 'useHotkeys.ts'),
    'utf8',
  );
  it('chord timeout shortened to 1500 ms (no more 6 s wait)', () => {
    expect(SRC).toMatch(/chordTimeoutMs:\s*1500/);
  });
  it('Escape during a buffered chord calls engine.resetBuffer instead of firing the pending action', () => {
    expect(SRC).toMatch(
      /event\.key === 'Escape' && engine\.getBufferedPrefix\(\)\.length > 0[\s\S]*?engine\.resetBuffer\(\)/,
    );
  });
});

describe('ChordHUD — dismiss hint visible while a chord is buffered', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'ChordHUD.tsx'),
    'utf8',
  );
  it('renders an "Esc to cancel" hint footer', () => {
    expect(SRC).toMatch(/>\s*Esc\s*<\/kbd>[\s\S]*?to cancel/);
  });
});
