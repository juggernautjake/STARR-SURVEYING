// app/admin/money/page.tsx
//
// The Money workspace landing (platform audit §2.2 / Phase 1 item 7).
//
// §2.2 found thirty money surfaces spread across the Work and Office workspaces with no single
// financial home, and — worse — a vocabulary that collided: "Billing" meant the subscription this
// firm pays, "Invoicing" meant what customers pay the firm, "Finances" meant job profitability.
// Nobody was going to guess that.
//
// The pages did not need rewriting; they needed a shape and honest names. Both live in the route
// registry, so this file is four lines: the landing renders the workspace, grouped by the sections
// the audit named — Money in · Money out · Profitability · Company account.

import WorkspaceLanding from '../components/nav/WorkspaceLanding';

export default function MoneyLanding() {
  return <WorkspaceLanding workspace="money" />;
}
