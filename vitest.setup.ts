// vitest.setup.ts — test-environment shims for the `node` test environment.
//
// Several client stores use zustand's `persist` middleware with `localStorage`.
// Under the `node` environment there is no `localStorage`, so those stores throw
// `Cannot read properties of undefined (reading 'setItem')` at creation — which
// failed ~90 otherwise-valid store tests (admin nav, work-mode, CAD calculator +
// AI stores). In a real browser this global exists; here we provide a minimal,
// spec-shaped in-memory implementation so the persist layer has somewhere to write.
// (jsdom/happy-dom would also supply this, but pulling a DOM in for pure store
// logic is heavier than a 20-line Storage.)

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), writable: true, configurable: true });
  }
}
