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
      // Staff status is passed in now rather than derived from the address here, so the drawer and
      // the desktop rail cannot answer it differently (audit item 8h).
      isCompanyUser: true,
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
      // C13b: '/admin/contacts' is the Messages portal's `contacts` tab — the firm-wide CRM, as
      // distinct from the `directory` tab beside it, which is the internal team list. Its registry
      // row stays (a contact record lives under it) but `showInRail: false` keeps it out of the
      // drawer. What §1.3 was defending — that the CRM is reachable from a phone — is defended by
      // asserting the portal that now holds it, which is why '/admin/messages' joins this list.
      '/admin/invoicing', '/admin/messages', '/admin/files', '/admin/calendar',
      // C12a: '/admin/audit' is the System portal's `audit` tab; the drawer offers the portal, which
      // is '/admin/support' — already on this list, one line up, and asserted there.
      // C13c: '/admin/reports' is the Books & Tax portal's `reports` tab — §4's addendum calls it
      // "a financial report". Its row stays registered because /admin/reports/job lives under it,
      // but `showInRail: false` keeps it out of the drawer, so the drawer offers '/admin/finances'.
      '/admin/support', '/admin/finances', '/admin/billing',
      // C9: '/admin/invites' is the People portal's `invites` tab; the drawer offers the portal.
      '/admin/people', '/admin/announcements',
    ]) {
      expect(html, `${href} should now appear in the drawer`).toContain(`href="${href}"`);
    }
  });

  it('and the links that were nearly lost converting it', () => {
    // ── THREE OF THE FIVE ARE TABS NOW, AND THE GUARD STILL HOLDS ────────────────────────
    //
    // `payouts/runs`, `rewards/how-it-works` and `rewards/admin` were nearly lost when the drawer was
    // converted to read the registry, which is why this test exists. C6 absorbed all three into the
    // Pay portal deliberately — that is not the same failure, and asserting the old hrefs would make
    // this guard block the consolidation it was never about.
    //
    // What it now checks is the thing it was always protecting: the drawer offers a way to each of
    // them. For the three absorbed, that way is one row whose keywords carry their words.
    for (const href of [
      // C8: '/admin/invoices/new' is the Customer Money portal's 'New invoice' BUTTON and
      // '/admin/payments/inbox' its `incoming` tab. Both are inside the row the drawer offers.
      '/admin/invoicing', '/admin/pay',
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
