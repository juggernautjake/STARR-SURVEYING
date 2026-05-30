// __tests__/hub/widget-frame.test.tsx
//
// Coverage for the WidgetFrame chrome: aria correctness, always-on
// title bar, the Slice-5 headerColor opt-in, footer, header-action,
// title slugification. Slice 6 of employee-hub-overhaul-2026-05-30
// removed the colorMode/statusTint/customBg/customFg/borderRadius/
// shadowDepth props + the resolveColors() helper, so those specs are
// gone too.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import WidgetFrame from '@/lib/hub/components/WidgetFrame';

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

describe('hub-widget-excellence-02 Slice 5 — goTo footer link', () => {
  it('renders a WidgetGoToLink in the footer when goTo is set', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="My Jobs" goTo={{ href: '/admin/jobs', label: 'jobs' }}>
        body
      </WidgetFrame>,
    );
    expect(html).toContain('<footer');
    expect(html).toMatch(/<a [^>]*href="\/admin\/jobs"/);
    expect(html).toContain('Go to jobs');
    expect(html).toContain('aria-label="Go to jobs"');
  });

  it('composes goTo with existing footer content (both render)', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame
        title="My Jobs"
        footer={<span>3 of 12 shown</span>}
        goTo={{ href: '/admin/jobs', label: 'jobs' }}
      >
        body
      </WidgetFrame>,
    );
    expect(html).toContain('3 of 12 shown');
    expect(html).toContain('Go to jobs');
  });

  it('renders no footer when neither footer nor goTo is provided', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <WidgetFrame title="X">body</WidgetFrame>,
    );
    expect(html).not.toContain('<footer');
  });
});

describe('Slice 6 — WidgetFrame no longer exports resolveColors', () => {
  it('the legacy color helper is gone from the module surface', async () => {
    const mod = await import('@/lib/hub/components/WidgetFrame');
    expect((mod as Record<string, unknown>).resolveColors).toBeUndefined();
  });
});
