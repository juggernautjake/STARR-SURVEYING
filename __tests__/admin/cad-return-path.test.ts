// __tests__/admin/cad-return-path.test.ts
//
// cad-exit-return-path 2026-05-30 — locks the pure helpers that power
// the CAD exit "return to where you came from" behavior.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Minimal sessionStorage shim so the helpers' typeof-window guard
// passes + the round-trip tests have real storage to read back from.
// Lighter than pulling in jsdom for one test file.
beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };
    (globalThis as unknown as { window: unknown }).window = { sessionStorage };
  }
});
import {
  isCadPath,
  getCadReturnPath,
  setCadReturnPath,
  clearCadReturnPath,
} from '@/lib/admin/cad-return-path';

describe('isCadPath', () => {
  it('true for /admin/cad and its sub-routes', () => {
    expect(isCadPath('/admin/cad')).toBe(true);
    expect(isCadPath('/admin/cad/foo')).toBe(true);
  });
  it('false for anything else', () => {
    expect(isCadPath('/admin/research-cad')).toBe(false);
    expect(isCadPath('/admin/me')).toBe(false);
    expect(isCadPath('/admin')).toBe(false);
    expect(isCadPath('/')).toBe(false);
    expect(isCadPath('')).toBe(false);
    expect(isCadPath(null)).toBe(false);
    expect(isCadPath(undefined)).toBe(false);
  });
});

describe('getCadReturnPath / setCadReturnPath / clearCadReturnPath', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns the fallback when nothing is stored', () => {
    expect(getCadReturnPath()).toBe('/admin/research-cad');
    expect(getCadReturnPath('/admin/me')).toBe('/admin/me');
  });

  it('round-trips a stored path', () => {
    setCadReturnPath('/admin/me');
    expect(getCadReturnPath()).toBe('/admin/me');
  });

  it('falls back when the stored value loops back to /admin/cad', () => {
    setCadReturnPath('/admin/cad');
    expect(getCadReturnPath()).toBe('/admin/research-cad');
  });

  it('falls back when stored to /admin/cad/sub-route', () => {
    setCadReturnPath('/admin/cad/something');
    expect(getCadReturnPath()).toBe('/admin/research-cad');
  });

  it('clear wipes the stored path', () => {
    setCadReturnPath('/admin/me');
    clearCadReturnPath();
    expect(getCadReturnPath()).toBe('/admin/research-cad');
  });

  it('refuses to store non-absolute paths', () => {
    setCadReturnPath('admin/me'); // missing leading slash
    expect(getCadReturnPath()).toBe('/admin/research-cad');
    setCadReturnPath(null);
    expect(getCadReturnPath()).toBe('/admin/research-cad');
    setCadReturnPath('');
    expect(getCadReturnPath()).toBe('/admin/research-cad');
  });

  it('supports query strings + hashes', () => {
    setCadReturnPath('/admin/jobs/J-1042?tab=cad#drawings');
    expect(getCadReturnPath()).toBe('/admin/jobs/J-1042?tab=cad#drawings');
  });
});

describe('useCadReturnPathTracker — continuous non-CAD recording (Slice 10)', () => {
  it('records EVERY non-CAD path (not just the transition) so hard nav into CAD is covered', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'admin', 'cad-return-path.ts'),
      'utf8',
    );
    const hook = src.slice(src.indexOf('export function useCadReturnPathTracker'));
    // Records whenever the current path is non-CAD …
    expect(hook).toMatch(/if \(!isCadPath\(pathname\)\) setCadReturnPath\(pathname\)/);
    // … and no longer gates on a prev-ref transition (the bug).
    expect(hook).not.toMatch(/prev\.current/);
  });
});
