// __tests__/hub/widget-frame-truncation.test.tsx
//
// Slice 206 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the title-truncation contract on WidgetFrame so long custom
// titles never push the drag handle out of the header + the body
// can shrink below its content's intrinsic width at mobile widths.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import WidgetFrame from '@/lib/hub/components/WidgetFrame';

describe('WidgetFrame title — ellipsis truncation', () => {
  it('renders with the truncation CSS bundle on the title', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="A very long custom title that should ellipsis">
        <div>body</div>
      </WidgetFrame>,
    );
    // overflow: hidden + white-space: nowrap + text-overflow: ellipsis
    // together = the standard single-line truncation pattern.
    expect(html).toContain('overflow:hidden');
    expect(html).toContain('white-space:nowrap');
    expect(html).toContain('text-overflow:ellipsis');
  });

  it('the title carries a `title` attribute so hovering reveals the full text', () => {
    const fullTitle = 'A long surveyor-typed custom title for the my-jobs widget';
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title={fullTitle}>
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain(`title="${fullTitle}"`);
  });

  it('the title slot is flex:1 and can shrink (min-width:0)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="short">
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain('min-width:0');
    expect(html).toContain('flex:1 1 auto');
  });

  it('headerAction has flex-shrink:0 so the drag handle can never be pushed out', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame
        title="title"
        headerAction={<button data-testid="drag">⋮⋮</button>}
      >
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain('flex-shrink:0');
    expect(html).toContain('data-testid="drag"');
  });
});

describe('WidgetFrame body — min-width:0 lets it shrink at narrow widths', () => {
  it('the body slot carries min-width:0 + overflow:auto', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="t">
        <div>content</div>
      </WidgetFrame>,
    );
    // Both invariants are present so a flex parent at 320px wide
    // doesn't force the body to its intrinsic content width.
    expect(html).toContain('min-width:0');
    expect(html).toContain('overflow:auto');
  });
});

describe('WidgetFrame title — hidden but accessible', () => {
  it('keeps aria-labelledby pointed at the title id when showTitle=false', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="Pinned pages" showTitle={false}>
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain('aria-labelledby="widget-pinned-pages"');
    // No visible header when showTitle is false.
    expect(html).not.toContain('<header');
  });
});
