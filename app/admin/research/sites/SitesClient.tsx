'use client';
// app/admin/research/sites/SitesClient.tsx — register a county portal in one screen (§8.1, §8.5).
//
// The roadmap deferred this route as "substantial Next.js UI work … depends on §8.3 probe for the
// unknown-vendor path". The dependency turns out to be one-way: the KNOWN-vendor path — which is
// acceptance criterion (a), and which covers every county running Tyler, TrueAutomation, eSearch or
// PublicSearch — needs no probe at all. Detection is a regex against seeded fingerprints. Building
// the probe-dependent half first would have been building the harder, riskier, rarer case first.
//
// So this ships the path that works offline, and says plainly where the other one stops.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Plus, Globe } from 'lucide-react';

interface County { id: string; name: string; fips: string | null; metro_tier: number | null }
interface Vendor { id: string; key: string; display_name: string; access_method: string }
interface Adapter {
  id: string; county_id: string; vendor_id: string | null; site_type: string;
  base_url: string; access_method: string; status: string; last_verified_at: string | null;
}
interface Detection {
  best: { vendor: { id: string; key: string; display_name: string }; score: number } | null;
  matches: Array<{ vendor: { id: string; display_name: string }; score: number }>;
}

const SITE_TYPE_LABELS: Record<string, string> = {
  appraisal_cad: 'Appraisal district (CAD)',
  clerk_deeds: 'County clerk — deeds',
  plat_records: 'Plat records',
  gis_parcels: 'GIS parcel layer',
  legal_description: 'Legal descriptions',
  flood_fema: 'Flood / FEMA',
  survey_glo: 'GLO survey records',
  misc: 'Something else',
};

const STATUS_TONE: Record<string, string> = {
  active: 'ok', draft: 'muted', degraded: 'warn', broken: 'bad', quarantined: 'bad', retired: 'muted',
};

export default function SitesClient() {
  const [counties, setCounties] = useState<County[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [siteTypes, setSiteTypes] = useState<string[]>([]);
  const [load, setLoad] = useState<'loading' | 'ok' | 'failed'>('loading');

  // Wizard state.
  const [open, setOpen] = useState(false);
  const [countyId, setCountyId] = useState('');
  const [siteType, setSiteType] = useState('appraisal_cad');
  const [url, setUrl] = useState('');
  const [canary, setCanary] = useState('');
  const [detection, setDetection] = useState<Detection | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; warnings?: string[] } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/research/sites');
      if (!res.ok) { setLoad('failed'); return; }
      const d = await res.json();
      setCounties(d.counties ?? []);
      setVendors(d.vendors ?? []);
      setAdapters(d.adapters ?? []);
      setSiteTypes(d.siteTypes ?? []);
      setLoad('ok');
    } catch { setLoad('failed'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const countyName = useMemo(
    () => new Map(counties.map((c) => [c.id, c.name])),
    [counties],
  );
  const vendorName = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.display_name])),
    [vendors],
  );

  // Detection runs as the URL settles, not on a button. It is a local regex match against seeded
  // fingerprints — no request leaves for the county's server — so there is nothing to be careful
  // about, and the answer is more useful before the user has committed to anything.
  useEffect(() => {
    if (!url.trim() || !open) { setDetection(null); setMissing([]); return; }
    let cancelled = false;
    setDetecting(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ detect: url.trim() });
        if (countyId) params.set('county_id', countyId);
        if (siteType) params.set('site_type', siteType);
        const res = await fetch(`/api/admin/research/sites?${params}`);
        const d = await res.json();
        if (cancelled) return;
        setDetection(d.detection ?? null);
        setMissing(d.missing ?? []);
      } catch { /* detection is an assist; the form works without it */ }
      finally { if (!cancelled) setDetecting(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [url, countyId, siteType, open]);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/research/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county_id: countyId,
          site_type: siteType,
          base_url: url.trim(),
          vendor_id: detection?.best?.vendor.id ?? null,
          canary_query: canary.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setResult({ ok: false, message: d.error || 'Could not save.' }); return; }
      setResult({ ok: true, message: 'Registered as a draft adapter.', warnings: d.warnings ?? [] });
      setOpen(false);
      setUrl(''); setCanary(''); setDetection(null);
      void refresh();
    } catch {
      setResult({ ok: false, message: 'Could not reach the server.' });
    } finally { setSaving(false); }
  }

  const canSave = !!countyId && !!siteType && !!url.trim() && !saving;

  return (
    <div className="sites">
      <header className="sites__head">
        <div>
          <h1 className="sites__title">Data sources</h1>
          <p className="sites__sub">
            The county portals this firm can read. Registering one that runs on a vendor we already
            support takes a URL and a county — no code change.
          </p>
        </div>
        <button type="button" className="sites__add" onClick={() => setOpen((o) => !o)}>
          <Plus size={15} aria-hidden /> Register a portal
        </button>
      </header>

      {result ? (
        <div className={`sites__result sites__result--${result.ok ? 'ok' : 'bad'}`} role="status">
          <strong>{result.message}</strong>
          {result.warnings && result.warnings.length > 0 ? (
            <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <form
          className="sites__wizard"
          onSubmit={(e) => { e.preventDefault(); if (canSave) void save(); }}
        >
          <div className="sites__field">
            <label htmlFor="site-county">County</label>
            <select id="site-county" value={countyId} onChange={(e) => setCountyId(e.target.value)} required>
              <option value="">Choose a county…</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.metro_tier ? ` (tier ${c.metro_tier})` : ''}</option>
              ))}
            </select>
          </div>

          <div className="sites__field">
            <label htmlFor="site-type">What kind of records</label>
            <select id="site-type" value={siteType} onChange={(e) => setSiteType(e.target.value)}>
              {siteTypes.map((t) => <option key={t} value={t}>{SITE_TYPE_LABELS[t] ?? t}</option>)}
            </select>
          </div>

          <div className="sites__field sites__field--wide">
            <label htmlFor="site-url">Portal URL</label>
            <input
              id="site-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://esearch.example-cad.org/"
              required
            />
          </div>

          {/* The detection result is the whole point of the screen, so it is stated, not implied by a
              pre-filled field the user might not notice changed. */}
          {url.trim() ? (
            <div className="sites__detect">
              {detecting ? (
                <span className="sites__detect-line">Checking which vendor this is…</span>
              ) : detection?.best ? (
                <>
                  <span className="sites__detect-line sites__detect-line--ok">
                    <CheckCircle2 size={14} aria-hidden /> Detected <strong>{detection.best.vendor.display_name}</strong> —
                    reusing that template, so most of the configuration is already filled in.
                  </span>
                  {missing.length > 0 ? (
                    <span className="sites__detect-line sites__detect-line--warn">
                      <AlertTriangle size={14} aria-hidden /> Still needs this county&apos;s own values:{' '}
                      <code>{missing.join(', ')}</code>. You can fill them in after saving.
                    </span>
                  ) : null}
                  {detection.matches.length > 1 ? (
                    <span className="sites__detect-line">
                      Other possibilities: {detection.matches.slice(1).map((m) => m.vendor.display_name).join(', ')}.
                    </span>
                  ) : null}
                </>
              ) : (
                // Honest about the boundary. This is not a failure — it is the case the roadmap
                // deferred on purpose, because reading an unknown portal means driving a browser
                // against a government site and that is a decision, not a side effect of a form.
                <span className="sites__detect-line sites__detect-line--warn">
                  <AlertTriangle size={14} aria-hidden /> This portal doesn&apos;t match a vendor we
                  have a template for. You can still register it, but it will need its configuration
                  written by hand — the automatic site probe that would work it out is not switched on.
                </span>
              )}
            </div>
          ) : null}

          <div className="sites__field sites__field--wide">
            <label htmlFor="site-canary">
              A property that exists on this portal <span className="sites__optional">(strongly recommended)</span>
            </label>
            <input
              id="site-canary"
              type="text"
              value={canary}
              onChange={(e) => setCanary(e.target.value)}
              placeholder="A parcel number or address you know this portal returns"
            />
            <p className="sites__hint">
              This becomes the adapter&apos;s canary: the health checks search for it, and if the
              county changes their site the check notices because this stops coming back. Without one,
              a broken portal looks the same as a quiet one.
            </p>
          </div>

          <div className="sites__actions">
            <button type="submit" disabled={!canSave}>{saving ? 'Saving…' : 'Register'}</button>
            <button type="button" className="sites__cancel" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <p className="sites__hint">
            Saved as a <strong>draft</strong>. It becomes active once somebody confirms it returns the
            right data for a real property — the app will not claim coverage it has not demonstrated.
          </p>
        </form>
      ) : null}

      {load === 'loading' ? (
        <p className="sites__note">Loading…</p>
      ) : load === 'failed' ? (
        <p className="sites__note sites__note--bad">
          The registry could not be read. This is not the same as “no portals are registered”.
        </p>
      ) : adapters.length === 0 ? (
        <div className="sites__note">
          <Globe size={22} aria-hidden style={{ opacity: 0.5 }} />
          <p><strong>No portals registered yet.</strong></p>
          <p>Register the appraisal district for the county you work in most and the rest can follow.</p>
        </div>
      ) : (
        <table className="sites__table">
          <thead>
            <tr>
              <th>County</th><th>Records</th><th>Vendor</th><th>Status</th><th>Last checked</th>
            </tr>
          </thead>
          <tbody>
            {adapters.map((a) => (
              <tr key={a.id}>
                <td>{countyName.get(a.county_id) ?? '—'}</td>
                <td>{SITE_TYPE_LABELS[a.site_type] ?? a.site_type}</td>
                <td>{a.vendor_id ? vendorName.get(a.vendor_id) ?? '—' : <em>bespoke</em>}</td>
                <td><span className={`sites__status sites__status--${STATUS_TONE[a.status] ?? 'muted'}`}>{a.status}</span></td>
                <td>{a.last_verified_at ? new Date(a.last_verified_at).toLocaleDateString() : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
