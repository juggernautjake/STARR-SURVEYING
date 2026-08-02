'use client';
// app/admin/me/LegacyTabNotice.tsx — where "My Pay" went (platform audit follow-up, 2026-08-01).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// Consolidation Slice 2 deleted /admin/my-pay, /admin/my-hours, /admin/my-jobs, /admin/my-notes and
// /admin/profile, redirecting each to `/admin/me?tab=<x>`. Slice 189 then retired the Hub's tab bar
// in favour of the widget canvas.
//
// Nothing connected the two. `/admin/me` reads exactly two query parameters — `edit` and `debug` —
// so every one of those five redirects has been landing on an undifferentiated widget canvas with
// the `tab` silently dropped. Five nav shortcuts and every bookmark anyone made in the last two
// months arrive somewhere that does not answer the question they asked. Measured 2026-08-01 by
// grepping the hub for `params.get`.
//
// ── WHY A NOTICE RATHER THAN RESURRECTING THE TABS ──────────────────────────────────────────────
//
// The tabs are not missing; they were replaced on purpose, and each one's content is a widget now.
// Rebuilding them would mean two surfaces rendering a person's pay — §1.3's defect, the one this
// audit spent Phase 1 removing.
//
// So the redirect keeps its promise a different way: it says which widget the thing became, and puts
// the user one click from having it. Dismissed per tab and remembered, because this is a migration
// aid and it should stop appearing once somebody has dealt with it.

import { useEffect, useState } from 'react';
import { X, LayoutGrid } from 'lucide-react';
import { useHubStore } from '@/lib/hub/hub-store';

/** Which widget each retired tab's content lives in now. Taken from `_archive/README.md`'s own
 *  "Where the old responsibilities live now" table, so the two cannot disagree. */
const TAB_HOMES: Record<string, { was: string; widget: string; detail: string }> = {
  pay: { was: 'My Pay', widget: 'Money', detail: 'your last payout, what you are owed, and outstanding invoices' },
  hours: { was: 'My Hours', widget: 'Hours This Week', detail: 'your timesheet for the week' },
  jobs: { was: 'My Jobs', widget: 'My Jobs', detail: 'the jobs assigned to you' },
  notes: { was: 'My Notes', widget: 'Bookmarks', detail: 'your saved notes and pinned pages' },
  profile: { was: 'Profile', widget: 'Customize Hub', detail: 'your theme, density and layout' },
};

const DISMISSED_KEY = 'hub-legacy-tab-dismissed';

export default function LegacyTabNotice() {
  const [tab, setTab] = useState<string | null>(null);
  const enterEditMode = useHubStore((s) => s.enterEditMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (!t || !TAB_HOMES[t]) return;

    let dismissed: string[] = [];
    try { dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { /* first visit */ }
    if (dismissed.includes(t)) {
      // Already dealt with. Strip the parameter anyway so a refresh does not keep it around.
      params.delete('tab');
      const search = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
      return;
    }
    setTab(t);
  }, []);

  if (!tab) return null;
  const home = TAB_HOMES[tab];

  function dismiss() {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY) || '[]';
      const list: string[] = JSON.parse(raw);
      if (tab && !list.includes(tab)) localStorage.setItem(DISMISSED_KEY, JSON.stringify([...list, tab]));
    } catch { /* localStorage unavailable — the notice simply shows again */ }
    setTab(null);
  }

  return (
    <div className="hub-legacy-notice" role="status">
      <div className="hub-legacy-notice__text">
        <strong>“{home.was}” is a widget now.</strong>{' '}
        Add <strong>{home.widget}</strong> to your Hub for {home.detail}.
      </div>
      <div className="hub-legacy-notice__actions">
        <button
          type="button"
          onClick={() => { enterEditMode(); dismiss(); }}
          className="hub-legacy-notice__cta"
        >
          <LayoutGrid size={14} aria-hidden /> Customize Hub
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="hub-legacy-notice__x">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
