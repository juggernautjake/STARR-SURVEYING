// __tests__/cad/styles/linetype-picker.test.tsx
//
// Phase 3 §11 — LineTypePreview SVG renderer tests for the
// LineTypePicker component.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { LineTypePreview } from '@/app/admin/cad/components/LineTypePicker';
import { BUILTIN_LINE_TYPES, getLineTypeById } from '@/lib/cad/styles/linetype-library';

describe('LineTypePreview SVG renderer', () => {
  it('renders SOLID as a continuous stroke (no dasharray)', () => {
    const lt = getLineTypeById('SOLID')!;
    const html = ReactDOMServer.renderToStaticMarkup(<LineTypePreview lineType={lt} />);
    expect(html).toContain('<line');
    expect(html).not.toContain('stroke-dasharray');
  });

  it('renders DASHED with stroke-dasharray "6 3"', () => {
    const lt = getLineTypeById('DASHED')!;
    const html = ReactDOMServer.renderToStaticMarkup(<LineTypePreview lineType={lt} />);
    expect(html).toContain('stroke-dasharray="6 3"');
  });

  it('renders DOTTED with stroke-dasharray "1 2"', () => {
    const lt = getLineTypeById('DOTTED')!;
    const html = ReactDOMServer.renderToStaticMarkup(<LineTypePreview lineType={lt} />);
    expect(html).toContain('stroke-dasharray="1 2"');
  });

  it('renders DASH_DOT with the full pattern', () => {
    const lt = getLineTypeById('DASH_DOT')!;
    const html = ReactDOMServer.renderToStaticMarkup(<LineTypePreview lineType={lt} />);
    expect(html).toContain('stroke-dasharray="8 2 1.5 2"');
  });

  it('renders every BUILTIN_LINE_TYPES entry without crashing', () => {
    for (const lt of BUILTIN_LINE_TYPES) {
      const html = ReactDOMServer.renderToStaticMarkup(<LineTypePreview lineType={lt} />);
      expect(html).toContain('<svg');
      expect(html).toContain('<line');
    }
  });

  it('honours width / height / color overrides', () => {
    const lt = getLineTypeById('SOLID')!;
    const html = ReactDOMServer.renderToStaticMarkup(
      <LineTypePreview lineType={lt} width={200} height={24} color="#ff0000" />,
    );
    expect(html).toContain('width="200"');
    expect(html).toContain('height="24"');
    expect(html).toContain('stroke="#ff0000"');
  });
});
