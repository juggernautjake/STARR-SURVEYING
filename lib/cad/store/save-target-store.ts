// lib/cad/store/save-target-store.ts
//
// Remembers WHERE the current drawing was last saved so the surveyor can
// hit Save (Ctrl+S) and have it write back to the same place — the same
// cloud record or the same local file name — without re-choosing a
// destination. The target is tied to the document id so it never saves
// the wrong drawing into another's slot; opening/creating a different
// document clears it.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SaveTarget =
  | { docId: string; kind: 'cloud'; cloudId: string; name: string; description: string | null }
  // cad-desktop-tauri-and-perf Slice T5b — `path` is the absolute
  // filesystem path the surveyor picked in the Tauri Save-As
  // dialog, so a follow-up "Save" can write straight back via
  // `saveCadFileToPath` instead of re-prompting. Web saves leave
  // `path` undefined; the URL-blob + anchor-click download has no
  // persistent destination to remember.
  | { docId: string; kind: 'local'; name: string; path?: string | null }
  | null;

interface SaveTargetStore {
  target: SaveTarget;
  setCloudTarget: (docId: string, cloudId: string, name: string, description: string | null) => void;
  /** cad-desktop-tauri-and-perf Slice T5b — `path` is optional so the
   *  pre-T5b call sites stay compatible. Desktop saves pass it; web
   *  saves keep calling with two args and the field is undefined. */
  setLocalTarget: (docId: string, name: string, path?: string | null) => void;
  clearTarget: () => void;
  /** The target for `docId`, or null if none is stored for this doc. */
  targetFor: (docId: string) => SaveTarget;
}

export const useSaveTargetStore = create<SaveTargetStore>()(
  persist(
    (set, get) => ({
      target: null,
      setCloudTarget: (docId, cloudId, name, description) =>
        set({ target: { docId, kind: 'cloud', cloudId, name, description } }),
      setLocalTarget: (docId, name, path) =>
        set({ target: { docId, kind: 'local', name, path: path ?? null } }),
      clearTarget: () => set({ target: null }),
      targetFor: (docId) => {
        const t = get().target;
        return t && t.docId === docId ? t : null;
      },
    }),
    { name: 'starr-cad-save-target' },
  ),
);
