// lib/cad/persistence/native-save.ts
//
// cad-desktop-tauri-and-perf Slice T5 — native file-save helper.
//
// Symmetric to `native-file.ts` (Slice T4): wraps Tauri's
// `plugin:dialog|save` + `plugin:fs|write_text_file` IPCs in the same
// promise-returning shape the existing web "synthesise an anchor +
// click it to download" flow uses, so a caller can switch between
// them via the Slice T3 `isTauri()` boundary without otherwise
// restructuring its logic.
//
// As with T4 we avoid `@tauri-apps/api/dialog` entirely — keeping
// `@tauri-apps/api` out of the import graph lets the web bundle skip
// the Tauri code path. We talk to the plugins directly via the
// runtime-injected `__TAURI_INTERNALS__.invoke`.

import { isTauri } from '../platform/runtime';
import { type OpenFileFilter, DEFAULT_CAD_FILTERS } from './native-file';

export type { OpenFileFilter } from './native-file';

export interface SaveFileOptions {
  /** Dialog filters, in display order. The Tauri dialog uses the
   *  first one as the default. Defaults to `DEFAULT_CAD_FILTERS` so
   *  the picker leads with `.starr / .trv / .csv`. */
  filters?: ReadonlyArray<OpenFileFilter>;
  /** Optional dialog window title (e.g. "Save drawing…"). */
  title?: string;
  /** Initial directory + filename hint. Tauri uses this both for the
   *  starting directory and for pre-filling the filename field, so
   *  callers should pass the desired suggested filename (with
   *  extension) rather than a bare directory. */
  defaultPath?: string;
}

export interface SaveFileResult {
  /** Absolute path the user chose. Callers should store this to
   *  the active-document state so a subsequent "Save" can reuse it
   *  via `saveCadFileToPath` without prompting again. */
  path: string;
  /** Base filename only — convenient for window-title updates. */
  name: string;
}

interface TauriInvokeWindow {
  __TAURI_INTERNALS__?: {
    invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
}

function getInvoke():
  | (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as TauriInvokeWindow;
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

/** Pull the basename off either a POSIX or Windows-style path.
 *  Re-declared here (not imported from `native-drop.ts`) so the
 *  save module stays standalone — the open + save flows shouldn't
 *  cross-couple just for a one-line helper. */
function basenameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Internal — split into its own export so tests can drive the
 *  `invoke`-only path without poking the runtime detection. Does
 *  NOT branch on `isTauri()`; the caller already did. */
export async function saveFileViaTauri(
  options: SaveFileOptions,
  contents: string,
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
): Promise<SaveFileResult | null> {
  // `plugin:dialog|save` returns a string path or null on cancel.
  const path = await invoke<string | null>('plugin:dialog|save', {
    options: {
      filters: options.filters ?? DEFAULT_CAD_FILTERS,
      title: options.title,
      defaultPath: options.defaultPath,
    },
  });
  if (!path || typeof path !== 'string') return null;
  await invoke('plugin:fs|write_text_file', { path, contents });
  return { path, name: basenameOf(path) };
}

/** Public Save-As entry point. Branches on `isTauri()`; returns
 *  `null` on the web build so callers can fall through to their
 *  existing download path. Throws when called inside Tauri but the
 *  IPC plumbing is broken so it surfaces in the command bar. */
export async function saveCadFileViaPlatform(
  options: SaveFileOptions,
  contents: string,
): Promise<SaveFileResult | null> {
  if (!isTauri()) return null;
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error(
      'native-save: Tauri runtime detected but __TAURI_INTERNALS__.invoke is missing.',
    );
  }
  return saveFileViaTauri(options, contents, invoke);
}

/** Companion path-only write for the "plain Save" path — assumes the
 *  caller already knows the absolute path (typically from a prior
 *  Save-As + the active-document state). No dialog prompt; the call
 *  goes straight to `plugin:fs|write_text_file`. Returns the
 *  basename for convenience (so the window title can refresh
 *  without re-parsing the path). */
export async function saveCadFileToPath(
  path: string,
  contents: string,
): Promise<SaveFileResult | null> {
  if (!isTauri()) return null;
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error(
      'native-save: Tauri runtime detected but __TAURI_INTERNALS__.invoke is missing.',
    );
  }
  await invoke('plugin:fs|write_text_file', { path, contents });
  return { path, name: basenameOf(path) };
}
