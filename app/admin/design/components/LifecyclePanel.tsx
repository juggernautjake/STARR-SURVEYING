'use client';
// app/admin/design/components/LifecyclePanel.tsx — what this design IS, and what it is related to.
//
// Phases S3, B3, K2 and K3 of
// docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"Once it has been saved, we will choose to make it active, or leave it as an alternative,
// or a theme linked to the active page or an alternative page, or it will be saved as a draft."*
//
// ── EVERY CONTROL SAYS WHAT IT DOES BEFORE YOU PRESS IT ─────────────────────────────────────────
//
// Four of the actions here change something outside this design: activating demotes whatever held
// the page, linking joins a family, re-theming rewrites the token map. So each one carries its
// consequence in the same breath — `lifecycle.ts` already returns those sentences, and reading them
// here rather than writing new ones is what keeps the UI and the API telling the same story.
//
// ── WHY RE-THEMING IS ITS OWN BUTTON AND NOT A SAVE ─────────────────────────────────────────────
//
// *"A theme sibling shares elements, not copies of them. Otherwise 'change the colours' becomes
// 'rebuild the page'."* The re-theme endpoint reads the elements from the row and writes them back
// untouched, changing only the theme — so the promise holds even if this component is buggy, which
// is the right place for a guarantee like that to live.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X, GitBranch, Palette as PaletteIcon, Link2, Unlink, ExternalLink } from 'lucide-react';
import { STATUS_RULES, statusRule, activationEffect, type DesignStatus } from '@/lib/design/lifecycle';
import { BUILT_IN_THEMES, type Theme } from '@/lib/design/theme';
import type { DesignSummary } from '@/lib/design/client';
import type { DesignDocument } from '@/lib/design/document';

interface Relations {
  design: DesignSummary;
  parent: DesignSummary | null;
  children: DesignSummary[];
  themeSiblings: DesignSummary[];
  routeSiblings: DesignSummary[];
}

interface Props {
  doc: DesignDocument;
  onClose: () => void;
  /** Told when the status changes, so the toolbar chip and the read-only banner update. */
  onStatus: (status: string) => void;
  /** Told when the theme changes underneath, so the artboard repaints. */
  onTheme: (theme: Theme | null) => void;
}

export default function LifecyclePanel({ doc, onClose, onStatus, onTheme }: Props) {
  const [relations, setRelations] = useState<Relations | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rule = statusRule(doc.status);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/design/${doc.id}/relations`, { cache: 'no-store' });
    if (res.ok) setRelations(await res.json());
  }, [doc.id]);

  useEffect(() => { void load(); }, [load]);

  const currentActive = relations?.routeSiblings.find((d) => d.status === 'active')
    ?? relations?.themeSiblings.find((d) => d.status === 'active')
    ?? null;

  async function setStatus(next: DesignStatus) {
    setBusy(true);
    const res = await fetch(`/api/admin/design/${doc.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setMessage(body?.error ?? 'Could not change the status.'); return; }
    onStatus(next);
    setMessage(body?.demoted
      ? `Now ${next}. The design that held this page is an alternative — nothing was lost.`
      : `Now ${next}.`);
    await load();
  }

  async function cloneAs(asThemeSibling: boolean) {
    setBusy(true);
    const res = await fetch(`/api/admin/design/${doc.id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asThemeSibling }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !body?.design) { setMessage(body?.error ?? 'Could not clone that.'); return; }
    window.location.href = `/admin/design/${body.design.id}`;
  }

  async function link(groupWith: string | null) {
    setBusy(true);
    const res = await fetch(`/api/admin/design/${doc.id}/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupWith }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setMessage(body?.error ?? 'Could not link those.'); return; }
    setMessage(groupWith ? 'Linked — these are now the same layout in different themes.' : 'Unlinked.');
    await load();
  }

  async function retheme(theme: Theme | null) {
    setBusy(true);
    const res = await fetch(`/api/admin/design/${doc.id}/relations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setMessage(body?.error ?? 'Could not re-theme that.'); return; }
    onTheme(theme);
    setMessage(theme
      ? `Wearing “${theme.name}”. Not one element moved — a re-theme rewrites the colours and nothing else.`
      : 'Theme removed.');
  }

  return (
    <section className="dsx__life" aria-label="Version and themes">
      <header className="dsx__life-head">
        <strong>Version &amp; themes</strong>
        <span className={`dsx__life-chip is-${rule.tone}`}>{rule.label}</span>
        <button className="dsx__tool" onClick={onClose} aria-label="Close"><X size={14} aria-hidden /></button>
      </header>

      {message && <p className="dsx__life-msg" role="status">{message}</p>}

      <p className="dsx__life-meaning">{rule.meaning}</p>

      {/* ── Status ───────────────────────────────────────────────────────────────────────────── */}
      <div className="dsx__life-block">
        <h4>Make this…</h4>
        <div className="dsx__life-actions">
          {rule.canBecome.map((next) => {
            const target = STATUS_RULES[next];
            const effect = next === 'active'
              ? activationEffect({ id: doc.id, name: doc.name }, currentActive ? { id: currentActive.id, name: currentActive.name } : null)
              : null;
            return (
              <button
                key={next}
                className={`dsx__life-btn is-${target.tone}`}
                onClick={() => void setStatus(next)}
                disabled={busy}
              >
                <strong>{target.label}</strong>
                {/* The consequence, in the control. An "Activate" that quietly demotes somebody
                  * else's choice is the surprise that makes people stop trusting a tool. */}
                <span>{effect ? effect.summary : target.meaning}</span>
              </button>
            );
          })}
          {rule.canBecome.length === 0 && <p className="dsx__life-none">Nothing to change from here.</p>}
        </div>
        {doc.route && (
          <p className="dsx__life-hint">
            <Link href={`/admin/design/serve?route=${encodeURIComponent(doc.route)}`}>
              See what is served for {doc.route} <ExternalLink size={12} aria-hidden />
            </Link>
          </p>
        )}
      </div>

      {/* ── Branching ────────────────────────────────────────────────────────────────────────── */}
      <div className="dsx__life-block">
        <h4><GitBranch size={14} aria-hidden /> Branch this design</h4>
        <div className="dsx__life-actions">
          <button className="dsx__life-btn" onClick={() => void cloneAs(false)} disabled={busy}>
            <strong>A different layout</strong>
            <span>A new draft of this page, starting from these elements. Its own lineage.</span>
          </button>
          <button className="dsx__life-btn" onClick={() => void cloneAs(true)} disabled={busy}>
            <strong>The same layout, another theme</strong>
            <span>Joins this design’s theme family, so settings can offer both while it is active.</span>
          </button>
        </div>
      </div>

      {/* ── Re-theme in place (K2) ───────────────────────────────────────────────────────────── */}
      <div className="dsx__life-block">
        <h4><PaletteIcon size={14} aria-hidden /> Wear a different theme</h4>
        <p className="dsx__life-note">
          Changes the colours of this design and nothing else — no element is moved, replaced or
          rebuilt.
        </p>
        <div className="dsx__life-themes">
          {BUILT_IN_THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`dsx__life-theme${doc.theme?.id === theme.id ? ' is-on' : ''}`}
              onClick={() => void retheme(theme)}
              disabled={busy}
              title={theme.name}
            >
              {/* The swatch shows the theme's OWN colours, which are data rather than styling — so
                * they are inline, and the fallbacks are not. A theme that does not set a token gets
                * no inline value at all and the stylesheet's default shows through: an inline hex
                * fallback here would be a colour no token, media query or contrast audit can reach,
                * which is exactly what the inline-hex ratchet exists to prevent. */}
              <span className="dsx__life-swatch" style={{
                background: theme.tokens['--theme-bg-page'] || undefined,
                borderColor: theme.tokens['--theme-border'] || undefined,
              }}>
                <em style={{ background: theme.tokens['--theme-accent'] || undefined }} />
              </span>
              {theme.name}
            </button>
          ))}
          <button className="dsx__life-theme" onClick={() => void retheme(null)} disabled={busy}>
            No theme
          </button>
        </div>
      </div>

      {/* ── The family, and the lineage ──────────────────────────────────────────────────────── */}
      <div className="dsx__life-block">
        <h4><Link2 size={14} aria-hidden /> Themes of this layout</h4>
        {relations?.themeSiblings.length ? (
          <ul className="dsx__life-list">
            {relations.themeSiblings.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/design/${s.id}`}>{s.name}</Link>
                <span className={`dsx__life-chip is-${statusRule(s.status).tone}`}>{statusRule(s.status).label}</span>
                {s.themeId && <em>{s.themeId}</em>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dsx__life-none">
            This design is not part of a theme family. Branch it as “the same layout, another theme”,
            or link an existing design below.
          </p>
        )}

        {doc.themeGroup && (
          <button className="dsx__tool" onClick={() => void link(null)} disabled={busy}>
            <Unlink size={13} aria-hidden /> Leave this family
          </button>
        )}

        {!!relations?.routeSiblings.length && (
          <label className="dsx__life-link">
            <span>Link an existing design into this family</span>
            <select
              value=""
              onChange={(e) => e.target.value && void link(e.target.value)}
              disabled={busy}
              aria-label="Link a design into this theme family"
            >
              <option value="">Choose a design for this page…</option>
              {relations.routeSiblings
                .filter((s) => s.status !== 'default')
                .map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
            </select>
          </label>
        )}
      </div>

      {/* ── Where this came from (B3) ────────────────────────────────────────────────────────── */}
      <div className="dsx__life-block">
        <h4><GitBranch size={14} aria-hidden /> Lineage</h4>
        <ul className="dsx__life-list">
          {relations?.parent
            ? <li><em>branched from</em> <Link href={`/admin/design/${relations.parent.id}`}>{relations.parent.name}</Link></li>
            : <li className="dsx__life-none">Not branched from anything — this one was started from scratch or traced.</li>}
          {relations?.children.map((c) => (
            <li key={c.id}>
              <em>branched into</em> <Link href={`/admin/design/${c.id}`}>{c.name}</Link>
              <span className={`dsx__life-chip is-${statusRule(c.status).tone}`}>{statusRule(c.status).label}</span>
            </li>
          ))}
        </ul>

        {!!relations?.routeSiblings.length && (
          <>
            <h4>Everything else for {doc.route}</h4>
            <ul className="dsx__life-list">
              {relations.routeSiblings.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/design/${s.id}`}>{s.name}</Link>
                  <span className={`dsx__life-chip is-${statusRule(s.status).tone}`}>{statusRule(s.status).label}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
