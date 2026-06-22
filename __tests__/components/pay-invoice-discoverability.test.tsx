// __tests__/components/pay-invoice-discoverability.test.tsx
//
// payment-portal-discoverability-2026-06-22 — lock the three surface
// areas where the public site has to link to /pay so the customer
// portal is actually findable:
//   1. PayInvoiceCTA shared component renders a link to /pay.
//   2. The Header nav array includes the Pay Invoice entry.
//   3. The Footer service-link list includes Pay an Invoice.

import React from 'react';
import { describe, it, expect } from 'vitest';
import * as ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

import PayInvoiceCTA from '@/app/components/PayInvoiceCTA';

describe('PayInvoiceCTA', () => {
  it('renders a link to /pay', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PayInvoiceCTA, {}),
    );
    expect(html).toContain('href="/pay"');
    expect(html).toContain('Pay your invoice');
  });

  it('respects custom copy', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(PayInvoiceCTA, {
        headline: 'Already a customer?',
        ctaLabel: 'Settle up online →',
      }),
    );
    expect(html).toContain('Already a customer?');
    expect(html).toContain('Settle up online →');
  });

  it('changes the variant dataset for ribbon/inline/chip', () => {
    for (const v of ['ribbon', 'inline', 'chip'] as const) {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(PayInvoiceCTA, { variant: v }),
      );
      expect(html).toContain(`data-variant="${v}"`);
    }
  });
});

describe('Header — Pay Invoice nav entry', () => {
  // Source-regex the Header source so we don't have to render the
  // whole next/navigation + session stack just to assert the array.
  const HEADER_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'components', 'Header.tsx'),
    'utf8',
  );

  it('lists /pay with label "Pay Invoice" in navLinks', () => {
    expect(HEADER_SRC).toMatch(/{\s*href:\s*'\/pay'\s*,\s*label:\s*'Pay Invoice'/);
  });

  it('keeps the scrolled mini-nav Pay Invoice button', () => {
    expect(HEADER_SRC).toContain('scrolled-pay-btn');
    expect(HEADER_SRC).toMatch(/<Link href="\/pay" className="scrolled-pay-btn">/);
  });
});

describe('Footer — Pay an Invoice link', () => {
  const FOOTER_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'components', 'Footer.tsx'),
    'utf8',
  );

  it('includes the /pay entry in serviceLinks', () => {
    expect(FOOTER_SRC).toMatch(/{\s*href:\s*'\/pay'\s*,\s*label:\s*'Pay an Invoice'/);
  });

  it('renders the Pay an Invoice CTA in the contact column', () => {
    expect(FOOTER_SRC).toContain('footer__cta footer__cta--pay');
    expect(FOOTER_SRC).toContain('Pay an Invoice');
  });

  it('renders the bottom-bar Pay Invoice mini-link', () => {
    expect(FOOTER_SRC).toContain('footer__employee-link--pay');
  });
});
