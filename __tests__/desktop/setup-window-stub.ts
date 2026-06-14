// __tests__/desktop/setup-window-stub.ts
//
// cad-desktop-tauri-and-perf Slice T3 — side-effect window polyfill
// for the platform-runtime tests. Vitest defaults to
// `environment: 'node'` and the repo doesn't pull in happy-dom or
// jsdom. The platform helper only ever reads `window.__TAURI_INTERNALS__`,
// `window.__TAURI__`, and `navigator.userAgent`, so a minimal stub is
// enough. Importing this file before `@/lib/cad/platform/runtime`
// guarantees the stub is in place by the time any function inside the
// runtime is invoked.

if (typeof globalThis.window === 'undefined') {
  (globalThis as { window?: unknown }).window = {} as Window;
}
if (typeof globalThis.navigator === 'undefined') {
  (globalThis as { navigator?: unknown }).navigator = { userAgent: '' } as Navigator;
}

export {}; // ESM marker — file is intentionally side-effect-only.
