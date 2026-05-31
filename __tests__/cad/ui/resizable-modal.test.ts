// __tests__/cad/ui/resizable-modal.test.ts
//
// cad-calculator-suite Slice 3 — ResizableModal shell. Source-text
// locks on the contract:
//
//  - Exports `useResizable` hook + the `ResizableContextValue`
//    type so children can read size + scale.
//  - Renders a corner resize handle wired to pointer events.
//  - Size is clamped into [naturalSize, max].
//  - Closes via backdrop click + Escape key + the close button.
//  - Provides `size` + `scale` through React context.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'ResizableModal.tsx'),
  'utf8',
);

describe('ResizableModal — public API', () => {
  it('exports useResizable hook', () => {
    expect(SRC).toMatch(/export function useResizable\(\): ResizableContextValue/);
  });

  it('useResizable throws when used outside the modal (catches misuse)', () => {
    expect(SRC).toMatch(/throw new Error\('useResizable must be used inside a <ResizableModal>'\)/);
  });

  it('exports ResizableContextValue type with size + scale fields', () => {
    expect(SRC).toMatch(/export interface ResizableContextValue \{[\s\S]*?size: ResizableSize;[\s\S]*?scale: number;/);
  });
});

describe('ResizableModal — resize handle + clamping', () => {
  it('renders a corner handle with data-testid="resizable-modal-handle"', () => {
    expect(SRC).toContain('data-testid="resizable-modal-handle"');
  });

  it('handle is wired to onPointerDown / Move / Up', () => {
    expect(SRC).toMatch(/onPointerDown=\{onHandlePointerDown\}/);
    expect(SRC).toMatch(/onPointerMove=\{onHandlePointerMove\}/);
    expect(SRC).toMatch(/onPointerUp=\{onHandlePointerUp\}/);
  });

  it('captures the pointer on down so a fast drag doesn\'t lose tracking', () => {
    expect(SRC).toMatch(/setPointerCapture\(e\.pointerId\)/);
  });

  it('clamps every size update into [naturalSize, effectiveMax]', () => {
    expect(SRC).toMatch(/clampSize\(\s*\{ width: d\.startW \+ \(e\.clientX - d\.startX\), height: d\.startH \+ \(e\.clientY - d\.startY\) \},\s*naturalSize,\s*effectiveMax,\s*\)/);
  });
});

describe('ResizableModal — close paths', () => {
  it('backdrop click fires onClose', () => {
    expect(SRC).toMatch(/data-testid="resizable-modal-backdrop"[\s\S]*?onClick=\{onClose\}/);
  });

  it('Escape key fires onClose via a document-level keydown listener', () => {
    expect(SRC).toMatch(/document\.addEventListener\('keydown', onKey\)/);
    expect(SRC).toMatch(/if \(e\.key === 'Escape'\) onClose\(\)/);
  });

  it('renders a close button (✕) wired to onClose', () => {
    expect(SRC).toMatch(/data-testid="resizable-modal-close"[\s\S]*?onClick=\{onClose\}/);
  });
});

describe('ResizableModal — context provider', () => {
  it('provides { size, scale } to children via ResizableContext.Provider', () => {
    expect(SRC).toMatch(/<ResizableContext\.Provider value=\{ctxValue\}>/);
    expect(SRC).toMatch(/const ctxValue: ResizableContextValue = useMemo\(\(\) => \(\{ size, scale \}\), \[size, scale\]\);/);
  });

  it('scale = max(1, size.width / naturalSize.width) — grows as the modal expands', () => {
    expect(SRC).toMatch(/const scale = Math\.max\(1, size\.width \/ naturalSize\.width\);/);
  });
});

describe('ResizableModal — viewport-aware default max', () => {
  it('falls back to (window.innerWidth - margin, window.innerHeight - margin) when maxSize omitted', () => {
    expect(SRC).toMatch(/window\.innerWidth - margin/);
    expect(SRC).toMatch(/window\.innerHeight - margin/);
  });
});
