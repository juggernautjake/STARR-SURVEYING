// app/pay/layout.tsx
//
// S7 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — wraps every /pay route in the
// temporary launch password gate (PayGate). The gate is a no-op when
// PAY_PORTAL_PASSWORD is unset, so removing the wall at launch is a single
// env change with no code edit.

import PayGate from './PayGate';

// THE STYLESHEET BELONGS TO THE ROUTE, NOT TO ONE PAGE IN IT.
//
// Owner report, 2026-07-31, with a screenshot: the /pay gate rendering as raw unstyled HTML, its heading
// sitting under the site logo and nav.
//
// The cause was this import being one level too deep. `Pay.css` was imported by `page.tsx` — but `PayGate`
// SHORT-CIRCUITS: when the portal is locked it renders its own markup and never renders `children`, so the
// page module never loads, so its CSS import never runs. Every `.pay-*` class in the gate resolved to
// nothing. The 120px top padding that keeps content clear of the site's absolutely-positioned navbar and
// logo (which overhang the content area by ~69px) was in the stylesheet all along and simply never applied.
//
// Importing here means every /pay route is styled whichever component ends up rendering — gate, landing or
// invoice detail. A stylesheet imported by a page that a guard can skip is a stylesheet with a hole in it.
import '../styles/Pay.css';

export default function PayLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <PayGate>{children}</PayGate>;
}
