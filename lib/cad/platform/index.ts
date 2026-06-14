// lib/cad/platform/index.ts
//
// cad-desktop-tauri-and-perf Slice T3 — public surface.
//
// Re-exports the platform-detection helpers + the React hook. The
// internal test seam (`__unsafeSetTauriInternalsForTests`) is NOT
// re-exported — tests reach for it via the direct module path
// instead, so production code that imports from this index can't
// accidentally call it.

export { getPlatform, isTauri, isWeb, ping } from './runtime';
export type { Platform } from './runtime';
export { usePlatform } from './usePlatform';
export type { PlatformSnapshot } from './usePlatform';
