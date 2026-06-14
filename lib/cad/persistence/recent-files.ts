// lib/cad/persistence/recent-files.ts
//
// cad-desktop-tauri-and-perf Slice T7b — Recent Files store for the
// Tauri shell. Persists at `<appDataDir>/recent.json` and caps the
// list at 10 entries, newest first, with dedup by absolute path.
//
// The native menu's Recent Files dynamic-rebuild path (T7c) will
// read from this same file, and `cad:openRecentFile` lets any
// surface (menu click, future Recent Files dialog) trigger the
// existing CAD open flow with `{ path }`.
//
// Pure helper module — all Tauri-side I/O goes through the
// runtime-injected `__TAURI_INTERNALS__.invoke`, with the
// `isTauri()` guard short-circuiting the web build.

import { isTauri } from '../platform/runtime';

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** One row of the recent-files list. `name` is the basename without
 *  the extension, so menu/dialog renders can drop the noise without
 *  re-parsing each path. */
export interface RecentFile {
  path: string;
  name: string;
  /** ISO 8601. Stored so future surfacing can sort within a tie. */
  savedAt: string;
}

/** Cap. Mirrors the typical macOS Recent Files menu cap. */
export const RECENT_FILES_LIMIT = 10;
const RECENT_FILE_NAME = 'recent.json';

interface TauriInvokeWindow {
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

function getInvoke(): Invoke | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as TauriInvokeWindow;
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

function joinPath(...segments: ReadonlyArray<string>): string {
  return segments
    .map((s, i) => (i === 0 ? s.replace(/[\\/]+$/, '') : s.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')))
    .filter((s) => s.length > 0)
    .join('/');
}

export async function resolveRecentFilesPath(invoke: Invoke): Promise<string> {
  const appData = await invoke<string>('plugin:path|app_data_dir');
  return joinPath(appData, RECENT_FILE_NAME);
}

/** Read and parse `recent.json`. Returns `[]` on the web build, on
 *  any read failure (missing file → first-run, parse error → corrupt
 *  on-disk state), or when the parsed payload isn't an array of
 *  `RecentFile`-shaped objects. The lister is deliberately tolerant
 *  so a corrupted file never blocks the menu render — the rebuild
 *  just shows an empty list until the next add restores it. */
export async function getRecentFiles(): Promise<RecentFile[]> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return [];
  try {
    const path = await resolveRecentFilesPath(invoke);
    const raw = await invoke<string>('plugin:fs|read_text_file', { path });
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecentFile).slice(0, RECENT_FILES_LIMIT);
  } catch {
    return [];
  }
}

/** Prepend `entry` to the list with dedup-by-path and a max length
 *  of `RECENT_FILES_LIMIT`. Pure — no I/O. Exported so the call
 *  site that already has the list in memory can compute the next
 *  state without round-tripping through disk. */
export function applyRecentFileAdd(
  current: ReadonlyArray<RecentFile>,
  entry: RecentFile,
): RecentFile[] {
  const dedup = current.filter((e) => e.path !== entry.path);
  const next = [entry, ...dedup];
  return next.slice(0, RECENT_FILES_LIMIT);
}

/** Add (or move-to-top) a file in the Recent Files list. The
 *  filesystem write is idempotent: if the entry is already at the
 *  top with the same path, we still overwrite recent.json so the
 *  savedAt timestamp refreshes (harmless on the web build because
 *  the function short-circuits). */
export async function addRecentFile(path: string, name: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return;
  const current = await getRecentFiles();
  const entry: RecentFile = {
    path,
    name,
    savedAt: new Date().toISOString(),
  };
  const next = applyRecentFileAdd(current, entry);
  await writeRecentFiles(invoke, next);
}

/** Empty the Recent Files list. Surfaces a small "Clear Recent
 *  Files" affordance future T7c work can expose on the menu. */
export async function clearRecentFiles(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return;
  await writeRecentFiles(invoke, []);
}

async function writeRecentFiles(invoke: Invoke, files: ReadonlyArray<RecentFile>): Promise<void> {
  const appData = await invoke<string>('plugin:path|app_data_dir');
  // Ensure the appData directory exists — first-run installs may
  // not have it on disk yet. recent.json sits at the appData root
  // (NOT under autosaves/) so reads stay snappy.
  await invoke('plugin:fs|mkdir', { path: appData, options: { recursive: true } });
  const path = joinPath(appData, RECENT_FILE_NAME);
  await invoke('plugin:fs|write_text_file', {
    path,
    contents: JSON.stringify(files),
  });
}

function isValidRecentFile(raw: unknown): raw is RecentFile {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.path === 'string' &&
    typeof r.name === 'string' &&
    typeof r.savedAt === 'string'
  );
}
