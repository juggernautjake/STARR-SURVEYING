// app/pay/PayHeader.tsx
//
// ⚠ RETIRED FROM THE /pay ROUTES, 2026-07-31 — kept, not deleted, and here is why.
//
// P20 built this as the header for a STANDALONE payment portal, which is a reasonable thing to want: a
// customer following a link from a paper invoice wants the brand, a phone number, and nothing else. But
// `/pay` renders inside the site's own layout, so in practice the page had TWO headers — and the second
// one landed in the exact band that the site's absolutely-positioned `.logo-container` (z-index 10) and
// `.navbar` (z-index 100) overhang, which is ~69px below where the header's box ends. The owner's
// screenshot of 2026-07-31 shows the result: "…Surveying · Payments" vanishing behind the star.
//
// Stacking it below the overhang would have fixed the collision and left the real problem — two headers
// saying the same thing, when the site header already carries the brand, the phone number, and a "Pay
// Invoice" nav item. So the pay routes now use the site's header like every other page, which is what
// "in accordance with the rest of the website" means.
//
// WHY IT IS STILL HERE. The one thing this component had that the site header does not is a 44×44 call
// target pinned where a thumb can reach it, and that matters on the page where somebody is trying to pay
// a bill. That affordance moved into the cards (`.pay-hero__call`), so nothing was lost — but if the
// portal is ever served standalone (its own subdomain, or a link that skips the site chrome), this is
// the header it should use, and re-deriving it from scratch would be waste.
//
// One-thumb tap target (44×44 minimum) on the phone CTA so a
// customer can call from their mobile without zooming in.

import Link from 'next/link';

export default function PayHeader(): React.ReactElement {
  return (
    <header className="pay-header" role="banner" data-testid="pay-header">
      <div className="pay-header__inner">
        <Link href="/pay" className="pay-header__brand" aria-label="Starr Surveying — payment portal home">
          <span className="pay-header__brand-mark">STARR</span>
          <span className="pay-header__brand-tail">Surveying · Payments</span>
        </Link>
        <a
          href="tel:+19366620077"
          className="pay-header__call"
          aria-label="Call Starr Surveying at (936) 662-0077"
          data-testid="pay-header-call"
        >
          <span aria-hidden>📞</span>
          <span className="pay-header__call-text">(936) 662-0077</span>
        </a>
      </div>
    </header>
  );
}
