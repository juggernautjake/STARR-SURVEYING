'use client';
// app/dnd/_ui/CampaignApprovalControl.tsx — the DM's per-character approval control on the campaign roster
// (owner 2026-07-18: "the DM must approve all character builds … view and approve, or reject and tell the
// player why and what to fix"). Shows the current approval state and, for the DM, an Approve button and a
// Request-changes button that prompts for the required reason — both POST the approval route. Self-contained:
// give it the campaign + character id and the current approval; it reports the new state back via onChange.
import { useState } from 'react';
import { approvalLabel, type CampaignApproval, type ApprovalStatus } from '@/lib/dnd/campaign-approval';

export default function CampaignApprovalControl({
  campaignId, characterId, approval, onChange,
}: {
  campaignId: string;
  characterId: string;
  approval: CampaignApproval | null;
  onChange?: (next: CampaignApproval) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const status: ApprovalStatus = approval?.status ?? 'pending';

  async function review(next: ApprovalStatus) {
    // A rejection needs a reason the player can act on — the route enforces this too.
    let reason = '';
    if (next === 'rejected') {
      reason = (typeof window !== 'undefined' ? window.prompt('What should the player change? (required)') : '') || '';
      if (!reason.trim()) return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/dnd/campaigns/${campaignId}/characters/${characterId}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, reason: reason.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? 'Could not save the review.'); return; }
      onChange?.(j.approval as CampaignApproval);
    } catch {
      setErr('Network error.');
    } finally {
      setBusy(false);
    }
  }

  const pillColor = status === 'approved' ? 'var(--hx-teal-1)' : status === 'rejected' ? 'var(--hx-danger, #e06a6a)' : 'var(--hx-muted)';
  const btn: React.CSSProperties = { fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--hx-line)', background: 'none', cursor: busy ? 'wait' : 'pointer' };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span title={approval?.reason ? `Reason: ${approval.reason}` : undefined} style={{ fontSize: 11, color: pillColor, cursor: approval?.reason ? 'help' : 'default' }}>
        {approvalLabel(approval)}
      </span>
      {status !== 'approved' && <button type="button" disabled={busy} onClick={() => review('approved')} style={{ ...btn, color: 'var(--hx-teal-1)' }}>Approve</button>}
      {status !== 'rejected' && <button type="button" disabled={busy} onClick={() => review('rejected')} style={{ ...btn, color: 'var(--hx-gold-2)' }}>Request changes</button>}
      {err && <span style={{ fontSize: 10.5, color: 'var(--hx-danger, #e06a6a)' }}>{err}</span>}
    </span>
  );
}
