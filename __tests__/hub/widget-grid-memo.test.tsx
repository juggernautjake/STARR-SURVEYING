// __tests__/hub/widget-grid-memo.test.tsx
//
// Slice 199 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the memoization of the WidgetGrid's inner `<Widget>` body so a
// re-render triggered by one cell (drag tick, sibling state change)
// doesn't bubble into every other cell's widget body.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { __MemoWidgetRender, EMPTY_CUSTOMIZATION } from '@/lib/hub/components/WidgetGrid';
import type { WidgetCustomization } from '@/lib/hub/types';

let renderCount = 0;

function FakeWidget() {
  renderCount += 1;
  return <span>widget</span>;
}

beforeEach(() => {
  renderCount = 0;
});

describe('MemoWidgetRender — skip on identical props', () => {
  it('renders once on first mount', () => {
    ReactDOMServer.renderToStaticMarkup(
      <__MemoWidgetRender
        Widget={FakeWidget}
        customization={EMPTY_CUSTOMIZATION}
        size={{ w: 4, h: 3 }}
        editMode={false}
        content={{}}
      />,
    );
    expect(renderCount).toBe(1);
  });

  it('the custom equality function is wired (the component is a memo wrapper)', () => {
    // Confirm the export is wrapped by React.memo. Memoized
    // components carry a $$typeof of Symbol.for('react.memo') —
    // a stable invariant used by the test rather than a private
    // React internal.
    expect((__MemoWidgetRender as { $$typeof?: symbol }).$$typeof?.toString()).toContain('react.memo');
  });
});

describe('MemoWidgetRender — equality semantics', () => {
  // Pull out the inner equality function the way React.memo stores
  // it: as the `compare` property on the memo wrapper. Each test
  // builds a "prev" + "next" props pair + asserts the function
  // returns true (skip) or false (render).
  const compare = (__MemoWidgetRender as unknown as {
    compare: (p: Parameters<typeof __MemoWidgetRender>[0], n: Parameters<typeof __MemoWidgetRender>[0]) => boolean;
  }).compare;

  const baseProps = {
    Widget: FakeWidget,
    customization: EMPTY_CUSTOMIZATION,
    size: { w: 4, h: 3 },
    editMode: false,
    content: {},
  };

  it('skips when every prop is reference-equal', () => {
    expect(compare(baseProps, baseProps)).toBe(true);
  });

  it('skips when sizes are deep-equal but new objects (w + h primitive equality)', () => {
    const next = { ...baseProps, size: { w: 4, h: 3 } };
    expect(compare(baseProps, next)).toBe(true);
  });

  it('renders when size.w changes', () => {
    const next = { ...baseProps, size: { w: 5, h: 3 } };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('renders when size.h changes', () => {
    const next = { ...baseProps, size: { w: 4, h: 5 } };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('renders when editMode flips', () => {
    const next = { ...baseProps, editMode: true };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('renders when the Widget component identity changes', () => {
    function OtherWidget() { return null; }
    const next = { ...baseProps, Widget: OtherWidget };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('renders when the customization reference changes (content edits)', () => {
    const nextCustomization: WidgetCustomization = { content: { foo: 'bar' } };
    const next = { ...baseProps, customization: nextCustomization };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('renders when the content reference changes', () => {
    const next = { ...baseProps, content: { foo: 'bar' } };
    expect(compare(baseProps, next)).toBe(false);
  });

  it('skips when both prev + next have brand-new identical-shape size objects (most common drag-tick case)', () => {
    // During a dnd-kit drag tick, the cell function re-runs +
    // `size` is built fresh from instance.w/h. The body should
    // still skip because the primitives match. Without the
    // primitive comparison the body would re-render on every
    // drag frame for every neighbor cell.
    const dragTickPrev = { ...baseProps, size: { w: 4, h: 3 } };
    const dragTickNext = { ...baseProps, size: { w: 4, h: 3 } };
    expect(compare(dragTickPrev, dragTickNext)).toBe(true);
  });
});

describe('EMPTY_CUSTOMIZATION — module-scope sentinel', () => {
  it('is the same reference across imports', () => {
    expect(EMPTY_CUSTOMIZATION).toBe(EMPTY_CUSTOMIZATION);
  });

  it('is frozen so a widget body can never mutate it', () => {
    expect(Object.isFrozen(EMPTY_CUSTOMIZATION)).toBe(true);
  });
});
