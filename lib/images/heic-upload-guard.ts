// lib/images/heic-upload-guard.ts
//
// One listener set, installed once for the whole site, that converts HEIC photos to JPEG BEFORE any
// page's own upload code sees them. It covers:
//
//   - every `<input type="file">` — pickers, `capture="environment"` camera buttons on phones;
//   - every drag-and-drop zone;
//   - pasting a HEIC file.
//
// ── WHY A GLOBAL GUARD AND NOT A CALL IN EACH UPLOAD FORM ──────────────────────────────────────
//
// There are ~40 upload spots in this app, written over two years by different hands, and new ones
// arrive most months. Adding a `prepareFilesForUpload()` call to each one works until the first
// spot somebody forgets — which is exactly how the 2026-08-08 "no HEIC" work ended with half the
// routes still taking HEIC. A guard at the window means a new upload form is covered the day it is
// written, without anybody knowing this file exists.
//
// ── HOW IT WORKS ───────────────────────────────────────────────────────────────────────────────
//
// Listeners are on `window` in the CAPTURE phase, so they run before React (whose listeners sit on
// the root element) and before any element-level listener. When an event carries a file that might
// be a HEIC, the guard stops the original event, converts, then:
//
//   - file input: replaces `input.files` with the converted list and re-fires `input`/`change`
//     on the same element — so both the page's onChange AND any code that later reads
//     `inputRef.current.files` see the JPEG;
//   - drop / paste: re-fires the event at the same target with a new DataTransfer holding the
//     converted files.
//
// Events whose files are plainly not photos (PDF, CSV, DOCX, video) are never touched, and neither
// are folder drops (a re-fired drop cannot carry directory entries).
//
// ── PER-SPOT CONTROL (rarely needed) ───────────────────────────────────────────────────────────
//
//   data-heic-policy="image-only" | "any-file"   on the input or any ancestor — what to do when
//                                                conversion fails (see heic.ts). Without it, an
//                                                input's `accept` decides; drops default to any-file.
//   data-heic-convert="off"                      opt a spot out entirely.

import { heicHint, acceptIsImageOnly } from './heic-detect';
import { prepareFilesForUpload, type UploadDestination } from './heic';

const REFIRED = new WeakSet<Event>();

export function destinationFor(el: Element | null, accept?: string | null): UploadDestination {
  const marked = el?.closest?.('[data-heic-policy]')?.getAttribute('data-heic-policy');
  if (marked === 'image-only' || marked === 'any-file') return marked;
  return acceptIsImageOnly(accept) ? 'image-only' : 'any-file';
}

function optedOut(el: Element | null): boolean {
  return !!el?.closest?.('[data-heic-convert="off"]');
}

function mightHoldHeic(files: ArrayLike<File>): boolean {
  return Array.from(files).some((f) => heicHint(f) !== 'no');
}

function canBuildDataTransfer(): boolean {
  try {
    return typeof DataTransfer !== 'undefined' && !!new DataTransfer().items;
  } catch {
    return false;
  }
}

function toDataTransfer(files: File[], strings: Array<[string, string]> = []): DataTransfer {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  for (const [type, value] of strings) {
    try { dt.setData(type, value); } catch { /* read-only type */ }
  }
  return dt;
}

function stringData(dt: DataTransfer): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const type of Array.from(dt.types ?? [])) {
    if (type === 'Files') continue;
    try { out.push([type, dt.getData(type)]); } catch { /* not readable */ }
  }
  return out;
}

function asElement(t: EventTarget | null): Element | null {
  return t && (t as Element).nodeType === 1 ? (t as Element) : null;
}

// ── File inputs ────────────────────────────────────────────────────────────────────────────────

/** Browsers fire `input` then `change` for one selection. Both are held while converting. */
const holding = new WeakMap<HTMLInputElement, Set<string>>();

function onInputOrChange(e: Event): void {
  if (REFIRED.has(e)) return;
  const input = e.target as HTMLInputElement | null;
  if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;

  const held = holding.get(input);
  if (held) {
    held.add(e.type);
    e.stopImmediatePropagation();
    return;
  }

  const files = input.files;
  if (!files || files.length === 0 || optedOut(input) || !mightHoldHeic(files)) return;

  e.stopImmediatePropagation();
  const events = new Set<string>([e.type]);
  holding.set(input, events);
  const original = Array.from(files);

  void (async () => {
    let remaining = original.length;
    let snapshot: FileList | null = null;
    try {
      const prepared = await prepareFilesForUpload(original, { destination: destinationFor(input, input.accept) });
      if (prepared.changed) {
        input.files = toDataTransfer(prepared.files).files;
        // A FileList assigned from a DataTransfer is the SAME object the input holds, so the very
        // common `const fs = e.target.files; e.target.value = ''` empties `fs` in place (verified in
        // Chromium 2026-09-27 — My Files uploaded nothing). While the events below run, handlers read
        // an independent copy instead; afterwards `input.files` is the real list again.
        snapshot = toDataTransfer(prepared.files).files;
        remaining = prepared.files.length;
      }
    } catch {
      /* prepareFilesForUpload does not throw by design; if it ever does, the original goes through */
    } finally {
      holding.delete(input);
    }
    // Everything was refused: behave as if the picker was cancelled. Clearing the value also means
    // choosing the same file again fires `change` again.
    if (remaining === 0) {
      input.value = '';
      return;
    }
    if (snapshot) {
      const copy = snapshot;
      Object.defineProperty(input, 'files', { configurable: true, get: () => copy });
    }
    try {
      for (const type of ['input', 'change']) {
        if (!events.has(type)) continue;
        const ev = new Event(type, { bubbles: true });
        REFIRED.add(ev);
        input.dispatchEvent(ev);
      }
    } finally {
      // Drop the own-property shadow; the prototype getter (the real list) shows through again.
      if (snapshot) delete (input as unknown as { files?: FileList }).files;
    }
  })();
}

// ── Drag and drop ──────────────────────────────────────────────────────────────────────────────

function refireDrop(original: DragEvent, dt: DataTransfer): Event {
  const init: DragEventInit = {
    bubbles: true, cancelable: true, composed: true,
    clientX: original.clientX, clientY: original.clientY,
    screenX: original.screenX, screenY: original.screenY,
    altKey: original.altKey, ctrlKey: original.ctrlKey, shiftKey: original.shiftKey, metaKey: original.metaKey,
    dataTransfer: dt,
  };
  try {
    const ev = new DragEvent('drop', init);
    if (ev.dataTransfer && ev.dataTransfer.files.length === dt.files.length) return ev;
  } catch { /* fall through */ }
  // Browsers whose DragEvent constructor ignores `dataTransfer`: attach it by hand.
  const ev = new Event('drop', { bubbles: true, cancelable: true, composed: true });
  for (const [k, v] of Object.entries({ ...init, dataTransfer: dt })) {
    if (k === 'bubbles' || k === 'cancelable' || k === 'composed') continue;
    Object.defineProperty(ev, k, { value: v });
  }
  return ev;
}

function onDrop(e: DragEvent): void {
  if (REFIRED.has(e)) return;
  const dt = e.dataTransfer;
  if (!dt || !dt.files || dt.files.length === 0) return;
  const target = asElement(e.target);
  if (optedOut(target) || !mightHoldHeic(dt.files)) return;
  const isFolder = Array.from(dt.items ?? []).some((it) => {
    const entry = (it as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.();
    return !!entry?.isDirectory;
  });
  if (isFolder) return;

  const files = Array.from(dt.files);
  const strings = stringData(dt);
  // The original must be cancelled NOW — an uncancelled file drop makes the browser navigate to it.
  e.preventDefault();
  e.stopImmediatePropagation();

  void (async () => {
    const prepared = await prepareFilesForUpload(files, { destination: destinationFor(target) }).catch(() => null);
    const out = prepared ? prepared.files : files;
    if (out.length === 0) return;
    const ev = refireDrop(e, toDataTransfer(out, strings));
    REFIRED.add(ev);
    (target && target.isConnected ? target : document.body).dispatchEvent(ev);
  })();
}

// ── Paste ──────────────────────────────────────────────────────────────────────────────────────
//
// Only intercepted when the clipboard holds a file that DECLARES itself HEIC. Pasting is mostly text,
// and a re-fired paste cannot perform the browser's own default insert, so this stays out of the
// way of every ordinary paste.

function onPaste(e: ClipboardEvent): void {
  if (REFIRED.has(e)) return;
  const cd = e.clipboardData;
  if (!cd || !cd.files || cd.files.length === 0) return;
  const files = Array.from(cd.files);
  if (!files.some((f) => heicHint(f) === 'heic')) return;
  const target = asElement(e.target) ?? (document.activeElement as Element | null);
  if (optedOut(target)) return;
  const strings = stringData(cd);
  e.preventDefault();
  e.stopImmediatePropagation();

  void (async () => {
    const prepared = await prepareFilesForUpload(files, { destination: destinationFor(target) }).catch(() => null);
    const out = prepared ? prepared.files : files;
    if (out.length === 0) return;
    const dt = toDataTransfer(out, strings);
    let ev: Event;
    try {
      ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt });
      if (!(ev as ClipboardEvent).clipboardData) throw new Error('no clipboardData');
    } catch {
      ev = new Event('paste', { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(ev, 'clipboardData', { value: dt });
    }
    REFIRED.add(ev);
    (target && target.isConnected ? target : document.body).dispatchEvent(ev);
  })();
}

// ── Install ────────────────────────────────────────────────────────────────────────────────────

let installs = 0;
let teardown: (() => void) | null = null;

/** Install the guard on `window`. Idempotent and reference-counted (StrictMode mounts twice). */
export function installHeicUploadGuard(win: Window = window): () => void {
  installs += 1;
  if (!teardown) {
    if (!canBuildDataTransfer()) {
      // No way to hand converted files back to the page. The server-side safety net and the
      // viewer's on-the-fly conversion still cover this browser.
      teardown = () => {};
    } else {
      const opts = { capture: true } as const;
      win.addEventListener('input', onInputOrChange, opts);
      win.addEventListener('change', onInputOrChange, opts);
      win.addEventListener('drop', onDrop as EventListener, opts);
      win.addEventListener('paste', onPaste as EventListener, opts);
      teardown = () => {
        win.removeEventListener('input', onInputOrChange, opts);
        win.removeEventListener('change', onInputOrChange, opts);
        win.removeEventListener('drop', onDrop as EventListener, opts);
        win.removeEventListener('paste', onPaste as EventListener, opts);
      };
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installs -= 1;
    if (installs === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
}
