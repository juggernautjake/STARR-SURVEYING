// app/pay/layout.tsx
//
// S7 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — wraps every /pay route in the
// temporary launch password gate (PayGate). The gate is a no-op when
// PAY_PORTAL_PASSWORD is unset, so removing the wall at launch is a single
// env change with no code edit.

import PayGate from './PayGate';

export default function PayLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <PayGate>{children}</PayGate>;
}
