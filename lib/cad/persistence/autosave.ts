// lib/cad/persistence/autosave.ts
//
// Phase 7 §16 — IndexedDB-backed autosave keyed per
// document. Replaces the single-slot `'current'` key the
// in-CADLayout autosave used to share across every drawing
// (which dropped older autosaves whenever the surveyor
// switched files). Each document now owns its own slot
// `autosave:<docId>` so opening drawing B then drawing A
// no longer destroys A's autosave.
//
// The legacy slot is migrated transparently the first time
// `readAutosave` runs after the upgrade: if a `'current'`
// row exists, we re-key it under the embedded document id
// and delete the old one.
//
// Public API:
//   * `writeAutosave(docId, payload)` — writes the slot.
//   * `readAutosave(docId)` — returns the slot or null.
//   * `listAutosaves()` — every slot with its key + metadata
//     so a "recent crash recoveries" UI can browse them.
//   * `clearAutosave(docId)` — removes the slot after a
//     successful manual save.
//
// All async / Promise-based; the caller is expected to be
// browser-side.
//
// cad-desktop-tauri-and-perf Slice T6 — on the Tauri shell, each
// public function dynamic-imports the native filesystem
// implementation and forwards to it. The web bundle never pulls in
// `native-autosave.ts` (or the Tauri IPC code paths it uses)
// because the dynamic import lives behind an `isTauri()` guard the
// tree-shaker can prove false-only for the static-web build.

import { isTauri } from '../platform/runtime';

export interface AutosavePayload {
  version:     string;
  application: string;
  savedAt:     string;
  document:    unknown;
}

export interface AutosaveListEntry {
  docId:        string;
  savedAt:      string;
  docName:      string | null;
  layerCount:   number;
  featureCount: number;
}

const DB_NAME = 'starr-cad';
const DB_VERSION = 1;
const STORE = 'autosave';
const LEGACY_KEY = 'current';
const KEY_PREFIX = 'autosave:';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyFor(docId: string): string {
  return `${KEY_PREFIX}${docId}`;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export async function writeAutosave(
  docId: string,
  payload: AutosavePayload
): Promise<void> {
  // cad-desktop-tauri-and-perf Slice T6 — Tauri shell uses the
  // filesystem; the IndexedDB path is the web fallback.
  if (isTauri()) {
    const { writeNativeAutosave } = await import('./native-autosave');
    return writeNativeAutosave(docId, payload);
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(payload, keyFor(docId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readAutosave(
  docId: string
): Promise<AutosavePayload | null> {
  if (isTauri()) {
    const { readNativeAutosave } = await import('./native-autosave');
    return readNativeAutosave(docId);
  }
  const db = await openDB();
  // Read the keyed slot first.
  const keyed = await new Promise<AutosavePayload | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(keyFor(docId));
    req.onsuccess = () => resolve(asPayload(req.result));
    req.onerror = () => resolve(null);
  });

  // ── Legacy migration ─────────────────────────────────────
  // If the old single-slot key still has a row AND it carries
  // this document, promote it to the new keyed slot and
  // delete the legacy entry. Migration runs once per doc the
  // first time we read after the upgrade.
  const legacy = await new Promise<AutosavePayload | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(LEGACY_KEY);
    req.onsuccess = () => resolve(asPayload(req.result));
    req.onerror = () => resolve(null);
  });
  if (legacy && extractDocId(legacy) === docId) {
    await migrateLegacy(db, docId, legacy);
  }

  db.close();
  // Pick whichever timestamp is newer between the migrated
  // legacy row and the keyed row.
  if (!keyed) return legacy ?? null;
  if (!legacy) return keyed;
  return Date.parse(keyed.savedAt) >= Date.parse(legacy.savedAt)
    ? keyed
    : legacy;
}

export async function listAutosaves(): Promise<AutosaveListEntry[]> {
  // cad-desktop-tauri-and-perf Slice T6 — Tauri shell lists from the
  // filesystem AND any leftover IndexedDB entries (so a user who
  // ran the web build first doesn't lose their prior autosaves on
  // the first desktop launch). Native entries take precedence when
  // both stores hold the same docId — the filesystem write is
  // authoritative on the desktop.
  if (isTauri()) {
    const { listNativeAutosaves } = await import('./native-autosave');
    const [native, web] = await Promise.all([
      listNativeAutosaves(),
      listWebAutosaves(),
    ]);
    const seenDocIds = new Set(native.map((e) => e.docId));
    const merged = [...native, ...web.filter((e) => !seenDocIds.has(e.docId))];
    merged.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    return merged;
  }
  return listWebAutosaves();
}

/** Web-only listing — split out so the Slice T6 cross-store merge
 *  in `listAutosaves` can reuse it without recursing into the
 *  isTauri branch. */
async function listWebAutosaves(): Promise<AutosaveListEntry[]> {
  const db = await openDB();
  const out: AutosaveListEntry[] = [];
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>)
        .result;
      if (!cursor) {
        resolve();
        return;
      }
      const key = cursor.key as IDBValidKey;
      const value = asPayload(cursor.value);
      if (
        typeof key === 'string' &&
        key.startsWith(KEY_PREFIX) &&
        value
      ) {
        const counts = extractCounts(value);
        out.push({
          docId: key.slice(KEY_PREFIX.length),
          savedAt: value.savedAt,
          docName: extractDocName(value),
          layerCount: counts.layers,
          featureCount: counts.features,
        });
      }
      cursor.continue();
    };
    cursorReq.onerror = () => resolve();
  });
  db.close();
  // Newest first.
  out.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return out;
}

export async function clearAutosave(docId: string): Promise<void> {
  if (isTauri()) {
    const { clearNativeAutosave } = await import('./native-autosave');
    return clearNativeAutosave(docId);
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(keyFor(docId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function migrateLegacy(
  db: IDBDatabase,
  docId: string,
  payload: AutosavePayload
): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(payload, keyFor(docId));
    tx.objectStore(STORE).delete(LEGACY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function asPayload(raw: unknown): AutosavePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.savedAt !== 'string') return null;
  return r as unknown as AutosavePayload;
}

function extractDocId(payload: AutosavePayload): string | null {
  const doc = payload.document as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') return null;
  const id = doc.id;
  return typeof id === 'string' ? id : null;
}

function extractDocName(payload: AutosavePayload): string | null {
  const doc = payload.document as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') return null;
  const name = doc.name;
  return typeof name === 'string' ? name : null;
}

function extractCounts(payload: AutosavePayload): {
  layers: number;
  features: number;
} {
  return summarizeDocument(payload.document);
}

/** Cheap layer/feature tally for a stored DrawingDocument, used to tell the
 *  surveyor what a recovery snapshot actually contains before they restore
 *  or discard it. Tolerant of partial/legacy shapes. */
export function summarizeDocument(doc: unknown): {
  layers: number;
  features: number;
} {
  const d = doc as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return { layers: 0, features: 0 };
  const layers = d.layers;
  const features = d.features;
  return {
    layers: layers && typeof layers === 'object' ? Object.keys(layers).length : 0,
    features: features && typeof features === 'object' ? Object.keys(features).length : 0,
  };
}
