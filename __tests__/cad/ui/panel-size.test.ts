// __tests__/cad/ui/panel-size.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampPanelSize,
  readPanelSize,
  writePanelSize,
} from '@/lib/cad/ui/panel-size';

// Minimal localStorage shim so the persistence helpers run under the
// node test environment (the project does not ship jsdom).
function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage };
  return store;
}

describe('clampPanelSize', () => {
  it('clamps within [min,max] and rounds', () => {
    expect(clampPanelSize(300, 160, 480)).toBe(300);
    expect(clampPanelSize(100, 160, 480)).toBe(160);
    expect(clampPanelSize(900, 160, 480)).toBe(480);
    expect(clampPanelSize(200.7, 160, 480)).toBe(201);
  });
  it('falls back to min on NaN', () => {
    expect(clampPanelSize(NaN, 160, 480)).toBe(160);
  });
});

describe('panel-size persistence', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorage();
  });

  it('round-trips through localStorage, clamped', () => {
    writePanelSize('layer', 250);
    expect(readPanelSize('layer', 192, 160, 480)).toBe(250);
    expect(store.get('starr-cad-panel:layer')).toBe('250');
  });

  it('returns clamped fallback when nothing stored', () => {
    expect(readPanelSize('missing', 192, 160, 480)).toBe(192);
    expect(readPanelSize('missing', 50, 160, 480)).toBe(160);
  });

  it('clamps a stored value that is now out of range', () => {
    writePanelSize('layer', 9999);
    expect(readPanelSize('layer', 192, 160, 480)).toBe(480);
  });

  it('ignores a corrupt stored value', () => {
    store.set('starr-cad-panel:layer', 'not-a-number');
    expect(readPanelSize('layer', 192, 160, 480)).toBe(192);
  });
});
