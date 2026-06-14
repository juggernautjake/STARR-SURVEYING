// lib/cad/persistence/native-file.ts
//
// cad-desktop-tauri-and-perf Slice T4 — native file-open helper.
//
// Wraps Tauri's `plugin:dialog` + `plugin:fs` IPCs in the same shape
// the existing web `<input type="file">` → `file.text()` flow uses,
// so a call site can switch between them via the Slice T3
// `isTauri()` boundary without otherwise restructuring its logic.
//
// Why not import `@tauri-apps/api/dialog`? Same reason as the
// platform runtime: keeping `@tauri-apps/api` out of the import
// graph lets the web bundle skip the Tauri code path entirely. We
// hit the plugin IPCs directly via the runtime-injected
// `__TAURI_INTERNALS__.invoke()`.
//
// Pure module — every dependency comes through dependency injection
// (`runtime.invoke`) so tests don't need a real Tauri shell.

import { isTauri } from '../platform/runtime';

/** A single filter pair the dialog can offer. Mirrors Tauri's shape
 *  exactly (no translation layer) so future plugin upgrades don't
 *  cascade into our types. */
export interface OpenFileFilter {
  /** User-visible label, e.g. "Survey files". */
  name: string;
  /** Lowercase extensions without the leading dot, e.g.
   *  `['starr', 'trv', 'csv']`. */
  extensions: string[];
}

export interface OpenFileResult {
  /** Absolute path of the file the user chose. */
  path: string;
  /** Base name (no directory), used for downstream format sniffing
   *  + UI display. */
  name: string;
  /** Raw text content. We assume UTF-8 / ASCII — the surveying
   *  formats we care about (TRV, STARR, CSV) are all text. */
  contents: string;
}

export interface OpenFileOptions {
  /** Dialog filters, in display order. The Tauri dialog uses the
   *  first one as the default. */
  filters?: ReadonlyArray<OpenFileFilter>;
  /** Optional dialog window title. */
  title?: string;
  /** Initial directory hint. Tauri may ignore on some OSes; the
   *  helper passes it through verbatim. */
  defaultPath?: string;
}

/** Default filter list for the standalone CAD surface — `.starr`
 *  documents, `.trv` field files, and `.csv` exports. */
export const DEFAULT_CAD_FILTERS: ReadonlyArray<OpenFileFilter> = [
  { name: 'Survey files', extensions: ['starr', 'trv', 'csv'] },
  { name: 'STARR document', extensions: ['starr'] },
  { name: 'Traverse PC', extensions: ['trv'] },
  { name: 'Comma-separated values', extensions: ['csv'] },
  { name: 'All files', extensions: ['*'] },
];

/** Shape of the global Tauri injects at runtime. We re-declare here
 *  rather than importing from `runtime.ts` so this module compiles
 *  without circular dependencies. */
interface TauriInvokeWindow {
  __TAURI_INTERNALS__?: {
    invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
}

/** Lift the invoke function from the runtime-injected global. Returns
 *  `null` outside the Tauri shell — callers branch on that. */
function getInvoke():
  | (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as TauriInvokeWindow;
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

/** Internal — split into its own export so tests can drive the
 *  `invoke`-only path without poking the runtime detection. The
 *  helper does NOT branch on `isTauri()`; it assumes the caller
 *  already did. */
export async function openFileViaTauri(
  options: OpenFileOptions,
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
): Promise<OpenFileResult | null> {
  // Tauri's dialog plugin returns a string path (or string[] when
  // multiple is true), or null on cancel. We always single-select.
  const path = await invoke<string | null>('plugin:dialog|open', {
    options: {
      multiple: false,
      directory: false,
      filters: options.filters ?? DEFAULT_CAD_FILTERS,
      title: options.title,
      defaultPath: options.defaultPath,
    },
  });
  if (!path || typeof path !== 'string') return null;
  // Read the file as UTF-8 text. The fs plugin's `read_text_file`
  // command is path-scoped per capability; the default capability
  // we ship in Slice T4 grants read access to the user-picked path
  // only (no broad fs read).
  const contents = await invoke<string>('plugin:fs|read_text_file', { path });
  const name = path.split(/[\\/]/).pop() ?? path;
  return { path, name, contents };
}

/** Public entry point. Branches on `isTauri()`; returns `null` on
 *  the web build with no Tauri runtime (callers fall through to
 *  their existing `<input type="file">` flow). Throws when called
 *  inside Tauri but the IPC plumbing is broken (capability missing,
 *  plugin not registered, etc.) — surfaces as a real error in the
 *  command bar instead of failing silently. */
export async function openCadFileViaPlatform(
  options: OpenFileOptions = {},
): Promise<OpenFileResult | null> {
  if (!isTauri()) return null;
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error(
      'native-file: Tauri runtime detected but __TAURI_INTERNALS__.invoke is missing.',
    );
  }
  return openFileViaTauri(options, invoke);
}
