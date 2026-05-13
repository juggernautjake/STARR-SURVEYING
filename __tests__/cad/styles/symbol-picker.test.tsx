// __tests__/cad/styles/symbol-picker.test.tsx
//
// Phase 3 §11 — SymbolPicker unit tests. Covers the rendering layer
// + filter logic; full DOM-event testing lives in the integration
// suite once the picker is wired into PropertyPanel + CodeStylePanel.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { SymbolThumbnail } from '@/app/admin/cad/components/SymbolPicker';
import { BUILTIN_SYMBOLS } from '@/lib/cad/styles/symbol-library';
import type { SymbolDefinition } from '@/lib/cad/styles/types';
import * as ReactDOMServer from 'react-dom/server';

describe('SymbolThumbnail SVG renderer', () => {
  it('renders a CIRCLE primitive as an SVG <circle>', () => {
    const symbol: SymbolDefinition = {
      id: 'TEST_CIRCLE',
      name: 'Test Circle',
      category: 'GENERIC',
      paths: [
        { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 },
      ],
      insertionPoint: { x: 0, y: 0 },
      defaultSize: 3,
      minSize: 1,
      maxSize: 5,
      colorMode: 'FIXED',
      fixedColor: '#FF0000',
      defaultRotation: 0,
      rotatable: false,
      isBuiltIn: true,
      isEditable: false,
      assignedCodes: [],
    };
    const html = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} />);
    expect(html).toContain('<circle');
    expect(html).toContain('cx="0"');
    expect(html).toContain('r="3"');
    expect(html).toContain('#FF0000'); // INHERIT → fixedColor
  });

  it('renders a PATH primitive as an SVG <path>', () => {
    const symbol: SymbolDefinition = {
      id: 'TEST_PATH',
      name: 'Test Path',
      category: 'GENERIC',
      paths: [
        { type: 'PATH', d: 'M -2 0 L 2 0 M 0 -2 L 0 2', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      ],
      insertionPoint: { x: 0, y: 0 },
      defaultSize: 3,
      minSize: 1,
      maxSize: 5,
      colorMode: 'FIXED',
      fixedColor: '#000000',
      defaultRotation: 0,
      rotatable: false,
      isBuiltIn: true,
      isEditable: false,
      assignedCodes: [],
    };
    const html = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} />);
    expect(html).toContain('<path');
    expect(html).toContain('M -2 0');
    expect(html).toContain('fill="none"');
  });

  it('renders a TEXT primitive as an SVG <text>', () => {
    const symbol: SymbolDefinition = {
      id: 'TEST_TEXT',
      name: 'Test Text',
      category: 'UTILITY',
      paths: [
        { type: 'TEXT', text: 'FH', tx: 0, ty: 0, fontSize: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
      ],
      insertionPoint: { x: 0, y: 0 },
      defaultSize: 3,
      minSize: 1,
      maxSize: 5,
      colorMode: 'FIXED',
      fixedColor: '#1d4ed8',
      defaultRotation: 0,
      rotatable: false,
      isBuiltIn: true,
      isEditable: false,
      assignedCodes: ['FH'],
    };
    const html = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} />);
    expect(html).toContain('<text');
    expect(html).toContain('FH</text>');
  });

  it('renders every BUILTIN_SYMBOLS entry without crashing', () => {
    // Smoke test — ensures every shipped library entry has a valid
    // path shape the renderer can handle.
    for (const symbol of BUILTIN_SYMBOLS) {
      const html = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} />);
      expect(html).toContain('<svg');
      expect(html.length).toBeGreaterThan(50);
    }
  });

  it('uses the symbol size at default 48 px and accepts override', () => {
    const symbol = BUILTIN_SYMBOLS[0];
    const a = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} />);
    const b = ReactDOMServer.renderToStaticMarkup(<SymbolThumbnail symbol={symbol} size={24} />);
    expect(a).toContain('width="48"');
    expect(b).toContain('width="24"');
  });
});
