'use client';
// app/dnd/_ui/PromoteCampaignVersionButton.tsx — the creator's "replace my original with the in-campaign
// version" control (owner 2026-07-18: "if players want to, they can update the original character sheet to
// actually be replaced by an in-campaign version — make this an option"). Shown ONLY to the character's creator,
// and only when the campaign holds its own edited copy (an override the DM forked). POSTs the promote route,
// which writes the campaign copy over the original then clears the override so the two re-sync.
import { useState } from 'react';

export default function PromoteCampaignVersionButton({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function promote() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/dnd/campaigns/${campaignId}/characters/${characterId}/promote`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? 'Could not promote.'); setConfirming(false); return; }
      setMsg('Done — your original now matches the in-campaign version.');
      setConfirming(false);
      // The sheet is server-rendered from the original; reload so the promoted data shows.
      if (typeof window !== 'undefined') window.location.reload();
    } catch {
      setMsg('Network error.'); setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = { margin: '10px 0', padding: '10px 12px', border: '1px solid var(--hx-line, #2a3b47)', borderRadius: 6, background: 'rgba(200,170,110,0.06)' };
  const btn: React.CSSProperties = { padding: '5px 12px', fontSize: 12, cursor: busy ? 'wait' : 'pointer', border: '1px solid var(--hx-gold-1, #c89b3c)', borderRadius: 5, background: 'rgba(200,170,110,0.12)', color: 'var(--hx-gold-3, #f0e6d2)' };
  const ghost: React.CSSProperties = { ...btn, borderColor: 'var(--hx-line, #2a3b47)', background: 'none', color: 'var(--hx-muted, #8aa0ab)' };

  return (
    <div style={box}>
      <div style={{ fontSize: 12, color: 'var(--hx-muted, #8aa0ab)', marginBottom: 8 }}>
        Your DM has edited the in-campaign copy of this character. You can replace your original sheet with that
        version — this overwrites your original and can’t be undone.
      </div>
      {!confirming ? (
        <button type="button" style={btn} disabled={busy} onClick={() => setConfirming(true)}>Replace my original with the campaign version…</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--hx-gold-3, #f0e6d2)' }}>Overwrite your original?</span>
          <button type="button" style={btn} disabled={busy} onClick={promote}>Yes, replace it</button>
          <button type="button" style={ghost} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 11, color: 'var(--hx-muted, #8aa0ab)', marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
