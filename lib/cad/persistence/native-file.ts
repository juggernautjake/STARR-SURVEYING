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

/** Soft cap (bytes) on file size we'll load via the native dialog.
 *  Above this, the WebView starts to OOM on a 200 MB CSV. The
 *  largest surveys we've seen ship well under this limit; if a
 *  surveyor hits it, the right answer is to import via a streaming
 *  reader rather than the synchronous text load this helper does. */
export const NATIVE_FILE_MAX_BYTES = 200 * 1024 * 1024;

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
  // QA hardening — sniff the file size before reading so a hasty
  // pick of a 1 GB CSV doesn't OOM the WebView with no diagnostics.
  // We surface a real Error the caller's command-bar reporter can
  // render; the dialog flow already swallows null (user cancelled),
  // so a thrown Error is the right channel for "tried to open but
  // couldn't".
  try {
    const stat = await invoke<{ size?: number } | null>('plugin:fs|stat', { path });
    const size = typeof stat?.size === 'number' ? stat.size : -1;
    if (size > NATIVE_FILE_MAX_BYTES) {
      const mb = Math.round(size / (1024 * 1024));
      throw new Error(
        `native-file: "${path.split(/[\\/]/).pop()}" is ${mb} MB; the native opener tops out at ${NATIVE_FILE_MAX_BYTES / (1024 * 1024)} MB. Use a streaming import instead.`,
      );
    }
  } catch (err) {
    // `plugin:fs|stat` may not be exposed by every Tauri build —
    // a missing plugin throws synchronously and we treat it as
    // "couldn't measure, proceed anyway". Real "file too big"
    // errors land via the explicit `throw new Error` above.
    if (err instanceof Error && err.message.startsWith('native-file:')) throw err;
  }
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
