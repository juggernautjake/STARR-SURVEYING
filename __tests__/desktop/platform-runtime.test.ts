// __tests__/desktop/platform-runtime.test.ts
//
// cad-desktop-tauri-and-perf Slice T3 — platform-runtime helper.
// Tauri detection runs against the runtime-injected
// `window.__TAURI_INTERNALS__` global, OS detection runs against the
// webview UA, and the `ping()` helper round-trips through the Slice
// T2 smoke IPC. Tests inject the internals via the test-only seam so
// they don't depend on a real Tauri shell.

// Side-effect import installs a minimal `window` + `navigator` stub
// before the runtime module evaluates. MUST come first.
import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isTauri,
  isWeb,
  getPlatform,
  ping,
  __unsafeSetTauriInternalsForTests,
} from '@/lib/cad/platform/runtime';

const fakeInvoke = vi.fn();

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
  setUA('');
});

describe('isTauri / isWeb — boundary detection', () => {
  it('returns false when no Tauri globals are present (web boot)', () => {
    __unsafeSetTauriInternalsForTests(undefined);
    expect(isTauri()).toBe(false);
    expect(isWeb()).toBe(true);
  });

  it('returns true once Tauri injects __TAURI_INTERNALS__', () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    expect(isTauri()).toBe(true);
    expect(isWeb()).toBe(false);
  });

  it('isWeb is the pure inverse of isTauri (no third state)', () => {
    __unsafeSetTauriInternalsForTests(undefined);
    expect(isWeb()).toBe(!isTauri());
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    expect(isWeb()).toBe(!isTauri());
  });
});

describe('getPlatform — OS resolution', () => {
  it('always returns "web" outside the Tauri shell, regardless of UA', () => {
    __unsafeSetTauriInternalsForTests(undefined);
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)');
    expect(getPlatform()).toBe('web');
  });

  it('inside Tauri, sniffs darwin from a Mac UA', () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15');
    expect(getPlatform()).toBe('darwin');
  });

  it('inside Tauri, sniffs win32 from a Windows UA', () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0');
    expect(getPlatform()).toBe('win32');
  });

  it('inside Tauri, sniffs linux from a Linux UA', () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    setUA('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101');
    expect(getPlatform()).toBe('linux');
  });

  it('inside Tauri, falls back to "web" for an unrecognized UA', () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    setUA('Mozilla/5.0 (PlayStation; PlayStation 5/2.0)');
    expect(getPlatform()).toBe('web');
  });
});

describe('ping — typed IPC wrapper', () => {
  it('throws when called outside the Tauri shell', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    await expect(ping()).rejects.toThrow(/outside the Tauri shell/);
  });

  it('calls __TAURI_INTERNALS__.invoke("ping") and returns the reply', async () => {
    fakeInvoke.mockResolvedValueOnce('pong:starr-cad');
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    await expect(ping()).resolves.toBe('pong:starr-cad');
    expect(fakeInvoke).toHaveBeenCalledWith('ping');
  });

  it("throws when the reply doesn't match the smoke contract", async () => {
    fakeInvoke.mockResolvedValueOnce('unexpected');
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    await expect(ping()).rejects.toThrow(/unexpected ping reply/);
  });

  it('throws when invoke itself is missing (incomplete inject)', async () => {
    // Cast through unknown so the test can simulate a broken Tauri
    // bootstrap that puts __TAURI_INTERNALS__ on window without invoke.
    __unsafeSetTauriInternalsForTests({} as never);
    await expect(ping()).rejects.toThrow(/__TAURI_INTERNALS__\.invoke is unavailable/);
  });
});

describe('SSR safety', () => {
  it('isTauri does NOT throw when window is undefined', () => {
    const realWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(isTauri()).toBe(false);
      expect(getPlatform()).toBe('web');
    } finally {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });
});

describe('public surface (index)', () => {
  it('re-exports the helpers + Platform + usePlatform without leaking the test seam', async () => {
    const mod = await import('@/lib/cad/platform');
    expect(typeof mod.isTauri).toBe('function');
    expect(typeof mod.isWeb).toBe('function');
    expect(typeof mod.getPlatform).toBe('function');
    expect(typeof mod.ping).toBe('function');
    expect(typeof mod.usePlatform).toBe('function');
    expect('__unsafeSetTauriInternalsForTests' in mod).toBe(false);
  });
});
