// __tests__/admin/sidebar-render.test.tsx — actually render the mobile drawer (§1.3).
//
// The rest of this conversion is asserted against source text, which proves the code SAYS the right
// thing. It does not prove anything reaches the screen — and "authored but not wired" is this repo's
// signature defect (the audit says so in §1.4, about 35 pages that existed and could not be found).
// Deriving nav from a registry is exactly the kind of change that type-checks, lints, passes every
// string assertion, and renders an empty drawer.
//
// So: render it, with react-dom/server like the rest of the suite (no @testing-library dep), and read
// the markup.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/jobs',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// next/image needs a loader and a real layout; a plain <img> is all this test needs to see.
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => React.createElement('img', { alt }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

import AdminSidebar from '@/app/admin/components/AdminSidebar';

function render(props: Partial<React.ComponentProps<typeof AdminSidebar>> = {}) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(AdminSidebar, {
      role: 'admin',
      roles: ['admin'],
      userName: 'Jacob Maddux',
      userEmail: 'jacob@starr-surveying.com',
      isOpen: true,
      onClose: () => {},
      ...props,
    }),
  );
}

describe('the drawer renders', () => {
  let html = '';
  beforeEach(() => { html = render(); });

  it('at all — not an empty <nav>', () => {
    // The failure this test exists for. Every source assertion in this slice would still pass if
    // `sections` derived to [].
    expect(html).toContain('admin-sidebar__nav');
    const links = html.match(/class="admin-sidebar__link/g) ?? [];
    expect(links.length, 'the drawer must contain real links').toBeGreaterThan(40);
  });

  it('grouped under the workspace names the icon rail uses', () => {
    for (const label of ['Hub', 'Work', 'Equipment', 'Research &amp; CAD', 'Knowledge', 'Office']) {
      expect(html, `missing the ${label} section`).toContain(label);
    }
  });

  it('including the routes §1.3 found missing from the hand-written list', () => {
    // The concrete cost of the drift, now measurable on a phone. Every one of these was in the
    // registry, reachable on desktop, and absent from the drawer.
    for (const href of [
      '/admin/invoicing', '/admin/contacts', '/admin/files', '/admin/calendar',
      '/admin/support', '/admin/reports', '/admin/billing', '/admin/audit',
      '/admin/invites', '/admin/announcements',
    ]) {
      expect(html, `${href} should now appear in the drawer`).toContain(`href="${href}"`);
    }
  });

  it('and the five links that were nearly lost converting it', () => {
    for (const href of [
      '/admin/invoices/new', '/admin/payments/inbox', '/admin/payouts/runs',
      '/admin/rewards/how-it-works', '/admin/rewards/admin',
    ]) {
      expect(html, `${href} was in the old drawer and must still be`).toContain(`href="${href}"`);
    }
  });
});

describe('the drawer respects access', () => {
  it('hides internal-only routes from a non-company email', () => {
    // Same gate as the rail, because there is only one gate now. If this were wrong it would be wrong
    // everywhere at once — which is the trade the consolidation makes, and why it is worth rendering.
    const html = render({
      role: 'employee', roles: ['employee'], userEmail: 'someone@gmail.com',
    });
    expect(html).not.toContain('href="/admin/jobs"');
    expect(html).not.toContain('href="/admin/payroll"');
  });

  it('still gives that user the pages they are entitled to', () => {
    // A drawer that renders nothing is "secure" and useless; assert the non-empty half too.
    const html = render({
      role: 'employee', roles: ['employee'], userEmail: 'someone@gmail.com',
    });
    expect(html).toContain('href="/admin/install"');
    expect(html).toContain('admin-sidebar__link');
  });

  it('gives field crew less than an admin, and more than nothing', () => {
    const crew = render({ role: 'field_crew', roles: ['field_crew'] });
    const admin = render();
    const count = (h: string) => (h.match(/class="admin-sidebar__link/g) ?? []).length;
    expect(count(crew)).toBeGreaterThan(0);
    expect(count(crew)).toBeLessThan(count(admin));
  });
});
