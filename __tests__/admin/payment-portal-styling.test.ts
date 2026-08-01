// __tests__/admin/payment-portal-styling.test.ts
//
// P20 of payment-infrastructure-2026-06-18.md — three styling passes
// on the customer portal. Locks the WCAG AA + brand polish work:
//   - sticky brand header on both /pay + /pay/[invoice]
//   - skeleton loader on the detail page (replaces plain "Loading…")
//   - reduced-motion handling on the skeleton shimmer
//   - one-thumb tap targets (44×44) on the header CTA
//   - focus-visible ring on every interactive element
//   - aria-label on the method picker cards
//   - aria-busy on the loading state

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('PayHeader component — source-lock', () => {
  const SRC = read('app/pay/PayHeader.tsx');

  it("is a banner landmark with an accessible brand link", () => {
    expect(SRC).toMatch(/role="banner"/);
    // The label is built from the firm now (audit item 8h) — a second firm's customer must not be
    // told by a screen reader that they are on a competitor's payment portal.
    expect(SRC).toMatch(/aria-label=\{`\$\{firm\.name\} — payment portal home`\}/);
  });

  it("renders the call CTA with an accessible label + tel: link", () => {
    expect(SRC).toMatch(/href=\{`tel:\$\{firm\.phoneE164\}`\}/);
    // …and no button at all when there is no number, rather than a tel: link that dials nothing.
    expect(SRC).toMatch(/firm\.phoneE164 && firm\.phone && \(/);
    expect(SRC).toMatch(/aria-label=\{`Call \$\{firm\.name\} at \$\{firm\.phone\}`\}/);
    expect(SRC).toMatch(/data-testid="pay-header-call"/);
  });

  it("uses sticky positioning + brand colors via Pay.css", () => {
    const CSS = read('app/styles/Pay.css');
    expect(CSS).toMatch(/\.pay-header \{[\s\S]*position: sticky/);
    expect(CSS).toMatch(/\.pay-header__call \{[\s\S]*min-height: 44px/);
    expect(CSS).toMatch(/\.pay-header__call \{[\s\S]*min-width: 44px/);
  });

  it("collapses brand tail + call text on small phones", () => {
    const CSS = read('app/styles/Pay.css');
    expect(CSS).toMatch(/@media \(max-width: 480px\)[\s\S]{0,200}\.pay-header__brand-tail \{ display: none/);
    expect(CSS).toMatch(/\.pay-header__call-text \{ display: none/);
  });
});

describe('PaySkeleton component — source-lock', () => {
  const SRC = read('app/pay/PaySkeleton.tsx');

  it("is a polite live region with aria-busy", () => {
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/aria-busy="true"/);
    expect(SRC).toMatch(/aria-live="polite"/);
  });

  it("publishes a visually-hidden text label for screen readers", () => {
    expect(SRC).toMatch(/className="visually-hidden"/);
    expect(SRC).toMatch(/Loading your invoice/);
  });

  it("respects prefers-reduced-motion (no shimmer animation)", () => {
    const CSS = read('app/styles/Pay.css');
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(CSS).toMatch(/\.pay-skeleton__hero,\s*\.pay-skeleton__line \{ animation: none/);
  });
});

describe('/pay landing — header + accessibility', () => {
  const SRC = read('app/pay/page.tsx');

  it("does NOT render a second header — the site header is the header (2026-07-31)", () => {
    // THIS ASSERTION IS THE INVERSE OF THE ONE IT REPLACES, and the flip was the fix.
    //
    // P20 built `PayHeader` for a standalone portal, which was reasonable in the abstract. In practice
    // `/pay` renders inside the site's own layout, so the page had TWO headers — and the second landed
    // exactly in the band that the site's absolutely-positioned `.logo-container` (z-index 10) and
    // `.navbar` (z-index 100) overhang by ~69px. The owner's screenshot shows "…Surveying · Payments"
    // disappearing behind the star logo.
    //
    // The old test passed throughout, because it asked whether the component was mounted, not whether
    // anyone could see it. That is the failure mode of a source-lock, and it is worth leaving the note.
    expect(SRC).not.toMatch(/<PayHeader \/>/);
    expect(SRC).not.toMatch(/import PayHeader/);
  });

  it("keeps a 44px call route inside the card, which is what PayHeader was actually for", () => {
    // The one thing the retired header had that the site header does not. Removing the duplicate must
    // not quietly remove the affordance with it.
    const CSS = read('app/styles/Pay.css');
    expect(CSS).toMatch(/\.pay-hero__call \{[\s\S]*min-height: 44px/);
  });

  it("keeps the existing form accessibility (label, error role, autocomplete)", () => {
    expect(SRC).toMatch(/htmlFor="invoice-number"/);
    expect(SRC).toMatch(/role="alert"/);
  });
});

describe('/pay/[invoice] detail — skeleton loader + a11y', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("does NOT render a second header on any branch (2026-07-31)", () => {
    // Was: "renders PayHeader on loading + error + success branches", counting three mounts. All three
    // were invisible behind the site chrome — see the landing-page note above.
    expect(SRC).not.toMatch(/<PayHeader \/>/);
    expect(SRC).not.toMatch(/import PayHeader/);
  });

  it("uses PaySkeleton instead of a plain text 'Loading…'", () => {
    expect(SRC).toMatch(/import PaySkeleton from '\.\.\/PaySkeleton'/);
    expect(SRC).toMatch(/<PaySkeleton \/>/);
    expect(SRC).not.toMatch(/Loading your invoice…<\/p>/);
  });

  it("error branch uses role=alert so screen-readers announce it", () => {
    expect(SRC).toMatch(/data-testid="pay-detail-error" role="alert"/);
  });

  it("method picker cards have an aria-label with the amount + method", () => {
    expect(SRC).toMatch(/aria-label={`Pay \$\{formatDollars\(chosenCents\)\} with \$\{method\.label\}`}/);
    // glyph stays aria-hidden so the screen reader doesn't say "💳"
    expect(SRC).toMatch(/aria-hidden="true">{method\.glyph}/);
  });
});

describe('Pay.css — universal focus ring + sr-only helper', () => {
  const CSS = read('app/styles/Pay.css');

  it("ships a .visually-hidden helper for SR-only text", () => {
    expect(CSS).toMatch(/\.visually-hidden \{[\s\S]{0,200}clip: rect\(0, 0, 0, 0\)/);
  });

  it("publishes a universal :focus-visible ring on every interactive element", () => {
    expect(CSS).toMatch(/\.pay-shell :focus-visible \{[\s\S]{0,200}outline: 3px solid #1D3095/);
  });
});

describe('P20 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');
  it("plan still references the customer portal styling pass scope", () => {
    expect(PLAN).toMatch(/Customer portal styling pass/);
  });
});
