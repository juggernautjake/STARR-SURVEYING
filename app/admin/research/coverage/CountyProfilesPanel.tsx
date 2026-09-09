'use client';
// app/admin/research/coverage/CountyProfilesPanel.tsx — one row per county: what we know and how a run there behaves.
//
// The three tiers (owner, 2026-09-09): CURATED — a person drove every site and a dedicated run exists;
// VENDOR-DEFAULT — the vendors are known and the generic run uses their shapes, but nobody has proven a
// parcel here; FALLBACK — the statewide aggregator only. The rows come from the worker's own resolver,
// so the tier a surveyor reads is the tier the router acts on.

import React, { useEffect, useMemo, useState } from 'react';
import './CountyProfilesPanel.css';

type Tier = 'curated' | 'vendor-default' | 'fallback';

interface ProfileSite {
  role: string;
  vendor: string;
  url: string | null;
  egress?: string;
  verifiedAt?: string;
  notes?: string;
}

interface ProfileView {
  name: string;
  key: string;
  fips: string;
  tier: Tier;
  curated: boolean;
  sites: ProfileSite[];
  capabilities: {
    freePlatRepository: boolean;
    gisParcelLayer: boolean;
    surveyLayer: boolean;
    historicIndex: boolean;
    clerkFreePreview: boolean;
    clerkBridge: string;
  };
  recipe: string[];
  golden: Array<{ propertyId: string; address: string; verifiedAt: string }>;
  statement: string;
}

interface Payload {
  count: number;
  tiers: Record<Tier, number>;
  profiles: ProfileView[];
}

const TIER_LABEL: Record<Tier, string> = {
  curated: 'Curated',
  'vendor-default': 'Vendor default',
  fallback: 'Fallback',
};

const TIER_HINT: Record<Tier, string> = {
  curated: 'Every site driven by hand; a dedicated run; golden parcels on file.',
  'vendor-default': 'Vendors known from the registries; the generic run uses their shapes. Nobody has proven a parcel here yet.',
  fallback: 'No county portal known; the statewide aggregator (paid) is the only source.',
};

function host(url: string | null): string {
  if (!url) return '—';
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

function site(p: ProfileView, role: string): ProfileSite | undefined {
  return p.sites.find((s) => s.role === role);
}

function Pill({ tier }: { tier: Tier }) {
  return <span className={`cpp__pill cpp__pill--${tier}`}>{TIER_LABEL[tier]}</span>;
}

export default function CountyProfilesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/research/county-profiles')
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error((body && body.error) || `HTTP ${r.status}`);
        return body as Payload;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.profiles.filter((p) => (tier === 'all' || p.tier === tier) && (!q || p.name.toLowerCase().includes(q) || p.fips.includes(q)));
  }, [data, filter, tier]);

  return (
    <section className="county-profiles cpp">
      <h2 className="cpp__title">County profiles</h2>
      <p className="cpp__lede">
        One profile per county, resolved by the research worker — the same answer the router acts on when a run starts.
      </p>

      {error ? (
        <p role="alert" className="cpp__error">Could not load the county profiles: {error}</p>
      ) : null}
      {!data && !error ? <p className="cpp__loading">Loading county profiles…</p> : null}

      {data ? (
        <>
          <div className="cpp__tiers">
            {(['curated', 'vendor-default', 'fallback'] as Tier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(tier === t ? 'all' : t)}
                aria-pressed={tier === t}
                className={`cpp__tier${tier === t ? ' cpp__tier--on' : ''}`}
              >
                <div className="cpp__tier-head">
                  <Pill tier={t} />
                  <strong className="cpp__tier-count">{data.tiers[t]}</strong>
                </div>
                <div className="cpp__tier-hint">{TIER_HINT[t]}</div>
              </button>
            ))}
          </div>

          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a county by name or FIPS"
            aria-label="Filter counties"
            className="cpp__filter"
          />

          <div className="cpp__table-wrap">
            <table className="cpp__table">
              <thead>
                <tr>
                  <th>County</th>
                  <th>Tier</th>
                  <th>Appraisal district</th>
                  <th>Clerk</th>
                  <th>Parcel data</th>
                  <th>Plats</th>
                  <th>Deed bridge</th>
                  <th>Golden parcels</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const cad = site(p, 'appraisal');
                  const clerk = site(p, 'clerk');
                  const parcels = site(p, 'parcel_data');
                  const isOpen = open === p.key;
                  return (
                    <React.Fragment key={p.key}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : p.key)}
                        className={`cpp__row${isOpen ? ' cpp__row--open' : ''}`}
                        aria-expanded={isOpen}
                      >
                        <td className="cpp__county">{p.name} <span className="cpp__fips">{p.fips}</span></td>
                        <td><Pill tier={p.tier} /></td>
                        <td>{cad ? `${cad.vendor} · ${host(cad.url)}` : '—'}</td>
                        <td>{clerk ? `${clerk.vendor} · ${host(clerk.url)}` : '—'}</td>
                        <td>{parcels ? `layer${p.capabilities.surveyLayer ? ' + surveys' : ''}` : '—'}</td>
                        <td>{p.capabilities.freePlatRepository ? 'free repository' : clerk && clerk.vendor !== 'texasfile' ? 'clerk + TexasFile' : 'TexasFile'}</td>
                        <td>{p.capabilities.clerkBridge.replace('_', '/')}</td>
                        <td>{p.golden.length}</td>
                      </tr>
                      {isOpen ? (
                        <tr className="cpp__detail">
                          <td colSpan={8} className="cpp__detail-cell">
                            <p className="cpp__statement">{p.statement}</p>
                            <div className="cpp__cols">
                              <div>
                                <strong className="cpp__h">Sites</strong>
                                <ul className="cpp__list">
                                  {p.sites.map((s) => (
                                    <li key={`${s.role}-${s.url ?? s.vendor}`}>
                                      <strong>{s.role.replace('_', ' ')}</strong> — {s.vendor}
                                      {s.url ? <> · <a href={s.url} target="_blank" rel="noreferrer">{host(s.url)}</a></> : null}
                                      {s.verifiedAt ? <span className="cpp__verified"> · verified {s.verifiedAt}</span> : <span className="cpp__unverified"> · not driven</span>}
                                      {s.notes ? <div className="cpp__notes">{s.notes}</div> : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <strong className="cpp__h">What a run does here</strong>
                                <ol className="cpp__list">
                                  {p.recipe.map((line, i) => <li key={i}>{line}</li>)}
                                </ol>
                                {p.golden.length > 0 ? (
                                  <>
                                    <strong className="cpp__h cpp__h--spaced">Golden parcels</strong>
                                    <ul className="cpp__list">
                                      {p.golden.map((g) => <li key={g.propertyId}>{g.propertyId} — {g.address} <span className="cpp__verified">(verified {g.verifiedAt})</span></li>)}
                                    </ul>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="cpp__empty">No county matches that filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
