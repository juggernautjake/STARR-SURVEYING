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
  | { docId: string; kind: 'local'; name: string }
  | null;

interface SaveTargetStore {
  target: SaveTarget;
  setCloudTarget: (docId: string, cloudId: string, name: string, description: string | null) => void;
  setLocalTarget: (docId: string, name: string) => void;
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
      setLocalTarget: (docId, name) => set({ target: { docId, kind: 'local', name } }),
      clearTarget: () => set({ target: null }),
      targetFor: (docId) => {
        const t = get().target;
        return t && t.docId === docId ? t : null;
      },
    }),
    { name: 'starr-cad-save-target' },
  ),
);
