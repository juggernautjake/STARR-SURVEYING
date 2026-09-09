'use client';
// app/admin/research/coverage/CountyProfilesPanel.tsx — one row per county: what we know and how a run there behaves.
//
// The three tiers (owner, 2026-09-09): CURATED — a person drove every site and a dedicated run exists;
// VENDOR-DEFAULT — the vendors are known and the generic run uses their shapes, but nobody has proven a
// parcel here; FALLBACK — the statewide aggregator only. The rows come from the worker's own resolver,
// so the tier a surveyor reads is the tier the router acts on.

import React, { useEffect, useMemo, useState } from 'react';

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

const TIER_CLASS: Record<Tier, string> = {
  curated: 'bg-green-100 text-green-800 ring-1 ring-green-200',
  'vendor-default': 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  fallback: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
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
    <section className="county-profiles" style={{ marginBottom: 28 }}>
      <h2 style={{ marginBottom: 4 }}>County profiles</h2>
      <p style={{ color: 'var(--theme-fg-secondary, #475569)', fontSize: 14, marginBottom: 12 }}>
        One profile per county, resolved by the research worker — the same answer the router acts on when a run starts.
      </p>

      {error ? (
        <p role="alert" style={{ color: '#B91C1C', fontSize: 14 }}>Could not load the county profiles: {error}</p>
      ) : null}
      {!data && !error ? <p style={{ fontSize: 14, color: '#64748B' }}>Loading county profiles…</p> : null}

      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            {(['curated', 'vendor-default', 'fallback'] as Tier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(tier === t ? 'all' : t)}
                aria-pressed={tier === t}
                style={{ textAlign: 'left', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', background: tier === t ? '#F8FAFC' : '#FFF', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_CLASS[t]}`}>{TIER_LABEL[t]}</span>
                  <strong style={{ fontSize: 20 }}>{data.tiers[t]}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{TIER_HINT[t]}</div>
              </button>
            ))}
          </div>

          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a county by name or FIPS"
            aria-label="Filter counties"
            style={{ width: '100%', maxWidth: 360, padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 14, marginBottom: 10 }}
          />

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>County</th>
                  <th style={{ padding: '8px 10px' }}>Tier</th>
                  <th style={{ padding: '8px 10px' }}>Appraisal district</th>
                  <th style={{ padding: '8px 10px' }}>Clerk</th>
                  <th style={{ padding: '8px 10px' }}>Parcel data</th>
                  <th style={{ padding: '8px 10px' }}>Plats</th>
                  <th style={{ padding: '8px 10px' }}>Deed bridge</th>
                  <th style={{ padding: '8px 10px' }}>Golden parcels</th>
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
                        style={{ borderTop: '1px solid #E2E8F0', cursor: 'pointer', background: isOpen ? '#F8FAFC' : undefined }}
                        aria-expanded={isOpen}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.name} <span style={{ color: '#94A3B8', fontWeight: 400 }}>{p.fips}</span></td>
                        <td style={{ padding: '8px 10px' }}><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_CLASS[p.tier]}`}>{TIER_LABEL[p.tier]}</span></td>
                        <td style={{ padding: '8px 10px' }}>{cad ? `${cad.vendor} · ${host(cad.url)}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{clerk ? `${clerk.vendor} · ${host(clerk.url)}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{parcels ? `layer${p.capabilities.surveyLayer ? ' + surveys' : ''}` : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{p.capabilities.freePlatRepository ? 'free repository' : clerk && clerk.vendor !== 'texasfile' ? 'clerk + TexasFile' : 'TexasFile'}</td>
                        <td style={{ padding: '8px 10px' }}>{p.capabilities.clerkBridge.replace('_', '/')}</td>
                        <td style={{ padding: '8px 10px' }}>{p.golden.length}</td>
                      </tr>
                      {isOpen ? (
                        <tr style={{ background: '#F8FAFC' }}>
                          <td colSpan={8} style={{ padding: '10px 14px 14px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: 13 }}>{p.statement}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                              <div>
                                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#64748B' }}>Sites</strong>
                                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                                  {p.sites.map((s) => (
                                    <li key={`${s.role}-${s.url ?? s.vendor}`}>
                                      <strong>{s.role.replace('_', ' ')}</strong> — {s.vendor}
                                      {s.url ? <> · <a href={s.url} target="_blank" rel="noreferrer">{host(s.url)}</a></> : null}
                                      {s.verifiedAt ? <span style={{ color: '#64748B' }}> · verified {s.verifiedAt}</span> : <span style={{ color: '#B45309' }}> · not driven</span>}
                                      {s.notes ? <div style={{ color: '#475569', fontSize: 12 }}>{s.notes}</div> : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#64748B' }}>What a run does here</strong>
                                <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                                  {p.recipe.map((line, i) => <li key={i}>{line}</li>)}
                                </ol>
                                {p.golden.length > 0 ? (
                                  <>
                                    <strong style={{ display: 'block', marginTop: 10, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#64748B' }}>Golden parcels</strong>
                                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                                      {p.golden.map((g) => <li key={g.propertyId}>{g.propertyId} — {g.address} <span style={{ color: '#64748B' }}>(verified {g.verifiedAt})</span></li>)}
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
                  <tr><td colSpan={8} style={{ padding: 12, color: '#64748B' }}>No county matches that filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
