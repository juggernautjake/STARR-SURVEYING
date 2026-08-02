'use client';
// app/admin/research/coverage/AdapterHealthPanel.tsx — "is my county working?" (roadmap §9.8).
//
// The coverage page below this panel answers a COMPILE-TIME question: which counties do we have an
// adapter for at all. That is a map of intent. This panel answers the runtime one: of the portals we
// registered, which are actually returning data right now.
//
// Both are needed and they are different facts. A county can be green on the registry map and broken
// in reality — that gap is precisely what Pillar B exists to close, and showing only the first is how
// a firm promises a customer a county it can no longer search.
//
// ── THREE EMPTY STATES, NOT ONE ─────────────────────────────────────────────────────────────────
//
//   nothing registered   — the registry is empty; go register a portal
//   registered, unchecked — adapters exist but no health check has run in the window
//   all healthy          — checks ran and everything passed
//
// Collapsing them would let "the checker has never run" render as good news, which is the failure
// mode this whole pillar is built to prevent.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';

interface Entry {
  adapter_id: string;
  county_name?: string;
  site_type: string;
  vendor_key?: string | null;
  base_url: string;
  effective_status: string;
  last_checked_at: string | null;
  hours_since_last_check: number | null;
  last_diff_summary: string | null;
  pending_proposal_count: number;
  best_pending_confidence: number | null;
  confidence_band: 'green' | 'yellow' | 'red' | 'unknown';
}

const SITE_TYPE_LABELS: Record<string, string> = {
  appraisal_cad: 'Appraisal district',
  clerk_deeds: 'Clerk — deeds',
  plat_records: 'Plats',
  gis_parcels: 'GIS parcels',
  legal_description: 'Legal descriptions',
  flood_fema: 'Flood / FEMA',
  survey_glo: 'GLO records',
  misc: 'Other',
};

const BAND_ICON = {
  green: CheckCircle2,
  yellow: AlertTriangle,
  red: AlertTriangle,
  unknown: Clock,
} as const;

function ago(hours: number | null): string {
  if (hours === null) return 'never checked';
  if (hours < 1) return 'checked just now';
  if (hours < 48) return `checked ${Math.round(hours)}h ago`;
  return `checked ${Math.round(hours / 24)}d ago`;
}

export default function AdapterHealthPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [checksInWindow, setChecksInWindow] = useState(0);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/research/adapter-health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { entries?: Entry[]; checksInWindow?: number }) => {
        if (cancelled) return;
        setEntries(d.entries ?? []);
        setChecksInWindow(d.checksInWindow ?? 0);
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('failed'); });
    return () => { cancelled = true; };
  }, []);

  const pending = entries.reduce((n, e) => n + e.pending_proposal_count, 0);
  const unhealthy = entries.filter((e) => e.confidence_band === 'red' || e.confidence_band === 'yellow');

  return (
    <section className="adapter-health">
      <header className="adapter-health__head">
        <h2 className="adapter-health__title">
          <Activity size={16} aria-hidden /> Live portal health
        </h2>
        {pending > 0 ? (
          <Link href="/admin/research/self-heal" className="adapter-health__queue">
            <Wrench size={13} aria-hidden /> {pending} repair {pending === 1 ? 'proposal' : 'proposals'} waiting
          </Link>
        ) : null}
        {/* Always present, not only in the empty state. Registration is deliberately palette-only in
            the rail (it is a rare setup action), so this panel is its front door — and "why can't we
            search this county" is asked while looking at exactly this list. */}
        <Link href="/admin/research/sites" className="adapter-health__manage">Manage data sources →</Link>
      </header>

      {state === 'loading' ? (
        <p className="adapter-health__note">Reading the registry…</p>
      ) : state === 'failed' ? (
        <p className="adapter-health__note adapter-health__note--bad">
          The health rollup could not be read. This is not an all-clear — nothing below reflects the
          current state.
        </p>
      ) : entries.length === 0 ? (
        <p className="adapter-health__note">
          No portals are registered yet, so there is nothing to check.{' '}
          <Link href="/admin/research/sites">Register one</Link>.
        </p>
      ) : checksInWindow === 0 ? (
        // The distinction that matters most on this panel.
        <p className="adapter-health__note adapter-health__note--warn">
          {entries.length} {entries.length === 1 ? 'portal is' : 'portals are'} registered, but no
          health check has run in the last week — so we do not know whether they still work. Scheduled
          checking is off by default; turn it on from{' '}
          <Link href="/admin/research/self-heal">self-healing</Link>.
        </p>
      ) : unhealthy.length === 0 ? (
        <p className="adapter-health__note adapter-health__note--ok">
          <CheckCircle2 size={14} aria-hidden /> All {entries.length} registered{' '}
          {entries.length === 1 ? 'portal' : 'portals'} passed their last check.
        </p>
      ) : null}

      {state === 'ok' && entries.length > 0 ? (
        <ul className="adapter-health__list">
          {entries.map((e) => {
            const Icon = BAND_ICON[e.confidence_band];
            return (
              <li key={e.adapter_id} className={`adapter-health__row adapter-health__row--${e.confidence_band}`}>
                <Icon size={15} aria-hidden className="adapter-health__icon" />
                <span className="adapter-health__who">
                  <strong>{e.county_name ?? 'Unknown county'}</strong>
                  <span>{SITE_TYPE_LABELS[e.site_type] ?? e.site_type}</span>
                </span>
                <span className="adapter-health__state">
                  {e.effective_status}
                  {e.last_diff_summary ? <em> — {e.last_diff_summary}</em> : null}
                </span>
                <span className="adapter-health__when">{ago(e.hours_since_last_check)}</span>
                {e.pending_proposal_count > 0 ? (
                  <Link href="/admin/research/self-heal" className="adapter-health__fix">
                    fix ready
                    {e.best_pending_confidence !== null ? ` (${Math.round(e.best_pending_confidence * 100)}%)` : ''}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
