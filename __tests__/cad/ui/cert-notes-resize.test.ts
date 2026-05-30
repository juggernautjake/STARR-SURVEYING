// __tests__/cad/ui/cert-notes-resize.test.ts
//
// Slice 228 of cad-cert-notes-context-menu-2026-05-29.md. Locks the
// source-level wiring of the corner-drag resize for the certification
// + survey-notes paper-furniture blocks — separate tbResizeRef,
// hitTestTBResizeCorner helper, SELECT pointer-down priority over the
// move pipeline, pointer-move live width update + clamp,
// pointer-up template-store commit, render override using live
// width, BR-corner visual handle, and the hover cursor flip.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 228 — tbResizeRef (separate from tbDragRef)', () => {
  it('declares tbResizeRef holding element + startSX + start/live width inches', () => {
    expect(SRC).toMatch(/const tbResizeRef = useRef<\{\s*element: 'certification' \| 'notes';\s*startSX: number;\s*startWidthIn: number;\s*liveWidthIn: number;\s*\} \| null>\(null\);/);
  });
});

describe('Slice 228 — hitTestTBResizeCorner helper', () => {
  it('returns cert / notes / null for the BR-corner hit zone', () => {
    expect(SRC).toMatch(/function hitTestTBResizeCorner\(sx: number, sy: number\): 'certification' \| 'notes' \| null \{/);
  });

  it('reads the bottom-right corner from tbBoundsRef for both blocks', () => {
    expect(SRC).toMatch(/const cert = tbBoundsRef\.current\.certification;[\s\S]*?cx = cert\.screenX \+ cert\.w;[\s\S]*?cy = cert\.screenY \+ cert\.h;/);
    expect(SRC).toMatch(/const notes = tbBoundsRef\.current\.notes;[\s\S]*?cx = notes\.screenX \+ notes\.w;[\s\S]*?cy = notes\.screenY \+ notes\.h;/);
  });
});

describe('Slice 228 — SELECT pointer-down: resize wins over move', () => {
  it('runs hitTestTBResizeCorner BEFORE hitTestTBElement inside the SELECT branch', () => {
    expect(SRC).toMatch(/const resizeHit = hitTestTBResizeCorner\(sx, sy\);[\s\S]*?if \(resizeHit\) \{[\s\S]*?return;\s*\}[\s\S]*?const tbHit = hitTestTBElement\(sx, sy\);/);
  });

  it('seeds tbResizeRef with the template-store width (default 3.5") and starts the resize cursor', () => {
    expect(SRC).toMatch(/const startWidthIn = resizeHit === 'certification'\s*\?\s*\(tpl\.certification\?\.width \?\? 3\.5\)\s*:\s*\(tpl\.standardNotes\?\.width \?\? 3\.5\);/);
    expect(SRC).toMatch(/tbResizeRef\.current = \{[\s\S]*?element: resizeHit,[\s\S]*?startSX: sx,[\s\S]*?startWidthIn,[\s\S]*?liveWidthIn: startWidthIn,/);
    expect(SRC).toMatch(/tbResizeRef\.current = \{[\s\S]*?\};\s*setCursorStyle\('nwse-resize'\);/);
  });
});

describe('Slice 228 — pointer-move clamps liveWidthIn to [1, 8] inches', () => {
  it('computes the live width from the screen delta and clamps it', () => {
    expect(SRC).toMatch(/if \(tbResizeRef\.current\) \{[\s\S]*?const r = tbResizeRef\.current;[\s\S]*?const dScreenX = sx - r\.startSX;[\s\S]*?const next = r\.startWidthIn \+ dScreenX \/ inchToPx;[\s\S]*?r\.liveWidthIn = Math\.max\(1\.0, Math\.min\(next, 8\.0\)\);/);
  });

  it('runs the resize branch BEFORE the existing tbDragRef move branch', () => {
    // Locks the priority — resize is its own ref, not a fall-through.
    expect(SRC).toMatch(/if \(tbResizeRef\.current\) \{[\s\S]*?return;\s*\}\s*\n\s*\n\s*\/\/ Title-block overlay element drag update\s*\n\s*if \(tbDragRef\.current\) \{/);
  });
});

describe('Slice 228 — pointer-up commits liveWidthIn through useTemplateStore', () => {
  it('cert commit calls updateActiveTemplate({ certification: { ...active, width } })', () => {
    expect(SRC).toMatch(/if \(element === 'certification'\) \{[\s\S]*?ts\.updateActiveTemplate\(\{[\s\S]*?certification: \{ \.\.\.ts\.activeTemplate\.certification, width: liveWidthIn \},/);
  });

  it('notes commit calls updateActiveTemplate({ standardNotes: { ...active, width } })', () => {
    expect(SRC).toMatch(/\} else \{[\s\S]*?ts\.updateActiveTemplate\(\{[\s\S]*?standardNotes: \{ \.\.\.ts\.activeTemplate\.standardNotes, width: liveWidthIn \},/);
  });

  it('only commits when liveWidthIn differs from startWidthIn by > 0.01"', () => {
    expect(SRC).toMatch(/if \(Math\.abs\(liveWidthIn - startWidthIn\) > 0\.01\) \{/);
  });

  it('clears tbResizeRef on commit and resets cursor', () => {
    expect(SRC).toMatch(/tbResizeRef\.current = null;\s*setCursorStyle\('default'\);/);
  });
});

describe('Slice 228 — render override during resize drag', () => {
  it('notes width uses tbResizeRef.current.liveWidthIn when resizing', () => {
    expect(SRC).toMatch(/const notesResize = tbResizeRef\.current\?\.element === 'notes' \? tbResizeRef\.current : null;[\s\S]*?const notesWidthIn = notesResize \? notesResize\.liveWidthIn : \(tpl\.standardNotes\?\.width \?\? 3\.5\);/);
  });

  it('cert width uses tbResizeRef.current.liveWidthIn when resizing', () => {
    expect(SRC).toMatch(/const certResize = tbResizeRef\.current\?\.element === 'certification' \? tbResizeRef\.current : null;[\s\S]*?const certWidthIn = certResize \? certResize\.liveWidthIn : \(tpl\.certification\?\.width \?\? 3\.5\);/);
  });
});

describe('Slice 228 — BR-corner visual handle + hover cursor', () => {
  it('draws a small dark triangle at the BR corner of the notes block', () => {
    expect(SRC).toMatch(/const handlePx = Math\.max\(6, 0\.06 \* inchToPx\);[\s\S]*?ng\.moveTo\(nx \+ widthPx, ny \+ heightPx\);[\s\S]*?ng\.lineTo\(nx \+ widthPx - handlePx, ny \+ heightPx\);[\s\S]*?ng\.lineTo\(nx \+ widthPx, ny \+ heightPx - handlePx\);[\s\S]*?ng\.closePath\(\);/);
  });

  it('draws a small dark triangle at the BR corner of the cert block', () => {
    expect(SRC).toMatch(/const certHandlePx = Math\.max\(6, 0\.06 \* inchToPx\);[\s\S]*?cg\.moveTo\(clampedX \+ widthPx, cy \+ heightPx\);[\s\S]*?cg\.lineTo\(clampedX \+ widthPx - certHandlePx, cy \+ heightPx\);[\s\S]*?cg\.lineTo\(clampedX \+ widthPx, cy \+ heightPx - certHandlePx\);[\s\S]*?cg\.closePath\(\);/);
  });

  it('flips SELECT-mode hover cursor to nwse-resize over the corner', () => {
    expect(SRC).toMatch(/\} else if \(hitTestTBResizeCorner\(sx, sy\)\) \{[\s\S]*?setCursorStyle\('nwse-resize'\);/);
  });
});
