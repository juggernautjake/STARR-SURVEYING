// __tests__/hub/widget-frame.test.tsx
//
// Coverage for the WidgetFrame chrome: aria correctness, title bar
// show/hide, footer, all 5 colorMode resolutions, edit-mode border
// swap. Plus the resolveColors() pure helper covering custom + status
// branches.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import WidgetFrame, { resolveColors } from '@/lib/hub/components/WidgetFrame';

describe('WidgetFrame chrome', () => {
  it('renders the title bar by default + sets aria-labelledby', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="My Jobs">
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain('aria-labelledby="widget-my-jobs"');
    expect(html).toContain('id="widget-my-jobs"');
    expect(html).toContain('My Jobs');
    expect(html).toContain('<div>body</div>');
  });

  it('always renders the title bar post-Slice-5 (no showTitle toggle)', () => {
    // Slice 5 of employee-hub-overhaul-2026-05-30 removed the
    // showTitle prop: the user-facing rule is "the label header title
    // for the widget should always be visible".
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="Always Visible">
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toContain('aria-labelledby="widget-always-visible"');
    expect(html).toContain('Always Visible');
    expect(html).toContain('<header');
  });

  it('paints the header background from headerColor when provided', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="Tinted" headerColor="rgb(255,0,0)">
        <div>body</div>
      </WidgetFrame>,
    );
    expect(html).toMatch(/<header[^>]*style="[^"]*background:\s*rgb\(255,\s*0,\s*0\)/);
  });

  it('renders a footer when provided', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="X" footer={<span>see all</span>}>
        body
      </WidgetFrame>,
    );
    expect(html).toContain('<footer');
    expect(html).toContain('see all');
  });

  it('renders a header action slot when provided', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="X" headerAction={<button>gear</button>}>
        body
      </WidgetFrame>,
    );
    expect(html).toContain('<button>gear</button>');
  });

  it('slugifies title with non-alphanumeric chars', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="My Pay $$$">x</WidgetFrame>,
    );
    expect(html).toContain('aria-labelledby="widget-my-pay"');
  });

  it('falls back to "untitled" when title is empty or symbols-only', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="!!!">x</WidgetFrame>,
    );
    expect(html).toContain('aria-labelledby="widget-untitled"');
  });
});

describe('resolveColors', () => {
  it('inherit falls back to theme variables', () => {
    const out = resolveColors('inherit');
    expect(out.bg).toBe('var(--theme-bg-surface)');
    expect(out.fg).toBe('var(--theme-fg-primary)');
    expect(out.border).toBe('var(--theme-border)');
  });

  it('accent uses --theme-accent + accent-fg', () => {
    const out = resolveColors('accent');
    expect(out.bg).toBe('var(--theme-accent)');
    expect(out.fg).toBe('var(--theme-accent-fg)');
  });

  it('subtle-accent uses color-mix() against --theme-accent at 8%', () => {
    const out = resolveColors('subtle-accent');
    expect(out.bg).toContain('color-mix');
    expect(out.bg).toContain('var(--theme-accent)');
    expect(out.bg).toContain('8%');
  });

  it('status with statusTint=warning produces a warning-tinted bg + fg', () => {
    const out = resolveColors('status', 'warning');
    expect(out.bg).toContain('var(--theme-warning)');
    expect(out.fg).toBe('var(--theme-warning)');
  });

  it('status without an explicit tint defaults to info', () => {
    const out = resolveColors('status');
    expect(out.fg).toBe('var(--theme-info)');
  });

  it('custom uses customBg + customFg verbatim', () => {
    const out = resolveColors('custom', undefined, '#1A2332', '#F1F5F9');
    expect(out.bg).toBe('#1A2332');
    expect(out.fg).toBe('#F1F5F9');
  });

  it('custom falls back to theme vars when customBg/Fg omitted', () => {
    const out = resolveColors('custom');
    expect(out.bg).toBe('var(--theme-bg-surface)');
    expect(out.fg).toBe('var(--theme-fg-primary)');
  });
});
