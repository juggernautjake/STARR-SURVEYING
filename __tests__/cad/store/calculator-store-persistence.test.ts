// __tests__/cad/store/calculator-store-persistence.test.ts
//
// cad-calculator-suite Slice 5 — end-to-end persistence specs that
// drive the calculator store against a real (mocked) localStorage.
// Locks the contract from the user ask:
//
//   1. Closing + reopening the modal restores the LAST-USED
//      calculator (the active id survives).
//   2. Each calculator's state blob survives independently
//      (switching restores prior data).
//   3. The persist key is stable so future versions don't
//      silently orphan saved blobs.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Provide a minimal in-memory localStorage shim BEFORE the store
// module evaluates so the persist middleware sees real storage
// at hydration time. Vitest's `node` environment ships without
// localStorage — we don't want to pull in jsdom just for this.
function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  (globalThis as unknown as { localStorage: typeof ls }).localStorage = ls;
  return store;
}

const PERSIST_KEY = 'starr-cad-calc-suite-v1';

beforeEach(() => {
  vi.resetModules();
  installLocalStorage();
});

describe('calculator-store persistence — round-trip via localStorage', () => {
  it('writes activeCalculatorId + states to localStorage under the stable key', async () => {
    const { useCalculatorStore } = await import('@/lib/cad/store/calculator-store');
    useCalculatorStore.getState().setActiveCalculator('curve');
    useCalculatorStore.getState().setActiveState({ radius: 100 });
    // The persist middleware flushes synchronously on each set.
    const raw = localStorage.getItem(PERSIST_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeCalculatorId).toBe('curve');
    expect(parsed.state.states.curve).toEqual({ radius: 100 });
  });

  it('hydrates from localStorage on rehydrate(): restores active id + per-calc state', async () => {
    // Hand-seed the persisted blob, then ask the store to
    // rehydrate. This simulates a fresh app boot with a prior
    // session's saved state.
    const seeded = {
      state: {
        activeCalculatorId: 'curve',
        states: {
          generic: { display: '42', tape: ['12 + 30 = 42'] },
          curve: { radius: 250 },
        },
      },
      version: 1,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(seeded));
    const { useCalculatorStore } = await import('@/lib/cad/store/calculator-store');
    // Zustand's persist middleware exposes a rehydrate() helper
    // that re-reads from storage; without an explicit call we'd
    // only see the pre-seed state from this module-load.
    await useCalculatorStore.persist.rehydrate();
    expect(useCalculatorStore.getState().activeCalculatorId).toBe('curve');
    expect(useCalculatorStore.getState().getCalculatorState('generic')).toEqual({ display: '42', tape: ['12 + 30 = 42'] });
    expect(useCalculatorStore.getState().getCalculatorState('curve')).toEqual({ radius: 250 });
  });

  it('switching calculators preserves each one\'s state across a simulated reload', async () => {
    const { useCalculatorStore: store1 } = await import('@/lib/cad/store/calculator-store');
    // Session 1: write to both calculators.
    store1.getState().setActiveCalculator('generic');
    store1.getState().setActiveState({ display: '7', tape: [] });
    store1.getState().setActiveCalculator('curve');
    store1.getState().setActiveState({ radius: 5 });
    // The active id is now 'curve' (last used).

    // Simulate reload: reset modules so a fresh store instance is
    // created, then re-import. Persist hydrates from the still-
    // populated localStorage.
    vi.resetModules();
    const { useCalculatorStore: store2 } = await import('@/lib/cad/store/calculator-store');
    await store2.persist.rehydrate();

    expect(store2.getState().activeCalculatorId).toBe('curve');
    expect(store2.getState().getCalculatorState('generic')).toEqual({ display: '7', tape: [] });
    expect(store2.getState().getCalculatorState('curve')).toEqual({ radius: 5 });
  });

  it('resetAll wipes the persisted state too (next reload starts clean)', async () => {
    const { useCalculatorStore } = await import('@/lib/cad/store/calculator-store');
    useCalculatorStore.getState().setActiveCalculator('curve');
    useCalculatorStore.getState().setActiveState({ radius: 100 });
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();
    useCalculatorStore.getState().resetAll();
    const raw = localStorage.getItem(PERSIST_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeCalculatorId).toBe('generic');
    expect(parsed.state.states).toEqual({});
  });
});

describe('calculator-store persistence — config locks', () => {
  it('uses the versioned persist key starr-cad-calc-suite-v1', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const SRC = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'cad', 'store', 'calculator-store.ts'),
      'utf8',
    );
    expect(SRC).toMatch(/name: 'starr-cad-calc-suite-v1'/);
    expect(SRC).toMatch(/version: 1,/);
  });

  it('partializes BOTH activeCalculatorId and states (so neither is dropped on reload)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const SRC = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'cad', 'store', 'calculator-store.ts'),
      'utf8',
    );
    expect(SRC).toMatch(/partialize: \(s\) => \(\{\s*activeCalculatorId: s\.activeCalculatorId,\s*states: s\.states,\s*\}\)/);
  });
});
