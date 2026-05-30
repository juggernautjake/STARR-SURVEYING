// __tests__/cad/ui/cert-notes-drag-to-move.test.ts
//
// Slice 227 of cad-cert-notes-context-menu-2026-05-29.md. Locks the
// source-level wiring of the drag-to-move pipeline for the
// certification + survey-notes paper-furniture blocks: widened
// tbDragRef union, removed Slice-226 narrowing, paper-inch origin
// lookup for cert/notes (top-left-anchored y), the sign-flip on the
// pointer-move math, the live render override, and the
// useTemplateStore commit. fs.readFileSync regex assertions on
// CanvasViewport.tsx since the SSR snapshot caching blocks
// interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 227 — tbDragRef widened to include certification + notes', () => {
  it('lists certification + notes alongside the title-block family in the element union', () => {
    expect(SRC).toMatch(/element: 'northArrow' \| 'titleBlock' \| 'scaleBar' \| 'signatureBlock' \| 'officialSealLabel' \| 'certification' \| 'notes';/);
  });
});

describe('Slice 227 — SELECT pointer-down no longer narrows cert/notes out', () => {
  it('removed the Slice-226 `tbHitWide === \'certification\' || \'notes\' ? null : tbHitWide` narrowing', () => {
    expect(SRC).not.toMatch(/tbHitWide === 'certification' \|\| tbHitWide === 'notes' \? null : tbHitWide/);
  });

  it('uses hitTestTBElement directly so cert/notes hits enter the drag pipeline', () => {
    expect(SRC).toMatch(/\/\/ Slice 227 — Cert \+ Notes now flow through the same drag[\s\S]*?const tbHit = hitTestTBElement\(sx, sy\);/);
  });
});

describe('Slice 227 — origin lookup branches', () => {
  it('certification branch reads template-store position (default top-right above title block)', () => {
    expect(SRC).toMatch(/\} else if \(tbHit === 'certification'\) \{[\s\S]*?const tpl = useTemplateStore\.getState\(\)\.activeTemplate;[\s\S]*?const stored = tpl\.certification\?\.position;[\s\S]*?origPosX = Math\.max\(0\.5, pw - 4\);[\s\S]*?origPosY = 0\.5;/);
  });

  it('notes branch reads template-store position (default left margin, below legend)', () => {
    expect(SRC).toMatch(/\} else if \(tbHit === 'notes'\) \{[\s\S]*?const tpl = useTemplateStore\.getState\(\)\.activeTemplate;[\s\S]*?const stored = tpl\.standardNotes\?\.position;[\s\S]*?origPosX = 0\.5;[\s\S]*?origPosY = 4\.5;/);
  });
});

describe('Slice 227 — pointer-move sign flip for the TL-anchored y axis', () => {
  it('detects whether the element uses top-left y (cert / notes) vs bottom-left (TB family)', () => {
    expect(SRC).toMatch(/const isTLanchored = tbDrag\.element === 'certification' \|\| tbDrag\.element === 'notes';/);
  });

  it('switches the sign on dScreenY accordingly', () => {
    expect(SRC).toMatch(/tbDrag\.livePosY = isTLanchored\s*\?\s*tbDrag\.origPosY \+ dScreenY \/ inchToPx\s*:\s*tbDrag\.origPosY - dScreenY \/ inchToPx;/);
  });
});

describe('Slice 227 — render override during live drag', () => {
  it('notes block uses tbDragRef.current.livePosX/Y when the user is dragging it', () => {
    expect(SRC).toMatch(/const notesDrag = tbDragRef\.current\?\.element === 'notes' \? tbDragRef\.current : null;/);
    expect(SRC).toMatch(/const notesPosX = notesDrag \? notesDrag\.livePosX : \(tpl\.standardNotes\?\.position\?\.x \?\? 0\.5\);/);
    expect(SRC).toMatch(/const notesPosY = notesDrag \? notesDrag\.livePosY : \(tpl\.standardNotes\?\.position\?\.y \?\? 4\.5\);/);
  });

  it('cert block uses tbDragRef.current.livePosX/Y when the user is dragging it', () => {
    expect(SRC).toMatch(/const certDrag = tbDragRef\.current\?\.element === 'certification' \? tbDragRef\.current : null;/);
    expect(SRC).toMatch(/const certPosX = certDrag \? certDrag\.livePosX : \(tpl\.certification\?\.position\?\.x \?\? pw - 4\);/);
    expect(SRC).toMatch(/const certPosY = certDrag \? certDrag\.livePosY : \(tpl\.certification\?\.position\?\.y \?\? 0\.5\);/);
  });
});

describe('Slice 227 — pointer-up commit writes the new position to useTemplateStore', () => {
  it('certification commit calls updateActiveTemplate with the new position', () => {
    expect(SRC).toMatch(/if \(element === 'certification'\) \{[\s\S]*?const ts = useTemplateStore\.getState\(\);[\s\S]*?ts\.updateActiveTemplate\(\{[\s\S]*?certification: \{ \.\.\.ts\.activeTemplate\.certification, position: pos \},/);
  });

  it('notes commit calls updateActiveTemplate with the new position', () => {
    expect(SRC).toMatch(/if \(element === 'notes'\) \{[\s\S]*?const ts = useTemplateStore\.getState\(\);[\s\S]*?ts\.updateActiveTemplate\(\{[\s\S]*?standardNotes: \{ \.\.\.ts\.activeTemplate\.standardNotes, position: pos \},/);
  });

  it('cert / notes commits sit inside the existing tbDragRef commit block (no parallel branch)', () => {
    // Locks ordering so a future refactor can't separate them — they
    // share the same `moved` threshold + ref-clear with the other TB
    // elements.
    expect(SRC).toMatch(/if \(element === 'officialSealLabel'\)drawingStore\.updateTitleBlock[\s\S]*?if \(element === 'certification'\) \{[\s\S]*?\}[\s\S]*?if \(element === 'notes'\) \{[\s\S]*?\}\s*\} else if \(element === 'titleBlock' \|\| element === 'signatureBlock'\) \{/);
  });
});
