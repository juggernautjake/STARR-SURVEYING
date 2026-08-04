// CAD_AUDIT Slice S15 — the leak audit, as a standing check rather than a one-off sweep.
//
// The owner's ask included "make sure … we don't have memory leaks or any kind of issues like that
// which would slow things down unnecessarily". The perf overlay measures FRAMES; it cannot see a
// resource that is acquired and never released, because that costs nothing per frame and everything
// over an afternoon. This is the different instrument.
//
// ── WHAT IT FOUND ───────────────────────────────────────────────────────────────────────────────
// 117 CAD files scanned. Event listeners balanced everywhere, including the 41 pairs in
// `CanvasViewport.tsx` — and balanced *by event name*, not merely by count, which is the check that
// would catch adding `cad:foo` and removing `cad:bar`. `setInterval` balanced everywhere.
//
// One real leak: `ImageInsertDialog.tsx` called `URL.createObjectURL` and never revoked it. It was
// worse than a leak — see the comment at the call site — and the fix removed the second code path
// rather than adding a `revokeObjectURL` to it.
//
// ── WHY A RATCHET AND NOT A ONE-OFF ─────────────────────────────────────────────────────────────
// A sweep that finds nothing is worth almost nothing the day after it runs. These three balances are
// currently exact across the whole subsystem, which makes "exact" a cheap invariant to hold — and
// the moment it stops being exact, the file that broke it is named.
//
// ── WHAT THIS CANNOT SEE, STATED SO IT IS NOT MISTAKEN FOR COVERAGE ─────────────────────────────
// Counting acquisitions and releases proves neither that they pair up at RUNTIME nor that they are
// on the same object. A listener added in one effect and removed in another still balances here. It
// says nothing about Pixi textures, retained closures, growing stores, or the undo stack. Heap
// growth over a long editing session is a browser measurement and remains open in the doc.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = walk(path.join(process.cwd(), 'app/admin/cad'));

/** Drop `//` comment lines, and nothing else.
 *
 *  Necessary because this check trips on the prose describing its own findings — the comment at the
 *  fixed call site names `createObjectURL` to explain why it is gone, and a raw scan reads that as
 *  the call still being there. That is the third time a source-scanning check in this repo has
 *  failed against the very comment explaining the fix.
 *
 *  Deliberately NO block-comment regex. Two earlier attempts at one broke in opposite directions:
 *  stripping `/* … *​/` first treats the `/*` inside a string like `image/*` as an opener and eats
 *  the rest of the file, while dropping `*`-prefixed lines first orphans a JSDoc opener that then
 *  swallows the function beneath it. Line comments alone are enough here, and cannot misparse. */
const stripLineComments = (src: string) =>
  src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const countOf = (src: string, re: RegExp): Record<string, number> => {
  const out: Record<string, number> = {};
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(src))) out[m[1]] = (out[m[1]] ?? 0) + 1;
  return out;
};
const plain = (src: string, needle: RegExp) => (src.match(new RegExp(needle.source, 'g')) ?? []).length;
const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, '/');

describe('the CAD subsystem releases what it acquires', () => {
  it('scans a meaningful number of files', () => {
    // Guards the guard: a walker that silently returned [] would make every assertion below pass.
    expect(FILES.length).toBeGreaterThan(80);
  });

  it('adds and removes the same event NAMES, not merely the same number of listeners', () => {
    // By name, because `addEventListener('cad:foo')` paired with `removeEventListener('cad:bar')`
    // balances by count while leaking one listener and orphaning another.
    const bad: string[] = [];
    for (const f of FILES) {
      const src = stripLineComments(fs.readFileSync(f, 'utf8'));
      const A = countOf(src, /addEventListener\(\s*'([^']+)'/);
      const R = countOf(src, /removeEventListener\(\s*'([^']+)'/);
      for (const k of new Set([...Object.keys(A), ...Object.keys(R)])) {
        if ((A[k] ?? 0) !== (R[k] ?? 0)) bad.push(`${rel(f)}: '${k}' add ${A[k] ?? 0} / remove ${R[k] ?? 0}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('clears every interval it sets', () => {
    // A stray interval in a canvas app keeps a whole closure — and whatever it captured — alive for
    // the life of the tab, and keeps waking the main thread to do it.
    const bad: string[] = [];
    for (const f of FILES) {
      const src = stripLineComments(fs.readFileSync(f, 'utf8'));
      const set = plain(src, /setInterval\(/);
      const clear = plain(src, /clearInterval\(/);
      if (set > clear) bad.push(`${rel(f)}: setInterval ${set} / clearInterval ${clear}`);
    }
    expect(bad).toEqual([]);
  });

  it('revokes every object URL it creates', () => {
    // The one real finding of this slice. An un-revoked object URL pins the ENTIRE blob — a
    // multi-megabyte image — for the life of the page, in an app people keep open all day.
    const bad: string[] = [];
    for (const f of FILES) {
      const src = stripLineComments(fs.readFileSync(f, 'utf8'));
      const made = plain(src, /createObjectURL\(/);
      const freed = plain(src, /revokeObjectURL\(/);
      if (made > freed) bad.push(`${rel(f)}: createObjectURL ${made} / revokeObjectURL ${freed}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('the pasted-image path specifically', () => {
  const src = stripLineComments(fs.readFileSync(
    path.join(process.cwd(), 'app/admin/cad/components/ImageInsertDialog.tsx'), 'utf8'));

  it('does not build a blob URL for a clipboard image', () => {
    // Two bugs in one line, and the leak was the lesser of them: `handleInsert` posts `preview` to
    // the upload API as `dataUrl`, so a `blob:` URL fails to upload and the fallback stores it IN
    // the drawing — where it dies with the page and the image silently vanishes on reload.
    expect(src).not.toMatch(/createObjectURL\(/);
  });

  it('routes the clipboard button through the same converter as every other path', () => {
    // The file picker, drag-drop and Ctrl+V all convert via readFileAsDataUrl. The fix was to stop
    // having a second path, not to add a revoke to it.
    const fn = src.slice(src.indexOf('async function handlePasteButton'));
    const body = fn.slice(0, fn.indexOf('async function handleInsert'));
    expect(body).toContain('processFile(');
    expect(body).not.toContain('processDataUrl(');
  });
});
