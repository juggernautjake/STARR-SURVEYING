// app/dnd/_ui/CampaignCustomPolicyToggle.tsx — the DM's custom-content policy toggle (IG builder Slice 5).
// When off, the campaign is VANILLA-ONLY: a character with any non-DM-granted custom content can't be
// submitted to it. DM-only (the campaign PATCH route enforces the role).
'use client';

import { useState } from 'react';
import styles from './hextech.module.css';

export default function CampaignCustomPolicyToggle({ campaignId, initialAllow }: { campaignId: string; initialAllow: boolean }) {
  const [allow, setAllow] = useState(initialAllow);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function set(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allow_custom: next }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? 'Could not update.'); return; }
      setAllow(next);
      setMsg(next ? 'Custom content is allowed.' : 'Vanilla-only: custom builds can’t be submitted (DM grants still allowed).');
    } catch { setMsg('Network error.'); } finally { setBusy(false); }
  }

  return (
    <div className={styles.framedPanel} style={{ padding: '10px 14px', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Custom content policy</strong>
          <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Allow homebrew (custom) content in this campaign, or require vanilla-only builds.</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'wait' : 'pointer', fontSize: 13, color: 'var(--hx-text)' }}>
          <input type="checkbox" checked={allow} disabled={busy} onChange={(e) => set(e.target.checked)} />
          {allow ? 'Custom allowed' : 'Vanilla-only'}
        </label>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{msg}</div>}
    </div>
  );
}
