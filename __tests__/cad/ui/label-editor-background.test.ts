// __tests__/cad/ui/label-editor-background.test.ts
//
// Slice 234 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the source-level wiring of the opt-in label background
// controls in the per-label edit modal: a "Background" section with a
// toggle checkbox, a color picker, and a numeric padding input, all
// committing through drawingStore.updateTextLabel so the canvas picks
// it up via the Slice-233 render branch. Default off — checkbox flips
// backgroundColor between null and '#ffffff' so existing drawings stay
// bare until the surveyor opts in. fs.readFileSync regex assertions on
// CanvasViewport.tsx since the SSR snapshot caching blocks
// interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 234 — Background section in label editor', () => {
  it('renders a section keyed by data-testid="label-editor-background-section"', () => {
    expect(SRC).toMatch(/data-testid="label-editor-background-section"/);
  });

  it('sits inside the labelEditState modal (between the B/I buttons and the Reset controls)', () => {
    expect(SRC).toMatch(/>I<\/button>[\s\S]*?data-testid="label-editor-background-section"[\s\S]*?\{\/\* Reset controls/);
  });
});

describe('Slice 234 — Add background toggle', () => {
  it('renders a checkbox keyed by data-testid="label-editor-background-toggle"', () => {
    expect(SRC).toMatch(/data-testid="label-editor-background-toggle"/);
  });

  it('checked when style.backgroundColor is non-null', () => {
    expect(SRC).toMatch(/checked=\{label\.style\.backgroundColor !== null\}/);
  });

  it('flips backgroundColor between null and the previous color or #ffffff on toggle', () => {
    expect(SRC).toMatch(/const nextBg = e\.target\.checked \? \(label\.style\.backgroundColor \?\? '#ffffff'\) : null;/);
  });

  it('commits through drawingStore.updateTextLabel with the next style', () => {
    expect(SRC).toMatch(/(drawingStore|useDrawingStore\.getState\(\))\.updateTextLabel\(featureId, labelId, \{[\s\S]*?style: \{ \.\.\.label\.style, backgroundColor: nextBg \},[\s\S]*?\}\);/);
  });
});

describe('Slice 234 — Color picker + padding input only show when backgroundColor is set', () => {
  it('wraps the color + padding inputs in a `label.style.backgroundColor !== null` conditional', () => {
    expect(SRC).toMatch(/\{label\.style\.backgroundColor !== null && \(/);
  });

  it('renders the color picker with data-testid="label-editor-background-color"', () => {
    expect(SRC).toMatch(/data-testid="label-editor-background-color"/);
  });

  it('renders the padding input with data-testid="label-editor-background-padding"', () => {
    expect(SRC).toMatch(/data-testid="label-editor-background-padding"/);
  });

  it('the color input is the shared ColorSwatchInput, seeded with the current value or #ffffff', () => {
    // cad-ux-cleanup-pass Slice 4 — site upgraded to the shared
    // <ColorSwatchInput> wrapper that paints its label background from
    // the current value (fixes the "dot in a box" rendering).
    expect(SRC).toMatch(/<ColorSwatchInput[\s\S]*?data-testid="label-editor-background-color"[\s\S]*?value=\{label\.style\.backgroundColor \?\? '#ffffff'\}/);
  });

  it('the padding input is type="number" clamped to [0, 20] integer steps', () => {
    expect(SRC).toMatch(/type="number" min=\{0\} max=\{20\} step=\{1\}[\s\S]*?data-testid="label-editor-background-padding"[\s\S]*?value=\{label\.style\.padding\}/);
  });

  it('clamps padding edits to [0, 20] via Math.max + Math.min', () => {
    expect(SRC).toMatch(/const v = Math\.max\(0, Math\.min\(20, parseInt\(e\.target\.value\) \|\| 0\)\);/);
  });
});

describe('Slice 234 — Color + padding edits commit through drawingStore.updateTextLabel', () => {
  it('color onChange writes { ...label.style, backgroundColor: c } via ColorSwatchInput', () => {
    expect(SRC).toMatch(/(drawingStore|useDrawingStore\.getState\(\))\.updateTextLabel\(featureId, labelId, \{\s*style: \{ \.\.\.label\.style, backgroundColor: c \},\s*\}\)/);
  });

  it('padding onChange writes { ...label.style, padding: v }', () => {
    expect(SRC).toMatch(/(drawingStore|useDrawingStore\.getState\(\))\.updateTextLabel\(featureId, labelId, \{\s*style: \{ \.\.\.label\.style, padding: v \},\s*\}\)/);
  });
});
