// lib/cad/persistence/native-drop.ts
//
// cad-desktop-tauri-and-perf Slice T4c — OS-level drag-and-drop of
// .starr / .trv / .csv files onto the running Tauri shell.
//
// The web build of the app has no equivalent: browsers deliver
// dropped files as `File` objects via the DOM `drop` event, but
// Tauri's webview delivers the OS-level drop as a list of absolute
// file paths through `getCurrentWebview().onDragDropEvent`. This
// module exposes a thin helper that subscribes to that event,
// filters down to the recognised CAD extensions, reads each file
// via `plugin:fs|read_text_file`, and dispatches a callback per
// file. Wiring into MenuBar lives in
// `app/admin/cad/components/MenuBar.tsx`.
//
// Tauri-API surface area kept minimal: the `getCurrentWebview` /
// `onDragDropEvent` calls are lazy-loaded via a dynamic import that
// only runs on the Tauri side (gated by `isTauri()`). The web
// bundle never pulls in those modules.

import { isTauri } from '../platform/runtime';

/** Lower-case extensions (no dot) that the CAD app routes through
 *  the shared `processOpenedCadFile` helper. Matches the
 *  `DEFAULT_CAD_FILTERS` set in `native-file.ts`. */
export const NATIVE_DROP_EXTENSIONS = ['starr', 'trv', 'csv'] as const;

/** Shape the runtime IPC bridge exposes. */
type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** Single payload the MenuBar listener consumes. Identical shape to
 *  the `openCadFileViaPlatform()` result so both surfaces feed
 *  through `processOpenedCadFile` without translation. */
export interface NativeDropFile {
  path: string;
  name: string;
  contents: string;
}

/** Pull the basename off either a POSIX or Windows-style path. */
export function basenameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** True when the basename's extension matches one of the recognised
 *  CAD formats (lower-cased, ignoring leading dots). Files outside
 *  this set are silently skipped — letting the user drop a .png
 *  onto the canvas shouldn't fire an error toast. */
export function isCadFilePath(p: string): boolean {
  const name = basenameOf(p).toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = name.slice(dot + 1);
  return (NATIVE_DROP_EXTENSIONS as readonly string[]).includes(ext);
}

/** Read a list of paths via `plugin:fs|read_text_file`, filter to
 *  recognised CAD extensions, and return the loaded files in input
 *  order. Files that fail to read are skipped (callers can log the
 *  error context — they have the `invoke` they passed in). Pure
 *  module — `invoke` is injected so tests can fake it. */
export async function readPathsAsCadFiles(
  paths: ReadonlyArray<string>,
  invoke: Invoke,
): Promise<NativeDropFile[]> {
  const out: NativeDropFile[] = [];
  for (const path of paths) {
    if (!isCadFilePath(path)) continue;
    try {
      const contents = await invoke<string>('plugin:fs|read_text_file', { path });
      out.push({ path, name: basenameOf(path), contents });
    } catch {
      // Skip on read failure; the caller's diagnostic pipeline can
      // surface it if needed. We don't want one bad file in a
      // multi-drop to kill the whole batch.
    }
  }
  return out;
}

/** Subscribe to Tauri's webview drag-drop events and route the
 *  resulting files through `onFiles`. Returns an `unlisten` function
 *  the caller invokes on component unmount.
 *
 *  Returns `null` (no listener attached) when:
 *   - the runtime isn't Tauri,
 *   - the runtime invoke bridge is missing,
 *   - the lazy import of `@tauri-apps/api/webview` fails (e.g. the
 *     package isn't installed at runtime — happens in tests).
 *
 *  The Tauri API import lives behind a dynamic `import(...)` so the
 *  web bundle never pulls Rust-side dependencies. */
export async function registerNativeDropListener(
  onFiles: (files: NativeDropFile[]) => void | Promise<void>,
): Promise<(() => void) | null> {
  if (!isTauri()) return null;
  if (typeof window === 'undefined') return null;
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: Invoke };
  }).__TAURI_INTERNALS__;
  const invoke = internals?.invoke;
  if (!invoke) return null;

  // Dynamic import keeps the Tauri webview module out of the web
  // bundle. The package isn't installed at typecheck time (it ships
  // through `@tauri-apps/api` which is a desktop-only runtime dep),
  // so we go through a `Function`-built dynamic import that's
  // opaque to TS — same trick the lazy-loader patterns in the rest
  // of the codebase use.
  type WebviewModule = {
    getCurrentWebview?: () => {
      onDragDropEvent: (
        cb: (e: { payload?: { type?: string; paths?: string[] } }) => void,
      ) => Promise<() => void>;
    };
  };
  let webviewMod: WebviewModule | null = null;
  try {
    const dynImport = new Function(
      'p',
      'return import(p)',
    ) as (p: string) => Promise<unknown>;
    webviewMod = (await dynImport('@tauri-apps/api/webview').catch(() => null)) as WebviewModule | null;
  } catch {
    return null;
  }
  if (!webviewMod?.getCurrentWebview) return null;
  const webview = webviewMod.getCurrentWebview();
  const unlisten = await webview.onDragDropEvent(async (event) => {
    // The Tauri 2 payload shape: `{ payload: { type: 'drop' | 'over'
    // | 'enter' | 'leave', paths?: string[], position?: {x, y} } }`.
    // We only care about the `'drop'` action.
    //
    // QA hardening — defensive runtime validation of every payload
    // field. The TS type `paths?: string[]` is a hint, not a
    // guarantee, since the event crosses an IPC boundary. A
    // malformed or future-Tauri payload with `paths === undefined`
    // would crash on `.length`; one with non-string entries would
    // throw inside `plugin:fs|read_text_file`. We filter both up
    // front so a single bad event can't kill the whole listener.
    const payload = event.payload;
    if (!payload || payload.type !== 'drop') return;
    if (!Array.isArray(payload.paths)) return;
    const paths = payload.paths.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    if (paths.length === 0) return;
    try {
      const files = await readPathsAsCadFiles(paths, invoke);
      if (files.length > 0) await onFiles(files);
    } catch {
      // A failure inside the user-supplied `onFiles` shouldn't
      // detach the listener — the next drop should still work.
    }
  });
  return unlisten;
}
