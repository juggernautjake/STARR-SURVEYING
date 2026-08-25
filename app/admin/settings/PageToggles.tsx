'use client';

// app/admin/settings/PageToggles.tsx — which pages this firm uses.
//
// T3 of §11 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Owner: *"I want it so that we can have full control in the settings as to what all pages are
// visible and what pages are not… Maybe we don't want to use a page or feature right now, so we
// would toggle it off so that navigating the webpage is easier, but if we decide to use that
// page/feature in the future, then we can turn it back on and make sure it is hooked up correctly."*
//
// ── GROUPED THE WAY THE SIDEBAR GROUPS THEM, AND THAT IS NOT COSMETIC ───────────────────────────
//
// The person using this screen is looking at their own sidebar and deciding what to remove from it.
// A list sorted any other way — alphabetically, by URL, by when the page shipped — would make them
// translate between two orderings of the same thing while flipping switches they cannot immediately
// verify. Same order, same labels, same groups: the screen is a picture of the menu it edits.
//
// ── EVERY SWITCH SAVES IMMEDIATELY, AND SAYS SO ─────────────────────────────────────────────────
//
// No Save button. A page of forty switches behind one button is a page where you lose all of it to a
// misclick, and where "did that take?" is unanswerable until you navigate away and come back. Each
// row writes the whole map and reports its own result.
//
// The cost is honest and paid for: a failed write puts the switch BACK. A control that stays flipped
// after a failed save is the worst outcome here, because the screen would then disagree with the
// product about which pages exist.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, Loader2 } from 'lucide-react';
import { WORKSPACES, WORKSPACE_ORDER, type Workspace } from '@/lib/admin/route-registry';
import {
  TOGGLES_KEY, isEnabled, withToggle, disabledKeys,
  type FeatureToggles,
} from '@/lib/admin/feature-toggles';
import { invalidateFeatureToggles } from '@/lib/admin/use-feature-toggles';
import './PageToggles.css';

interface Destination {
  key: string;
  label: string;
  workspace: Workspace;
  /** How many other admin pages link here — §11.6. */
  inbound: number;
  /** Which ones, so the warning can name them rather than just counting. */
  inboundFrom: string[];
}

export default function PageToggles() {
  const [toggles, setToggles] = useState<FeatureToggles>({});
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // One endpoint, both halves. Two reads of the same fact is how a screen ends up showing
      // switches that disagree with the rows they sit on.
      const res = await fetch('/api/admin/feature-toggles', { cache: 'no-store' });
      if (res.ok) {
        const body = await res.json();
        setToggles((body?.toggles ?? {}) as FeatureToggles);
        setDestinations(body?.destinations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => WORKSPACE_ORDER
    .map((ws) => ({ ws, items: destinations.filter((d) => d.workspace === ws) }))
    .filter((g) => g.items.length > 0), [destinations]);

  const off = disabledKeys(toggles);

  async function flip(dest: Destination, enabled: boolean) {
    const next = withToggle(toggles, dest.key, enabled);
    // Optimistic, because a switch that waits half a second to move feels broken — and reverted in
    // the catch, because a switch that stays flipped after a failed save is worse than one that
    // hesitated: the screen would then disagree with the product about which pages exist.
    setToggles(next);
    setBusyKey(dest.key);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: TOGGLES_KEY, value: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Could not save that.');
      // The nav caches its read for the page load. Without this the sidebar keeps the old list until
      // a full reload, and the switch looks like it did nothing.
      invalidateFeatureToggles();
      setMessage(enabled
        ? `${dest.label} is back. It will reappear in the menus.`
        : `${dest.label} is off. It has gone from the menus — the page itself still works if you open it directly.`);
    } catch (err) {
      setToggles(toggles);
      setMessage(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <p className="admin-muted">
        <Loader2 size={14} className="spin" aria-hidden /> Reading which pages you use…
      </p>
    );
  }

  return (
    <div className="page-toggles">
      <p className="admin-muted">
        Switch off anything this company does not use. It disappears from the sidebar, the rail, the
        command palette and search — for everybody, including you. Nothing is deleted, and turning it
        back on restores it exactly.
      </p>
      {/* ── THE SENTENCE §11.5 EXISTS FOR ──────────────────────────────────────────────────────────
        *
        * "We turned payroll off, so the crew cannot see wages" is false the second somebody types
        * the URL. Said here, on the screen where the belief would form, rather than only in a code
        * comment nobody using this will ever read. */}
      <p className="page-toggles__caution">
        <AlertTriangle size={14} aria-hidden />
        <span>
          This hides pages; it does not lock them. Permissions are set by role, not here — switching a
          page off does not stop anyone who has the link and the role from opening it.
        </span>
      </p>

      {off.length > 0 && (
        <p className="page-toggles__count">
          {off.length} {off.length === 1 ? 'page is' : 'pages are'} switched off.
        </p>
      )}
      {message && <p className="page-toggles__msg" role="status">{message}</p>}

      {grouped.map(({ ws, items }) => (
        <section key={ws} className="page-toggles__group">
          <h3>{WORKSPACES[ws].label}</h3>
          <ul>
            {items.map((d) => {
              const on = isEnabled(toggles, d.key);
              return (
                <li key={d.key} className={on ? '' : 'is-off'}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busyKey === d.key}
                      onChange={(e) => void flip(d, e.target.checked)}
                    />
                    <span className="page-toggles__label">{d.label}</span>
                    <code className="page-toggles__href">{d.key}</code>
                  </label>
                  {/* ── §11.6: SAY WHAT IT BREAKS, DO NOT REFUSE ────────────────────────────────
                    *
                    * Pages link to each other. Switching off Vehicles leaves the mileage screen
                    * pointing at a page nobody can open, and the person flipping the switch has no
                    * way to know. The owner is allowed to break a link on purpose; they are not
                    * well served by doing it invisibly.
                    *
                    * Shown only when it is OFF — a link count on all 138 rows is noise, and this is
                    * only a consequence once the switch has been flipped. */}
                  {!on && d.inbound > 0 && (
                    <p className="page-toggles__links" title={d.inboundFrom.join('\n')}>
                      <Link2 size={12} aria-hidden />
                      {d.inbound} other {d.inbound === 1 ? 'page links' : 'pages link'} here
                      {d.inboundFrom.length > 0 && <> — {d.inboundFrom.slice(0, 3).join(', ')}
                        {d.inboundFrom.length > 3 && ` and ${d.inboundFrom.length - 3} more`}</>}
                      . Those links still work; they just point somewhere nobody can find any more.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
