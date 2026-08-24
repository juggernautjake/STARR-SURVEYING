'use client';
// app/admin/design/versions/VersionsBoard.tsx — build a whole version of the site, then publish it.
//
// Phase V of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"eventually we can create full alternative versions of the website… so that once we built
// out a full version of the website, we can make that one active and have all of the pages served
// at once."*
//
// ── THE PLAN IS THE SCREEN ──────────────────────────────────────────────────────────────────────
//
// Publishing changes the design of record for every page in the version. The interface is therefore
// built around the preview rather than the button: what will change, what will not, and — the row
// that matters — what this version wants to change but will not, because somebody made a deliberate
// choice for that page more recently. Those rows carry a checkbox, because a rule with no override
// is a rule people get around by deleting things.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers3, Plus, Rocket, AlertTriangle, Check, Minus, Trash2 } from 'lucide-react';
import type { SiteVersion, SiteVersionMember, PublishPlan, PlanRow } from '@/lib/design/site-versions';
import type { DesignSummary } from '@/lib/design/client';
import '../DesignStudio.css';

interface Detail {
  version: SiteVersion;
  members: SiteVersionMember[];
  plan: PublishPlan;
}

const OUTCOME_ICON: Record<PlanRow['outcome'], typeof Check> = {
  activate: Rocket,
  'already-active': Check,
  conflict: AlertTriangle,
  'missing-design': Minus,
};

export default function VersionsBoard() {
  const [versions, setVersions] = useState<SiteVersion[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [name, setName] = useState('');
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    const res = await fetch('/api/admin/design/versions', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    setVersions(body?.versions ?? []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/design/versions?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.ok) { setDetail(body as Detail); setOverrides(new Set()); }
    else setMessage(body?.error ?? 'Could not open that version.');
  }, []);

  useEffect(() => { void loadVersions(); }, [loadVersions]);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    void loadDetail(openId);
    void fetch('/api/admin/design', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setDesigns((b.designs ?? []).filter((d: DesignSummary) => d.route && d.status !== 'default')))
      .catch(() => {});
  }, [openId, loadDetail]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch('/api/admin/design/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) { setName(''); await loadVersions(); }
    else setMessage((await res.json().catch(() => null))?.error ?? 'Could not create that.');
  }

  async function member(versionId: string, designId: string, action: 'add' | 'remove') {
    setBusy(true);
    const res = await fetch('/api/admin/design/versions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, designId, action }),
    });
    setBusy(false);
    if (!res.ok) setMessage((await res.json().catch(() => null))?.error ?? 'Could not change that.');
    await loadDetail(versionId);
    await loadVersions();
  }

  async function publish(versionId: string) {
    setBusy(true);
    const res = await fetch('/api/admin/design/versions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId, overrides: [...overrides] }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setMessage(body?.error ?? 'Could not publish that.'); return; }
    setMessage(
      `Published: ${body.activated.length} page${body.activated.length === 1 ? '' : 's'} now served by this version`
      + (body.skipped.length ? ` · ${body.skipped.length} left as they were` : ''),
    );
    await loadDetail(versionId);
    await loadVersions();
  }

  return (
    <div className="dsx-vers">
      <header className="dsx-vers__head">
        <div>
          <h1><Layers3 size={20} aria-hidden /> Site versions</h1>
          <p>
            A named set of designs across many pages, with a theme. Publishing one makes every design
            in it the record for its page — in a single action, with a preview first.
          </p>
        </div>
        <Link className="admin-btn admin-btn--secondary" href="/admin/design">Back to designs</Link>
      </header>

      {message && <p className="dsx-vers__msg" role="status">{message}</p>}

      <section className="dsx-vers__new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Version name — “2026 refresh”, “dense admin”"
          aria-label="New version name"
        />
        <button className="admin-btn admin-btn--primary" onClick={() => void create()} disabled={!name.trim() || busy}>
          <Plus size={15} aria-hidden /> New version
        </button>
      </section>

      {!versions && <p>Loading…</p>}
      {versions?.length === 0 && (
        <div className="admin-empty">
          <div className="admin-empty__icon">🗂️</div>
          <div className="admin-empty__title">No site versions yet</div>
          <div className="admin-empty__desc">
            Make one, add the designs you want served together, and publish when it is complete
            enough. Coverage tells you how much of the site it accounts for.
          </div>
        </div>
      )}

      <ul className="dsx-vers__list">
        {(versions ?? []).map((v) => (
          <li key={v.id} className={`dsx-vers__item is-${v.status}`}>
            <button className="dsx-vers__row" onClick={() => setOpenId(openId === v.id ? null : v.id)} aria-expanded={openId === v.id}>
              <strong>{v.name}</strong>
              <span className={`dsx-vers__status is-${v.status}`}>{v.status}</span>
              <span className="dsx-vers__count">{v.members} page{v.members === 1 ? '' : 's'}</span>
              {/* Coverage is scoped to the AREAS the version touches, so "100%" means "everything
                * it set out to cover" rather than "the whole product". The breakdown says which. */}
              <span className="dsx-vers__cov" title={v.coverage.areas.map((a) => `${a.area}: ${a.covered}/${a.inScope}`).join(' · ')}>
                {v.coverage.percent}% of {v.coverage.inScope} pages in scope
              </span>
              {v.publishedAt && <span className="dsx-vers__when">published {new Date(v.publishedAt).toLocaleDateString()}</span>}
            </button>

            {openId === v.id && detail && (
              <div className="dsx-vers__detail">
                {/* ── What publishing would do ──────────────────────────────────────────────── */}
                <div className="dsx-vers__plan">
                  <h3>
                    Publishing would activate {detail.plan.willActivate} page
                    {detail.plan.willActivate === 1 ? '' : 's'}
                    {detail.plan.unchanged > 0 && <> · {detail.plan.unchanged} already served by this version</>}
                    {detail.plan.conflicts > 0 && <> · <em className="is-warn">{detail.plan.conflicts} kept as they are</em></>}
                  </h3>
                  <p className="dsx-vers__untouched">
                    {detail.plan.untouched} page{detail.plan.untouched === 1 ? '' : 's'} in scope are not
                    in this version and would not change.
                  </p>

                  <ul className="dsx-vers__rows">
                    {detail.plan.rows.map((row) => {
                      const Icon = OUTCOME_ICON[row.outcome];
                      return (
                        <li key={row.route} className={`dsx-vers__prow is-${row.outcome}`}>
                          <Icon size={14} aria-hidden />
                          <code>{row.route}</code>
                          <Link href={`/admin/design/${row.designId}`}>{row.designName}</Link>
                          <span>{row.note}</span>
                          {row.outcome === 'conflict' && (
                            <label className="dsx-vers__override">
                              <input
                                type="checkbox"
                                checked={overrides.has(row.route)}
                                onChange={(e) => setOverrides((s) => {
                                  const next = new Set(s);
                                  if (e.target.checked) next.add(row.route); else next.delete(row.route);
                                  return next;
                                })}
                              />
                              take it anyway
                            </label>
                          )}
                          <button
                            className="dsx-vers__del"
                            title="Remove from this version"
                            onClick={() => void member(v.id, row.designId, 'remove')}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                    {detail.plan.rows.length === 0 && <li className="dsx-vers__prow">Nothing in this version yet.</li>}
                  </ul>

                  <button
                    className="admin-btn admin-btn--primary"
                    onClick={() => void publish(v.id)}
                    disabled={busy || detail.plan.rows.length === 0}
                  >
                    <Rocket size={15} aria-hidden /> Publish this version
                  </button>
                </div>

                {/* ── Add a design ──────────────────────────────────────────────────────────── */}
                <div className="dsx-vers__add">
                  <h3>Add a design</h3>
                  <select
                    value=""
                    onChange={(e) => e.target.value && void member(v.id, e.target.value, 'add')}
                    aria-label="Add a design to this version"
                  >
                    <option value="">Choose a design…</option>
                    {designs
                      .filter((d) => !detail.members.some((m) => m.designId === d.id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.route} — {d.name} ({d.status})</option>
                      ))}
                  </select>
                  <p className="dsx-vers__hint">
                    Defaults are not offered: a default is a trace of what is already served, so
                    “activating” one would publish a description of the present as a plan.
                  </p>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
