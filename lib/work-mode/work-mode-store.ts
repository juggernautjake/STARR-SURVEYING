// lib/work-mode/work-mode-store.ts
//
// Zustand store for the Work Mode session. Survives reloads via
// localStorage. The store doesn't know about the role-specific
// shells (Field Crew, CAD, Research, etc.) — it just tracks which
// role is active + the entry timestamp.
//
// Slice 155 of customizable-hub-and-work-mode-2026-05-28.md.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserRole } from '@/lib/auth';

export interface WorkModeStore {
  /** When `mode` is null the user is on the hub (not in work mode). */
  mode: UserRole | null;
  /** Optional job id the user opened work mode against (Field Crew
   *  selects this on entry; CAD drawers may pick later). */
  jobId: string | null;
  /** ISO timestamp captured when the user entered the current mode.
   *  Used by the top bar's "in work mode for Xh" pill. */
  enteredAt: string | null;

  enterWorkMode: (mode: UserRole, jobId?: string | null) => void;
  exitWorkMode: () => void;
  setJobId: (jobId: string | null) => void;
}

export const useWorkModeStore = create<WorkModeStore>()(
  persist(
    (set) => ({
      mode: null,
      jobId: null,
      enteredAt: null,
      enterWorkMode: (mode, jobId = null) => set({
        mode,
        jobId,
        enteredAt: new Date().toISOString(),
      }),
      exitWorkMode: () => set({ mode: null, jobId: null, enteredAt: null }),
      setJobId: (jobId) => set({ jobId }),
    }),
    {
      name: 'starr-work-mode',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode, jobId: s.jobId, enteredAt: s.enteredAt }),
    },
  ),
);

/** Convenience selector — returns elapsed milliseconds since the user
 *  entered the current mode, or null when not in work mode. */
export function timeInModeMs(enteredAt: string | null, nowMs: number = Date.now()): number | null {
  if (!enteredAt) return null;
  const t = Date.parse(enteredAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, nowMs - t);
}
