// app/dnd/_ui/SheetApprovalPanel.tsx — the character submission/approval panel (IG builder Slice 5).
//
// Shows the custom-vs-vanilla content summary (both DM and player see what's custom), the submission
// status, and the right controls: the owner submits to the DM (blocked, with a clear reason, when a
// vanilla-only campaign rejects their custom content); the DM approves or rejects with notes. A rejected
// character shows the DM's notes to the player.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected';
interface Tagged { kind: string; name: string; source: 'vanilla' | 'custom' | 'dm-granted'; grantedBy?: string | null }

const STATUS_LABEL: Record<Status, string> = { draft: 'Draft', submitted: 'Awaiting DM review', approved: 'Approved', rejected: 'Changes requested' };
const STATUS_COLOR: Record<Status, string> = { draft: 'var(--hx-muted)', submitted: 'var(--hx-gold-2)', approved: 'var(--hx-teal-1)', rejected: 'var(--hx-danger)' };

function Badge({ source }: { source: Tagged['source'] }) {
  const map = {
    vanilla: { t: 'VANILLA', c: 'var(--hx-teal-1)', b: 'rgba(10,200,185,0.12)' },
    custom: { t: 'CUSTOM', c: 'var(--hx-danger)', b: 'rgba(198,64,59,0.14)' },
    'dm-granted': { t: 'DM-GRANTED', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
  }[source];
  return <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: map.c, background: map.b, border: `1px solid ${map.c}`, borderRadius: 4, padding: '1px 5px' }}>{map.t}</span>;
}

export default function SheetApprovalPanel({
  characterId, status: initialStatus, reviewNotes, isDM, canWrite, elements, allowCustom, hasBlockingCustom,
}: {
  characterId: string;
  status: Status;
  reviewNotes?: string | null;
  isDM: boolean;
  canWrite: boolean;
  elements: Tagged[];
  allowCustom: boolean;
  hasBlockingCustom: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Tagged[]>([]);
  const [notes, setNotes] = useState('');
  const [showReject, setShowReject] = useState(false);

  const custom = elements.filter((e) => e.source === 'custom');
  const dmGranted = elements.filter((e) => e.source === 'dm-granted');
  const vanillaCount = elements.length - custom.length - dmGranted.length;

  async function submit() {
    setBusy(true); setMsg(null); setBlocking([]);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/submit`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { setMsg(j.error ?? 'This campaign does not allow custom content.'); setBlocking(j.blocking ?? []); }
      else if (!r.ok) setMsg(j.error ?? 'Could not submit.');
      else { setStatus('submitted'); setMsg('Submitted to the DM for approval.'); router.refresh(); }
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }
  async function review(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !notes.trim()) { setMsg('Add a note so the player knows what to change.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, notes }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error ?? 'Could not submit the review.');
      else { setStatus(decision === 'approve' ? 'approved' : 'rejected'); router.refresh(); }
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '12px 14px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Approval &amp; content</strong>
        <span style={{ fontSize: 12, color: STATUS_COLOR[status], fontWeight: 600 }}>● {STATUS_LABEL[status]}</span>
      </div>

      {/* Content summary — both DM and player see what's vanilla vs custom. */}
      <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
        {vanillaCount} vanilla · <span style={{ color: 'var(--hx-danger)' }}>{custom.length} custom</span> · <span style={{ color: 'var(--hx-gold-2)' }}>{dmGranted.length} DM-granted</span>
        {allowCustom ? '' : ' · this campaign is vanilla-only'}
      </div>
      {(custom.length > 0 || dmGranted.length > 0) && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {[...custom, ...dmGranted].map((e, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--hx-text)' }}>
              <Badge source={e.source} /> <span style={{ opacity: 0.7 }}>{e.kind}:</span> {e.name}
              {e.grantedBy ? <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>(by DM)</span> : null}
            </li>
          ))}
        </ul>
      )}

      {/* Player: rejection notes + submit. */}
      {status === 'rejected' && reviewNotes && (
        <div style={{ padding: '9px 11px', border: '1px solid var(--hx-danger)', background: 'rgba(198,64,59,0.08)', borderRadius: 6, fontSize: 12.5 }}>
          <strong style={{ color: 'var(--hx-danger)' }}>The DM requested changes:</strong>
          <div style={{ marginTop: 3, color: 'var(--hx-text)', whiteSpace: 'pre-wrap' }}>{reviewNotes}</div>
        </div>
      )}
      {canWrite && !isDM && (status === 'draft' || status === 'rejected') && (
        <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={submit} style={{ justifySelf: 'start' }}>
          {busy ? 'Submitting…' : 'Submit to DM for approval'}
        </button>
      )}

      {/* DM: review a submitted character. */}
      {isDM && status === 'submitted' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {showReject && (
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Why are you requesting changes? (shown to the player)"
              style={{ padding: '8px 10px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy} onClick={() => review('approve')}>✓ Approve</button>
            <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => (showReject ? review('reject') : setShowReject(true))}>
              {showReject ? 'Send rejection' : '✕ Request changes'}
            </button>
          </div>
        </div>
      )}

      {blocking.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--hx-danger)' }}>
          Blocked by: {blocking.map((b) => b.name).join(', ')}. Remove them or ask the DM to grant them.
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</div>}
    </div>
  );
}
