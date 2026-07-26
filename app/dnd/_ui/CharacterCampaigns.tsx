'use client';
// CharacterCampaigns — take this character into or out of a campaign, from the character's own page (S11).
//
// Owner, 2026-07-26: "make sure there is a clear and easy way to take character into and out of a campaign".
// Before this, both directions were reachable only from somewhere else: leaving from the DM's roster in
// `CampaignHub`, joining from `AddToDemoButton` (hard-wired to the demo campaign). A player on their own
// character page could not see which campaigns it was in, let alone change that.
//
// It calls the EXISTING endpoints rather than new ones, so authorization stays in one place, and it decides
// what to offer with `lib/dnd/campaign-membership.ts`, the same module the GET route uses — a button that
// appears where the server refuses reads as a broken app, not as a permission.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';
import { canJoinCampaign, canLeaveCampaign, membershipSummary, type CampaignRef, type MembershipView } from '@/lib/dnd/campaign-membership';

export default function CharacterCampaigns({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [view, setView] = useState<MembershipView | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/campaigns`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not load campaigns.'); return; }
      setView({ member: j.member ?? [], joinable: j.joinable ?? [] });
      setIsOwner(!!j.isOwner);
    } catch { setMsg('Network error.'); }
  }, [characterId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, url: string, method: 'POST' | 'DELETE', body?: unknown) => {
    setBusy(label); setMsg(null);
    try {
      const r = await fetch(url, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'That did not work.'); return; }
      await load();
      // The page shows campaign-derived things (DM settings, approval state), so refresh rather than
      // leaving a sheet that disagrees with the panel above it.
      router.refresh();
    } catch { setMsg('Network error.'); } finally { setBusy(null); }
  };

  const leave = (c: CampaignRef) => {
    if (!confirm(`Take this character out of ${c.name}? It stays yours — it just leaves that roster.`)) return;
    void act(`leave-${c.id}`, `/api/dnd/campaigns/${c.id}/characters/${characterId}`, 'DELETE');
  };
  const join = (c: CampaignRef) =>
    void act(`join-${c.id}`, `/api/dnd/campaigns/${c.id}/join-character`, 'POST', { characterId });

  if (!view) return null;

  return (
    <section className={styles.framedPanel} style={{ padding: '12px 14px', margin: '10px 0' }}>
      <div className={styles.framedPanelTop} />
      <h3 className={styles.panelTitle} style={{ marginTop: 0 }}>Campaigns</h3>
      <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: '2px 0 10px', lineHeight: 1.5 }}>
        {membershipSummary(view)}
      </p>

      {view.member.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: view.joinable.length ? 12 : 0 }}>
          {view.member.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--hx-text)' }}>
                {c.name}
                {c.role === 'dm' && <span style={{ fontSize: 10.5, color: 'var(--hx-teal-1)', marginLeft: 6 }}>YOU DM</span>}
                {/* A roster the caller isn't on. Said out loud rather than shown as a nameless row. */}
                {c.role === null && <span style={{ fontSize: 10.5, color: 'var(--hx-muted)', marginLeft: 6 }}>you are not in this one</span>}
              </span>
              {canLeaveCampaign({ isOwner, role: c.role }) && (
                <button className="btn tiny" disabled={busy === `leave-${c.id}`} onClick={() => leave(c)}>
                  {busy === `leave-${c.id}` ? '…' : 'Take out'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {view.joinable.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-muted)' }}>
            Add to a campaign
          </div>
          {view.joinable.filter((c) => canJoinCampaign({ isOwner, role: c.role })).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--hx-text)' }}>{c.name}</span>
              <button className="btn tiny" disabled={busy === `join-${c.id}`} onClick={() => join(c)}>
                {busy === `join-${c.id}` ? '…' : 'Take in'}
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && <div style={{ fontSize: 12, color: 'var(--hx-danger)', marginTop: 8 }}>{msg}</div>}
    </section>
  );
}
