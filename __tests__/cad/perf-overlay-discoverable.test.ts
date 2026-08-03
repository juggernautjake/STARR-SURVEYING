// The performance overlay is findable without knowing a hotkey.
//
// It existed, worked, and was reachable ONLY by pressing `Ctrl+Alt+P` — advertised in no menu, no
// command palette, and no hotkey list. Nothing in the UI mentioned it.
//
// The cost of that is measurable: TWO confident and wrong performance analyses were written in a
// single session — one claiming the render loop had no dirty check (it has one, shipped as
// `cad-desktop-tauri-and-perf` Slices P3/P3b), and one claiming the profiling fixtures were never
// built (they are, at 1k/50k/200k) — both produced by reading source while a live p50/p95/p99
// histogram sat one keystroke away.
//
// Undiscoverable instrumentation is why people reason instead of measure. This is the smallest
// possible fix for that, and it is worth a test because the failure mode is silent: the overlay
// keeps working perfectly while nobody can find it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the overlay is a first-class action', () => {
  const action = DEFAULT_ACTIONS.find((a) => a.id === 'view.perfOverlay');

  it('is registered, so the command palette lists it', () => {
    // The palette renders DEFAULT_ACTIONS. Registration IS discoverability here.
    expect(action, 'view.perfOverlay is not in DEFAULT_ACTIONS').toBeDefined();
  });

  it('keeps the hotkey it already had', () => {
    // People who know Ctrl+Alt+P must not lose it — this adds a second door, it does not move the
    // first one.
    expect(action!.defaultKey).toBe('ctrl+alt+p');
  });

  it('describes what it is FOR, not just what it is', () => {
    // "Performance Overlay" tells a surveyor nothing. The description has to say that it measures,
    // and what it can measure against, or it stays effectively hidden in a list of forty actions.
    expect(action!.description).toMatch(/p50|p95|histogram/i);
    expect(action!.description).toMatch(/200k|fixture/i);
  });
});

describe('both doors open the same overlay', () => {
  it('the dispatcher fires the event', () => {
    expect(read('app/admin/cad/hooks/useHotkeys.ts'))
      .toContain("new CustomEvent('cad:togglePerfOverlay')");
  });

  it('the overlay listens for it', () => {
    expect(read('app/admin/cad/components/PerfOverlay.tsx'))
      .toContain("addEventListener('cad:togglePerfOverlay'");
  });

  it('and still listens for the original hotkey', () => {
    // Adding the palette route must not have replaced the keydown handler.
    const src = read('app/admin/cad/components/PerfOverlay.tsx');
    expect(src).toContain("e.ctrlKey && e.altKey");
  });

  it('removes both listeners on unmount', () => {
    // A leaked window listener in a CAD editor is exactly the class of bug this overlay exists to
    // help find. Adding one while making it discoverable would be a poor trade.
    const src = read('app/admin/cad/components/PerfOverlay.tsx');
    expect(src).toContain("removeEventListener('cad:togglePerfOverlay'");
    expect(src).toContain("removeEventListener('keydown'");
  });
});

describe('the fixtures the overlay can generate', () => {
  it('still reach 200k, which is what makes the measurement decisive', () => {
    const src = read('lib/cad/perf/fixtures.ts');
    expect(src).toContain('large: 200_000');
  });
});
