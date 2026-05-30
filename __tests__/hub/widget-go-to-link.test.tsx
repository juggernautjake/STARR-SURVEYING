// __tests__/hub/widget-go-to-link.test.tsx
//
// Slice 1 of hub-widget-excellence-02-shared-infra. Locks the shared
// "Go to {label} →" footer link: a real anchor to `href`, the
// "Go to {label}" text + aria-label, an arrow affordance, and the
// optional decorative icon.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import WidgetGoToLink from '@/lib/hub/widgets/_shared/WidgetGoToLink';

function render(props: React.ComponentProps<typeof WidgetGoToLink>): string {
  return ReactDOMServer.renderToStaticMarkup(<WidgetGoToLink {...props} />);
}

describe('WidgetGoToLink', () => {
  it('renders an anchor pointing at href', () => {
    const html = render({ href: '/admin/jobs', label: 'jobs' });
    expect(html).toMatch(/<a [^>]*href="\/admin\/jobs"/);
  });

  it('renders the "Go to {label}" text + an arrow', () => {
    const html = render({ href: '/admin/finances', label: 'finances' });
    expect(html).toContain('Go to finances');
    expect(html).toContain('→');
  });

  it('sets an aria-label for screen readers', () => {
    const html = render({ href: '/admin/schedule', label: 'the schedule' });
    expect(html).toContain('aria-label="Go to the schedule"');
  });

  it('carries the shared class + data hook for styling/selection', () => {
    const html = render({ href: '/admin/messages', label: 'messages' });
    expect(html).toContain('class="widget-go-to-link"');
    expect(html).toContain('data-widget-go-to');
  });

  it('renders the optional icon when provided, and omits it otherwise', () => {
    const withIcon = render({ href: '/admin/jobs', label: 'jobs', icon: '📋' });
    expect(withIcon).toContain('📋');
    const without = render({ href: '/admin/jobs', label: 'jobs' });
    expect(without).not.toContain('📋');
  });
});
