// lib/cad/operations/activate-offset-tool.ts
//
// Pure helper that flips the tool-store into the OFFSET tool with a
// preset source feature. Used by:
//   - the right-click "Create offset…" context-menu entry
//     (Slice 2 of cad-offset-tool-2026-05-29.md)
//
// `setTool('OFFSET')` cycles through `defaultToolState` + resets
// `offsetSourceId` to null along the way, so the helper assigns the
// source id AFTER the tool switch. Extracted so the two-step sequence
// has direct unit coverage + future entry points can mirror it.

import { useToolStore } from '@/lib/cad/store';

/** Activate the OFFSET tool with a preset source feature so the
 *  floating OffsetPanel (Slice 1) mounts immediately. Returns true
 *  on success, false when the caller forgot to supply a source. */
export function activateOffsetTool(sourceId: string | null | undefined): boolean {
  if (!sourceId) return false;
  const ts = useToolStore.getState();
  ts.setTool('OFFSET');
  ts.setOffsetSourceId(sourceId);
  return true;
}
