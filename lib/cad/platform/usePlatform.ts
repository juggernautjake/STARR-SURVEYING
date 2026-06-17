'use client';
// lib/cad/platform/usePlatform.ts
//
// cad-desktop-tauri-and-perf Slice T3 — React hook view of the
// platform runtime. SSR-safe (returns the `web` shape on the server +
// during the first paint, then hydrates to the actual platform once
// the component mounts). Components branching on platform render a
// stable web tree first to avoid hydration mismatch.

import { useEffect, useState } from 'react';
import { getPlatform, isTauri, type Platform } from './runtime';

export interface PlatformSnapshot {
  /** Tauri host OS, or `'web'` when the runtime is a browser tab. */
  platform: Platform;
  /** True once the runtime is confirmed Tauri. Distinct from
   *  `platform !== 'web'` because Tauri-on-Linux + browser-on-Linux
   *  both report `'linux'` for the OS sniff — only the `__TAURI_INTERNALS__`
   *  global tells you which shell is hosting. */
  isTauri: boolean;
  /** True after the hook has mounted at least once. Components can
   *  use this to gate desktop-only UI behind a stable first paint. */
  ready: boolean;
}

const INITIAL: PlatformSnapshot = { platform: 'web', isTauri: false, ready: false };

/** Read the current platform from React. Renders `{ platform: 'web',
 *  isTauri: false, ready: false }` on the server + the first client
 *  paint, then re-renders with the live values once the component
 *  mounts. */
export function usePlatform(): PlatformSnapshot {
  const [snap, setSnap] = useState<PlatformSnapshot>(INITIAL);
  useEffect(() => {
    setSnap({ platform: getPlatform(), isTauri: isTauri(), ready: true });
  }, []);
  return snap;
}
