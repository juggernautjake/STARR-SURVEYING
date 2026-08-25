'use client';
// app/admin/pay/page.tsx — the Pay & Payouts portal. The owner's headline example.
//
// C6 / P1.1–P1.3 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// §4, P1: *"Eleven links, one question: what is somebody owed and how do they get it."*
//
// The doc says to do this after Hours has proven the role split, and that was the right order: this
// portal has **seven different role lists** across its tabs, against Hours' four, and every one of
// them decides who can see money.
//
// ── THE ROUTE-SCOPED STYLESHEET TRAP, WHICH THIS SLICE WALKED INTO ──────────────────────────────
//
// `app/admin/payroll/layout.tsx` and `app/admin/rewards/layout.tsx` exist for one reason each: to
// `import '../styles/AdminPayroll.css'` and `'../styles/AdminRewards.css'`. A Next layout loads its
// stylesheet for its ROUTE TREE and nowhere else — which is exactly the trap this repository has
// been caught by twice, where a rule written in a route-scoped file reaches every route except the
// ones it was for.
//
// Moving those bodies here without their stylesheets would have rendered two tabs unstyled, with
// nothing failing: no error, no red test, just a payroll screen that looked broken. So the portal
// imports both. **The layouts stay** — their routes still exist as redirects, and a redirect renders
// nothing, but leaving them costs nothing and deleting them would be a second change in a slice
// that is already large.
//
// ── AND WHAT DELIBERATELY DID NOT BECOME A TAB ──────────────────────────────────────────────────
//
// **`/admin/pay-progression` is `parked: true`.** The plan's table maps it to tab `rates`, and doing
// that would have silently un-parked it: `accessibleRoutes` hides a parked route from EVERYBODY
// including admins — *"a parked feature is deliberately out of circulation"* — and a tab has no such
// flag. Absorbing it would have put 869 lines of a deliberately-withdrawn feature back in front of
// people, as a side effect of a navigation change. It stays a parked route, untouched.
//
// `/admin/payouts/tax-report` is P7's, not P1's — the plan assigns it to Books & Tax, and it is left
// where it is for that slice to take.
//
// `/admin/payouts/ad-hoc` and `/admin/payouts/search` are buttons, as the plan says. §4 calls search
// *"the clearest case in the whole document: a 201-line page whose entire job is to search a table
// another page already lists — a search box that was given a sidebar link."*

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Wallet, BadgeDollarSign, Banknote, ListChecks, HandCoins, ScrollText,
  DollarSign, Trophy, Settings2, HelpCircle, Search,
} from 'lucide-react';

import { usePortalTabs, type PortalSpec } from '@/lib/admin/portal/usePortalTabs';
// See the header: these two are the whole reason a payroll or rewards tab renders styled.
import '../styles/AdminPayroll.css';
import '../styles/AdminRewards.css';

import MyPayPanel from '../my-pay/MyPayPanel';
import PayrollTab from './_tabs/PayrollTab';
import LedgerTab from './_tabs/LedgerTab';
import PayoutRunsTab from './_tabs/PayoutRunsTab';
import WithdrawalsTab from './_tabs/WithdrawalsTab';
import HistoryTab from './_tabs/HistoryTab';
import RatesTab from './_tabs/RatesTab';
import RewardsTab from './_tabs/RewardsTab';
import RewardsAdminTab from './_tabs/RewardsAdminTab';
import HowRewardsWorkTab from './_tabs/HowRewardsWorkTab';
import './PayPortal.css';

/** `PAY_ROLES` + `tech_support`, the list four of these pages shared. Named once, used four times. */
const PAY_PLUS_SUPPORT = ['admin', 'developer', 'field_crew', 'tech_support'];

const PORTAL: PortalSpec = {
  route: '/admin/pay',
  tabs: [
    {
      id: 'my-pay',
      label: 'My pay',
      icon: Wallet,
      hint: 'What you have been paid, and what you are owed.',
      // `/admin/my-pay`: [...PAY_ROLES, 'employee', 'tech_support']. The broadest list here, and the
      // reason the portal is reachable at all by somebody who is not an admin.
      roles: ['admin', 'developer', 'field_crew', 'employee', 'tech_support'],
    },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: BadgeDollarSign,
      hint: 'Pay runs — who is being paid, how much, and for what.',
      roles: ['admin'],                                   // `/admin/payroll`
    },
    {
      id: 'ledger',
      label: 'Payouts',
      icon: Banknote,
      hint: 'Every payout, in and out, with the balance each person is carrying.',
      roles: ['admin'],                                   // `/admin/payouts`
    },
    {
      id: 'payout-runs',
      label: 'Payout runs',
      icon: ListChecks,
      hint: 'Batches sent to the bank, and what came back.',
      roles: ['admin'],                                   // `/admin/payouts/runs`
    },
    {
      id: 'withdrawals',
      label: 'Withdrawals',
      icon: HandCoins,
      hint: 'People asking to take money out, and the decision on each.',
      // `/admin/payouts/withdrawals` — the ONLY page in this portal that `finance` could reach.
      // Carried across exactly; `finance` exists precisely because `admin` was too broad an answer
      // to "who may look at what somebody earns".
      roles: ['admin', 'finance'],
    },
    {
      id: 'history',
      label: 'Pay changes',
      icon: ScrollText,
      hint: 'Every rate change, when it happened and who made it.',
      roles: PAY_PLUS_SUPPORT as never,                   // `/admin/payout-log`
    },
    {
      id: 'rates',
      label: 'Rates',
      icon: DollarSign,
      hint: 'What each job title is paid.',
      roles: ['admin', 'developer'],                      // `/admin/pay-rates`
    },
    {
      id: 'rewards',
      label: 'Rewards',
      icon: Trophy,
      hint: 'The XP store — what can be redeemed and by whom.',
      roles: PAY_PLUS_SUPPORT as never,                   // `/admin/rewards`
    },
    {
      id: 'rewards-admin',
      label: 'Manage rewards',
      icon: Settings2,
      hint: 'Add, edit and retire what the store offers.',
      // `/admin/rewards/admin` — a NARROWER list than the store's, so it stays its own tab rather
      // than folding into `rewards` as the plan's table suggested. Merging two pages with two role
      // lists into one tab has to widen one of them or narrow the other, and §5 rule 1 forbids both.
      roles: ['admin', 'developer', 'tech_support'],
    },
    {
      id: 'how-rewards-work',
      label: 'How rewards work',
      icon: HelpCircle,
      hint: 'What earns XP, what it is worth, and how redemption works.',
      roles: PAY_PLUS_SUPPORT as never,                   // `/admin/rewards/how-it-works`
    },
  ],
  // §5 rule 3. An admin opens on the pay run, because that is the thing with a deadline. Everybody
  // else opens on their own pay, which for most people is the only tab they can see.
  defaultTab: (roles) => (roles.includes('admin') ? 'payroll' : 'my-pay'),
};

export default function PayPortal() {
  const { data: session } = useSession();
  const viewer = useMemo(() => ({ roles: (session?.user?.roles ?? []) as string[] }), [session]);

  const { active, tabs, select } = usePortalTabs(PORTAL, viewer);
  const activeTab = tabs.find((t) => t.id === active);
  const isAdmin = viewer.roles.includes('admin');

  return (
    <div className="pay-portal">
      <nav className="pay-portal__tabs" role="tablist" aria-label="Pay and payouts">
        {tabs.map((t) => {
          const Icon = t.icon as typeof Wallet;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`pay-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`pay-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`pay-portal__tab${isActive ? ' pay-portal__tab--active' : ''}`}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = tabs.findIndex((x) => x.id === t.id);
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
                select(next.id);
                document.getElementById(`pay-tab-${next.id}`)?.focus();
              }}
            >
              <Icon size={15} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {!active && (
        <p className="pay-portal__none">
          Every part of Pay &amp; Payouts is switched off for this company. An admin can turn them
          back on in Settings → Pages.
        </p>
      )}

      {activeTab && (
        <div className="pay-portal__toolbar">
          <p className="pay-portal__hint">{activeTab.hint}</p>
          {/* The plan's two buttons, and only on the tab they belong to. Shown to admins only,
            * because both routes are admin-gated — a button that bounces you is worse than one that
            * is honestly absent, which is the same call `/admin/marketing` made about its date
            * picker on the uploads tab. */}
          {active === 'ledger' && isAdmin && (
            <div className="pay-portal__actions">
              <Link className="pay-portal__action" href="/admin/payouts/search">
                <Search size={14} aria-hidden /> Search payouts
              </Link>
              <Link className="pay-portal__action" href="/admin/payouts/ad-hoc">
                <HandCoins size={14} aria-hidden /> Ad-hoc payout
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Only the active panel mounts. Ten tabs that each fetch on mount would otherwise make
          opening your own payslip pay for nine screens you cannot see. */}
      <div id={`pay-panel-${active}`} role="tabpanel" aria-labelledby={`pay-tab-${active}`}>
        {active === 'my-pay' && <MyPayPanel />}
        {active === 'payroll' && <PayrollTab />}
        {active === 'ledger' && <LedgerTab />}
        {active === 'payout-runs' && <PayoutRunsTab />}
        {active === 'withdrawals' && <WithdrawalsTab />}
        {active === 'history' && <HistoryTab />}
        {active === 'rates' && <RatesTab />}
        {active === 'rewards' && <RewardsTab />}
        {active === 'rewards-admin' && <RewardsAdminTab />}
        {active === 'how-rewards-work' && <HowRewardsWorkTab />}
      </div>
    </div>
  );
}
