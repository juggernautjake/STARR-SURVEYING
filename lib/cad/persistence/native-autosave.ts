// lib/cad/persistence/native-autosave.ts
//
// cad-desktop-tauri-and-perf Slice T6 — filesystem-backed autosave
// for the Tauri shell. Mirrors the IndexedDB autosave's public
// shape (writeAutosave / readAutosave / listAutosaves /
// clearAutosave) so `autosave.ts` can branch on `isTauri()` without
// otherwise restructuring its callers.
//
// On-disk layout:
//   <appDataDir>/autosaves/<docId>.starr
//
// Each file is a JSON `AutosavePayload`. The schema matches the
// IndexedDB rows byte-for-byte so a future "import old web autosave
// into the desktop store" migration is a copy, not a transform.

import { isTauri } from '../platform/runtime';
import type { AutosaveListEntry, AutosavePayload } from './autosave';
import { summarizeDocument } from './autosave';

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const AUTOSAVES_SUBDIR = 'autosaves';
const AUTOSAVE_EXTENSION = '.starr';

interface TauriInvokeWindow {
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

function getInvoke(): Invoke | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as TauriInvokeWindow;
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

/** Forward-slash join. Tauri's fs plugin accepts forward slashes on
 *  every supported platform, so we don't need to round-trip through
 *  `plugin:path|join` for every path. */
function joinPath(...segments: ReadonlyArray<string>): string {
  return segments
    .map((s, i) => (i === 0 ? s.replace(/[\\/]+$/, '') : s.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')))
    .filter((s) => s.length > 0)
    .join('/');
}

/** Pull the base name (no extension) off a path. */
function basenameNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Internal — resolve the absolute path of a single doc's autosave
 *  file. Exported for tests + downstream callers that want to
 *  display the location in a recovery dialog. */
export async function resolveNativeAutosavePath(docId: string, invoke: Invoke): Promise<string> {
  const appData = await invoke<string>('plugin:path|app_data_dir');
  return joinPath(appData, AUTOSAVES_SUBDIR, `${docId}${AUTOSAVE_EXTENSION}`);
}

/** Make sure the `autosaves/` directory exists. `recursive: true`
 *  means the call is idempotent — a no-op when the dir is already
 *  present. */
export async function ensureNativeAutosaveDir(invoke: Invoke): Promise<void> {
  const appData = await invoke<string>('plugin:path|app_data_dir');
  const dir = joinPath(appData, AUTOSAVES_SUBDIR);
  await invoke('plugin:fs|mkdir', { path: dir, options: { recursive: true } });
}

export async function writeNativeAutosave(docId: string, payload: AutosavePayload): Promise<void> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return;
  await ensureNativeAutosaveDir(invoke);
  const path = await resolveNativeAutosavePath(docId, invoke);
  // QA hardening — autosave runs on a 5 s debounce + a 2 min
  // periodic timer; if the process crashes / loses power mid-write
  // the JSON file on disk is torn and the next read returns null
  // (silent autosave loss). A two-step write + rename gives us
  // crash-atomic semantics on every supported OS: the `.tmp` file
  // is the only one ever in a half-written state, and the rename
  // is an atomic syscall that either resolves to the new contents
  // or leaves the prior good snapshot in place.
  const tmp = `${path}.tmp`;
  await invoke('plugin:fs|write_text_file', {
    path: tmp,
    contents: JSON.stringify(payload),
  });
  try {
    await invoke('plugin:fs|rename', { oldPath: tmp, newPath: path });
  } catch {
    // Some Tauri fs plugin builds don't expose `rename`. Fall back
    // to a direct write so the autosave still lands — the crash-
    // atomic guarantee is reduced, but the user's data is not lost.
    await invoke('plugin:fs|write_text_file', {
      path,
      contents: JSON.stringify(payload),
    });
    try {
      await invoke('plugin:fs|remove', { path: tmp });
    } catch {
      // Best-effort tmp cleanup; not fatal.
    }
  }
}

export async function readNativeAutosave(docId: string): Promise<AutosavePayload | null> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return null;
  const path = await resolveNativeAutosavePath(docId, invoke);
  try {
    const raw = await invoke<string>('plugin:fs|read_text_file', { path });
    const parsed = JSON.parse(raw) as AutosavePayload;
    return parsed && typeof parsed.savedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearNativeAutosave(docId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return;
  const path = await resolveNativeAutosavePath(docId, invoke);
  try {
    await invoke('plugin:fs|remove', { path });
  } catch {
    // File didn't exist; nothing to clear.
  }
}

/** List every native autosave on disk. Returns the same
 *  `AutosaveListEntry` shape the IndexedDB lister uses so the
 *  recovery dialog can render either source identically. */
export async function listNativeAutosaves(): Promise<AutosaveListEntry[]> {
  const invoke = getInvoke();
  if (!invoke || !isTauri()) return [];
  let entries: Array<{ name: string }>;
  try {
    const appData = await invoke<string>('plugin:path|app_data_dir');
    const dir = joinPath(appData, AUTOSAVES_SUBDIR);
    entries = await invoke<Array<{ name: string }>>('plugin:fs|read_dir', { path: dir });
  } catch {
    return [];
  }
  const out: AutosaveListEntry[] = [];
  for (const entry of entries) {
    const fileName = entry.name;
    if (!fileName.endsWith(AUTOSAVE_EXTENSION)) continue;
    const docId = basenameNoExt(fileName);
    try {
      const appData = await invoke<string>('plugin:path|app_data_dir');
      const path = joinPath(appData, AUTOSAVES_SUBDIR, fileName);
      const raw = await invoke<string>('plugin:fs|read_text_file', { path });
      const payload = JSON.parse(raw) as AutosavePayload;
      if (!payload || typeof payload.savedAt !== 'string') continue;
      const counts = summarizeDocument(payload.document);
      out.push({
        docId,
        savedAt: payload.savedAt,
        docName: typeof (payload.document as { name?: unknown })?.name === 'string'
          ? ((payload.document as { name: string }).name)
          : null,
        layerCount: counts.layers,
        featureCount: counts.features,
      });
    } catch {
      // Skip unreadable / malformed files; one bad entry shouldn't
      // hide the rest from the recovery UI.
    }
  }
  out.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return out;
}
