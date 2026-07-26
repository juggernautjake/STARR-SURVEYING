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
import { reviewSummary, type SlotException } from '@/lib/dnd/slots/entitlement';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected';
interface Tagged { kind: string; name: string; source: 'vanilla' | 'custom' | 'dm-granted'; grantedBy?: string | null }

const STATUS_LABEL: Record<Status, string> = { draft: 'Draft', submitted: 'Awaiting DM review', approved: 'Approved', rejected: 'Changes requested' };
const STATUS_COLOR: Record<Status, string> = { draft: 'var(--hx-muted)', submitted: 'var(--hx-gold-2)', approved: 'var(--hx-teal-1)', rejected: 'var(--hx-danger)' };

function Badge({ source }: { source: Tagged['source'] }) {
  const map = {
    vanilla: { t: 'VANILLA', c: 'var(--hx-teal-1)', b: 'rgba(10,200,185,0.12)' },
    // `--hx-danger-2`, not `--hx-danger`: this 9.5px chip sits on a dark hextech panel where the border-tuned
    // red measured 2.62:1 on every skin. The fill keeps the original red — only the TEXT is lightened.
    custom: { t: 'CUSTOM', c: 'var(--hx-danger-2, #ef8b85)', b: 'rgba(198,64,59,0.14)' },
    'dm-granted': { t: 'DM-GRANTED', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
  }[source];
  return <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: map.c, background: map.b, border: `1px solid ${map.c}`, borderRadius: 4, padding: '1px 5px' }}>{map.t}</span>;
}

/** The entitlement counterpart to `Badge` — deliberately its own chip, since these are different words for
 *  a different question. `EXPANDED` is the player's own call; `DM-GRANTED` is one the DM already made. */
function ExceptionBadge({ entitlement }: { entitlement: SlotException['entitlement'] }) {
  const map = {
    expanded: { t: 'OUT OF SLOT', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
    'dm-granted': { t: 'DM-GRANTED', c: 'var(--hx-gold-2)', b: 'rgba(200,170,110,0.14)' },
  }[entitlement];
  return <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: map.c, background: map.b, border: `1px solid ${map.c}`, borderRadius: 4, padding: '1px 5px' }}>{map.t}</span>;
}

export default function SheetApprovalPanel({
  characterId, status: initialStatus, reviewNotes, isDM, canWrite, elements, allowCustom, hasBlockingCustom,
  exceptions = [],
}: {
  characterId: string;
  status: Status;
  reviewNotes?: string | null;
  isDM: boolean;
  canWrite: boolean;
  elements: Tagged[];
  allowCustom: boolean;
  hasBlockingCustom: boolean;
  /** Picks taken through the escape hatch (slot plan S8c) — a DIFFERENT axis from `elements`.
   *
   *  `elements` answers "is this content in the book?"; this answers "was this character entitled to it
   *  here?". They cross, and the review needs both: a cross-class feat the DM approved is *vanilla content*
   *  the character was *not entitled to*, so it classifies as plain `vanilla` above and shows the DM
   *  NOTHING — which is precisely the case the escape hatch creates. */
  exceptions?: SlotException[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Tagged[]>([]);
  const [notes, setNotes] = useState('');
  const [showReject, setShowReject] = useState(false);

  // The exceptions the DM is ruling on, held locally so a decision shows immediately rather than waiting
  // for a page refresh — the server's response is authoritative and replaces this wholesale.
  const [exc, setExc] = useState<SlotException[]>(exceptions);
  const reviewState = reviewSummary(exc);
  const tiny: React.CSSProperties = { fontSize: 10.5, padding: '2px 7px' };

  /** Rule on ONE facet. A denial needs a reason — "no" without one leaves the player nothing to act on. */
  async function rule(name: string, decision: 'approved' | 'denied') {
    let note = '';
    if (decision === 'denied') {
      note = (prompt(`Why are you denying “${name}”? (shown to the player)`) ?? '').trim();
      if (!note) return;                 // cancelled, or no reason given — do nothing rather than deny blankly
    }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/exceptions/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, decision, note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error ?? 'Could not record the ruling.');
      else { setExc((j.exceptions ?? []) as SlotException[]); router.refresh(); }
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(false); }
  }

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
        {vanillaCount} vanilla · <span style={{ color: 'var(--hx-danger-2, #ef8b85)' }}>{custom.length} custom</span> · <span style={{ color: 'var(--hx-gold-2)' }}>{dmGranted.length} DM-granted</span>
        {allowCustom ? '' : ' · this campaign is vanilla-only'}
      </div>
      {/* The ENTITLEMENT axis, listed separately and labelled as such. Merging it into the list above would
          be worse than omitting it: these picks may be entirely book-legal content, so a "CUSTOM" badge
          would be wrong about them, and the DM's question here ("did they take something they shouldn't
          have?") is a different question from "is any of this homebrew?". */}
      {exc.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12.5, color: 'var(--hx-gold-2)', fontWeight: 700 }}>
            {exc.length} taken outside the rules
            {/* What is left to look at. "3 exceptions" with no state tells a DM nothing about whether
                anyone has already been through them. */}
            {reviewState.pending > 0
              ? <span style={{ fontWeight: 400, color: 'var(--hx-muted)' }}> · {reviewState.pending} awaiting your ruling</span>
              : <span style={{ fontWeight: 400, color: 'var(--hx-teal-1)' }}> · all reviewed</span>}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {exc.map((e, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 12.5, color: 'var(--hx-text)', flexWrap: 'wrap' }}>
                <ExceptionBadge entitlement={e.entitlement} />
                <span>{e.name}</span>
                {typeof e.level === 'number' && e.level > 0 && <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>level {e.level}</span>}
                {/* The RULES' own objection, verbatim. Without it the DM sees a name and has to go and work
                    out for themselves what was wrong with it. */}
                {e.reason && <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>— {e.reason}</span>}

                {/* The RULING. Shown to everyone (a player must see a denial and its reason, or it explains
                    nothing), actionable only by the DM. Absent is NOT "approved" — it reads as awaiting. */}
                {e.review ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: e.review.decision === 'approved' ? 'var(--hx-teal-1)' : 'var(--hx-danger-2, #ef8b85)' }}>
                    {e.review.decision === 'approved' ? '✓ Approved' : '✕ Denied'}
                    {e.review.note ? <span style={{ fontWeight: 400, color: 'var(--hx-muted)' }}> — {e.review.note}</span> : null}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>awaiting review</span>
                )}
                {isDM && (
                  <span style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
                    <button type="button" className={styles.hexBtn} disabled={busy} style={tiny} onClick={() => void rule(e.name, 'approved')}>✓ Approve</button>
                    <button type="button" className={styles.hexBtn} disabled={busy} style={tiny} onClick={() => void rule(e.name, 'denied')}>✕ Deny</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
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
