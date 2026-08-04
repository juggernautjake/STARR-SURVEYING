// lib/cad/persistence/emergency-save.ts — CAD_AUDIT Slice S12.
//
// The last-chance write, for the paths where the editor is dying rather than exiting.
//
// ── WHAT WAS ALREADY COVERED, AND WHY THIS IS STILL NEEDED ──────────────────────────────────────
// The routine recovery snapshot is in good shape and this does not replace it: writes are debounced
// 1.5 s after activity settles, forced by a 15 s max-wait ceiling so a non-stop drag spree cannot
// outrun them, and flushed on `visibilitychange → hidden` and `pagehide`, which together cover tab
// close, navigation, reload and OS shutdown.
//
// What none of those cover is the editor breaking **while the page stays open**:
//
//   1. an uncaught React render error — `CADErrorBoundary` replaces the whole tree with its recovery
//      screen. Its own copy told the user *"Your most recent auto-save (if any) will be offered for
//      recovery when you reload"*, and nothing wrote one at that moment. The crash is very often
//      caused by the edit just made, which is exactly the edit still sitting inside the debounce
//      window;
//   2. an unhandled promise rejection or a global `error` — these never reach a React error
//      boundary at all, so the app can be left in a broken state with no save and no recovery UI;
//   3. WebGL context loss — the canvas goes blank and the app looks crashed. Restoration is
//      attempted, but if it fails the drawing is stranded in memory.
//
// ── TWO DELIBERATE DIFFERENCES FROM THE ROUTINE AUTOSAVE ────────────────────────────────────────
// **It ignores `autoSaveEnabled`.** That setting governs routine background writes — a surveyor who
// turns it off is asking us not to write every few seconds while they work. Reading it as "lose this
// person's drawing when the program crashes" is not what it means, and the recovery snapshot only
// ever *offers* itself on reload; it never overwrites a file.
//
// **It never throws.** Every caller is already on a failure path — an error boundary, a rejection
// handler, a dead GL context. A throw from here would replace a recoverable crash with an
// unrecoverable one, so failures are swallowed after logging and reported via the return value.

import { useDrawingStore } from '../store';
import { writeAutosave } from './autosave';
import { cadLog } from '../logger';

/** Where the emergency save was triggered from. Recorded in the log so a crash report says which
 *  path fired, and used to keep the log honest about what is being claimed. */
export type EmergencySaveReason =
  | 'react-error-boundary'
  | 'unhandled-rejection'
  | 'uncaught-error'
  | 'webgl-context-lost';

export interface EmergencySaveResult {
  /** True only when a snapshot actually reached storage. */
  saved: boolean;
  /** Why not, when `saved` is false. `not-dirty` is a success in disguise: there was nothing to
   *  lose. `no-document` and `write-failed` are real failures. */
  skipped?: 'not-dirty' | 'no-document' | 'write-failed';
}

/** Build the document persisted as a recovery snapshot: drop the redundant base64 `dataUrl` for any
 *  image that also has a bucket `url`, since the bitmap reloads from `url` on restore. Mirrors
 *  `toRecoverySnapshot` in CADLayout — kept behaviourally identical so the two writers cannot
 *  produce snapshots the recovery dialog reads differently. Legacy images with no `url` keep their
 *  `dataUrl`, so recovery is never lossy. */
function toRecoverySnapshot<T extends { projectImages?: Record<string, { url?: string; dataUrl?: string }> }>(doc: T): T {
  const images = doc.projectImages;
  if (!images) return doc;
  let stripped = false;
  const slim: Record<string, { url?: string; dataUrl?: string }> = {};
  for (const [id, img] of Object.entries(images)) {
    if (img.dataUrl && img.url) {
      const rest = { ...img };
      delete rest.dataUrl;
      slim[id] = rest;
      stripped = true;
    } else {
      slim[id] = img;
    }
  }
  return stripped ? { ...doc, projectImages: slim } : doc;
}

/**
 * Write a crash-recovery snapshot of the live drawing, right now.
 *
 * Reads the store through `getState()` rather than a React hook so it is callable from a class
 * error boundary, a bare `window` listener, or a canvas event handler — none of which have access
 * to the CADLayout closure that owns the routine autosave.
 */
export async function emergencySave(reason: EmergencySaveReason): Promise<EmergencySaveResult> {
  try {
    const st = useDrawingStore.getState();
    const doc = st.document;
    if (!doc?.id) {
      cadLog.warn('EmergencySave', `No document to save (${reason})`);
      return { saved: false, skipped: 'no-document' };
    }
    // Nothing unsaved means nothing to lose, and writing anyway would replace a good snapshot with
    // an identical one while the app is already in trouble.
    if (!st.isDirty) {
      cadLog.info('EmergencySave', `Nothing unsaved (${reason})`);
      return { saved: false, skipped: 'not-dirty' };
    }
    await writeAutosave(doc.id, {
      version: '1.0',
      application: 'starr-cad',
      savedAt: new Date().toISOString(),
      document: toRecoverySnapshot(doc),
    });
    cadLog.error('EmergencySave', `Recovery snapshot written after ${reason}: ${doc.name}`);
    return { saved: true };
  } catch (err) {
    // Logged, never rethrown — see the header. The caller is already handling a crash.
    cadLog.error('EmergencySave', `Recovery snapshot FAILED after ${reason}`, err);
    return { saved: false, skipped: 'write-failed' };
  }
}
