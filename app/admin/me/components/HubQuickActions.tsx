'use client';
// app/admin/me/components/HubQuickActions.tsx
//
// Hub panel 6 (§5.1) — quick-action button row. Phase 4 swaps the
// fixed list for a persona-aware top-3 set (§5.4). Slice 2a ships a
// shared default that covers the four palette actions from Phase 1.

import Link from 'next/link';

interface QuickAction {
  href: string;
  label: string;
}

const ACTIONS: QuickAction[] = [
  { href: '/admin/my-hours',   label: 'Clock in / out' },
  { href: '/admin/receipts',   label: 'Approve receipts' },
  { href: '/admin/jobs/new',   label: 'New job' },
  { href: '/admin/cad',        label: 'Open CAD' },
];

export default function HubQuickActions() {
  return (
    <section className="hub-panel hub-quick">
      <header className="hub-panel__header">
        <h2 className="hub-panel__title">Quick actions</h2>
        <span className="hub-quick__hint">
          Press <kbd>⌘K</kbd> for the command palette.
        </span>
      </header>
      <div className="hub-quick__row">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="hub-btn hub-btn--outline">
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
