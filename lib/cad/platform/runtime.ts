// lib/cad/platform/runtime.ts
//
// cad-desktop-tauri-and-perf Slice T3 — platform-runtime helper.
//
// Single source of truth for "is this code running inside the Tauri
// desktop shell, and if so on which OS." Every desktop-only code path
// (native file dialogs, autosave on disk, OS menu hooks, signed
// updates) gates on these helpers so the web build doesn't pull in
// Tauri internals and so the desktop build can branch with confidence.
//
// Pure module — no React imports, no Tauri API imports. Detection
// happens through the runtime-injected `window.__TAURI_INTERNALS__`
// global Tauri 2 installs before the front-end mounts. The hook
// helper (`usePlatform`) lives in a sibling file so this module
// stays usable from Web Workers + server-side rendering paths.

/** Canonical platform tags. `'web'` covers every browser context
 *  (Tauri excluded). The Tauri tags mirror Rust's `std::env::consts::OS`
 *  but trimmed to the desktop OSes we actually target. */
export type Platform = 'darwin' | 'win32' | 'linux' | 'web';

/** Tauri 2 injects this object into `window` before the front-end
 *  mounts. We declare it loosely here so the module compiles without
 *  the `@tauri-apps/api` types installed at build time. */
interface TauriInternalsWindow {
  __TAURI_INTERNALS__?: {
    invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
  // Pre-Tauri-2 builds still expose `__TAURI__`. We accept either so
  // a dev environment running mismatched versions doesn't silently
  // fall back to web detection.
  __TAURI__?: unknown;
}

/** True when the runtime is the Tauri desktop shell. SSR-safe (returns
 *  false on the server because `window` is undefined). Hot path —
 *  callers may invoke this on every render, so the body stays
 *  branch-only with no allocation. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as TauriInternalsWindow;
  return Boolean(w.__TAURI_INTERNALS__) || Boolean(w.__TAURI__);
}

/** Inverse of `isTauri()`. Provided so code paths can read intent
 *  ("we're on the web") instead of negating the desktop test. */
export function isWeb(): boolean {
  return !isTauri();
}

/** Lower-cased UA token map. Kept private so we can replace the
 *  detection strategy (e.g. async Tauri OS plugin) without breaking
 *  the call sites. */
function detectOsFromUserAgent(): Platform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  // Order matters — `mac` appears in iPad UA strings but the desktop
  // shell only ever targets macOS proper so the loose match is fine.
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'web';
}

/** Resolve the current platform. `'web'` is returned whenever the
 *  runtime isn't Tauri, so callers branching on `getPlatform()` are
 *  also implicitly branching on "is this the desktop binary." When
 *  running inside Tauri the UA sniff is used because the webview's
 *  UA reliably reflects the host OS — the alternative (a `plugin:os`
 *  IPC roundtrip) is async and would force every caller to await. */
export function getPlatform(): Platform {
  if (!isTauri()) return 'web';
  return detectOsFromUserAgent();
}

/** Typed wrapper around the Slice T2 smoke IPC. Useful for boot-time
 *  smoke checks ("is the Rust side actually responding?") + as the
 *  reference shape for the IPC helpers later slices will add. */
export async function ping(): Promise<string> {
  if (!isTauri()) {
    throw new Error('platform/runtime: ping() called outside the Tauri shell.');
  }
  const w = window as unknown as TauriInternalsWindow;
  const invoke = w.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    throw new Error('platform/runtime: __TAURI_INTERNALS__.invoke is unavailable.');
  }
  const reply = await invoke<string>('ping');
  if (reply !== 'pong:starr-cad') {
    throw new Error(`platform/runtime: unexpected ping reply ${JSON.stringify(reply)}.`);
  }
  return reply;
}

/** Internal test seam — lets unit tests inject + reset the
 *  `window.__TAURI_INTERNALS__` shape without poking globals directly.
 *  NOT exported from the package index so production code can't
 *  accidentally call it. */
export function __unsafeSetTauriInternalsForTests(
  internals: TauriInternalsWindow['__TAURI_INTERNALS__'] | undefined,
): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as TauriInternalsWindow;
  if (internals === undefined) {
    delete w.__TAURI_INTERNALS__;
    delete w.__TAURI__;
  } else {
    w.__TAURI_INTERNALS__ = internals;
  }
}
