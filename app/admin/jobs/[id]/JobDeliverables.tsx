// app/admin/jobs/[id]/JobDeliverables.tsx — slice J2 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner: *"tracking throughout the rest of the job phases for deliverables and payment and all of that."*
//
// ── THIS IS A PANEL, NOT A SUBSYSTEM ────────────────────────────────────────────────────────────
//
// `/api/admin/deliverables` has been complete since it was written: revisions that supersede rather
// than overwrite, sealing that demands the surveyor's name AND registration number in the same
// statement, issuing that demands a recipient, and a `received_at` kept separate because sending and
// arriving are different events. Its only consumer was the public client portal.
//
// So the firm could show a client a list of deliverables and had no way to put anything on it. The
// portal rendered empty forever and the last third of every job — the part the firm is legally on the
// hook for — was untracked. Every rule below is the API's; this file only makes them reachable.
//
// ── WHY THE FORMS SAY WHY ───────────────────────────────────────────────────────────────────────
//
// The API rejects a seal without a registration number and an issue without a recipient, with real
// sentences. A form that lets somebody fill it in and then shows them that sentence has taught them
// nothing except that the software is annoying. The requirement is stated where the field is, so the
// rule reads as a reason rather than a rejection.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, Stamp, Send, PackageCheck, Plus, Loader2 } from 'lucide-react';

export interface Deliverable {
  id: string;
  job_id: string;
  name: string;
  kind: string;
  revision: number;
  state: 'draft' | 'issued' | 'final' | 'superseded' | string;
  file_url: string | null;
  sealed_by: string | null;
  sealed_at: string | null;
  seal_number: string | null;
  issued_at: string | null;
  issued_to: string | null;
  delivery_method: string | null;
  delivery_note: string | null;
  received_at: string | null;
  supersedes_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  jobId: string;
  /** Surfaced so the panel can pre-fill the sealing surveyor without guessing. */
  selfName?: string;
}

/** Common kinds, offered as suggestions. `kind` has no CHECK constraint, so this is a datalist and
 *  not a select — a firm that starts issuing something we did not think of must not be blocked by a
 *  dropdown. */
const KINDS = ['plat', 'survey drawing', 'legal description', 'ALTA certificate', 'elevation certificate', 'report', 'exhibit'];

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  final: 'Sealed — final',
  superseded: 'Superseded',
};

export default function JobDeliverables({ jobId, selfName }: Props) {
  const [rows, setRows] = useState<Deliverable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState('plat');
  const [draftNotes, setDraftNotes] = useState('');

  /** Which row has a form open, and which one. Only one at a time: a page with three half-filled
   *  seal forms is a page where somebody seals the wrong revision. */
  const [openForm, setOpenForm] = useState<{ id: string; action: 'seal' | 'issue' } | null>(null);
  const [sealedBy, setSealedBy] = useState(selfName ?? '');
  const [sealNumber, setSealNumber] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('email');
  const [deliveryNote, setDeliveryNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/deliverables?jobId=${encodeURIComponent(jobId)}`);
      const json = (await res.json()) as { deliverables?: Deliverable[]; error?: string };
      if (!res.ok) throw new Error(json.error || `Could not load deliverables (HTTP ${res.status}).`);
      setRows(json.deliverables ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const send = async (init: RequestInit, whatFailed: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/deliverables', {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `${whatFailed} (HTTP ${res.status}).`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!draftName.trim()) return;
    const ok = await send(
      { method: 'POST', body: JSON.stringify({ job_id: jobId, name: draftName.trim(), kind: draftKind, notes: draftNotes.trim() || null }) },
      'The deliverable could not be created',
    );
    if (ok) { setDraftName(''); setDraftNotes(''); setAdding(false); }
  };

  const seal = async (id: string) => {
    const ok = await send(
      { method: 'PATCH', body: JSON.stringify({ id, action: 'seal', sealed_by: sealedBy.trim(), seal_number: sealNumber.trim() }) },
      'The deliverable could not be sealed',
    );
    if (ok) { setOpenForm(null); setSealNumber(''); }
  };

  const issue = async (id: string) => {
    const ok = await send(
      { method: 'PATCH', body: JSON.stringify({ id, action: 'issue', issued_to: issuedTo.trim(), delivery_method: deliveryMethod, delivery_note: deliveryNote.trim() || null }) },
      'The deliverable could not be recorded as issued',
    );
    if (ok) { setOpenForm(null); setIssuedTo(''); setDeliveryNote(''); }
  };

  const receive = (id: string) =>
    send({ method: 'PATCH', body: JSON.stringify({ id, action: 'receive' }) }, 'Receipt could not be recorded');

  if (rows === null && !error) {
    return <p style={mutedStyle}>Loading deliverables…</p>;
  }

  return (
    <div className="job-detail__section">
      <h3><FileCheck2 size={15} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Deliverables</h3>
      <p className="job-detail__section-desc">
        What this job hands over, and what happened to it. A new deliverable with the same name becomes
        the next revision and supersedes the one before it — nothing is overwritten, because “what did
        we issue in March” is a question that gets asked years later.
      </p>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {!adding && (
        <button type="button" style={primaryBtn} onClick={() => { setAdding(true); setError(null); }}>
          <Plus size={13} />Add a deliverable
        </button>
      )}

      {adding && (
        <div style={cardStyle}>
          <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>What is it</span>
              <input
                style={inputStyle} value={draftName} autoFocus
                placeholder="Boundary survey plat"
                onChange={(e) => setDraftName(e.target.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Kind</span>
              <input
                style={inputStyle} value={draftKind} list="deliverable-kinds"
                onChange={(e) => setDraftKind(e.target.value)}
              />
              <datalist id="deliverable-kinds">
                {KINDS.map((k) => <option key={k} value={k} />)}
              </datalist>
            </label>
          </div>
          <label style={{ ...fieldStyle, marginTop: '0.6rem' }}>
            <span style={labelStyle}>Notes (optional)</span>
            <input style={inputStyle} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="button" style={primaryBtn} disabled={busy || !draftName.trim()} onClick={() => void create()}>
              {busy ? <Loader2 size={13} /> : null}
              Create
            </button>
            <button type="button" style={ghostBtn} disabled={busy} onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {rows && rows.length === 0 && !adding && (
        <p style={mutedStyle}>
          Nothing recorded yet. Deliverables added here are what the client sees on their portal.
        </p>
      )}

      {(rows ?? []).map((d) => {
        const superseded = d.state === 'superseded';
        return (
          <div key={d.id} style={{ ...cardStyle, opacity: superseded ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.92rem' }}>{d.name}</strong>
              <span style={badgeStyle(d.state)}>{STATE_LABEL[d.state] ?? d.state}</span>
              <span style={mutedInline}>{d.kind} · rev {d.revision}</span>
            </div>

            {/* The dates that matter, and only the ones that happened. A row of "—" teaches people to
                stop reading the block. */}
            <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {d.sealed_at && (
                <div>Sealed {fmt(d.sealed_at)} by {d.sealed_by} · reg. {d.seal_number}</div>
              )}
              {d.issued_at && (
                <div>Issued {fmt(d.issued_at)} to {d.issued_to}{d.delivery_method ? ` by ${d.delivery_method}` : ''}
                  {d.delivery_note ? ` — ${d.delivery_note}` : ''}</div>
              )}
              {d.received_at && <div>Received {fmt(d.received_at)}</div>}
              {d.notes && <div style={{ fontStyle: 'italic' }}>{d.notes}</div>}
              {!d.sealed_at && !d.issued_at && !d.received_at && !d.notes && (
                <div>Created {fmt(d.created_at)}{d.created_by ? ` by ${d.created_by}` : ''}</div>
              )}
            </div>

            {!superseded && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                {d.state !== 'final' && (
                  <button type="button" style={ghostBtn} disabled={busy}
                    onClick={() => { setOpenForm(openForm?.id === d.id && openForm.action === 'seal' ? null : { id: d.id, action: 'seal' }); setError(null); }}>
                    <Stamp size={13} />Seal
                  </button>
                )}
                <button type="button" style={ghostBtn} disabled={busy}
                  onClick={() => { setOpenForm(openForm?.id === d.id && openForm.action === 'issue' ? null : { id: d.id, action: 'issue' }); setError(null); }}>
                  <Send size={13} />
                  {d.issued_at ? 'Issue again' : 'Issue'}
                </button>
                {d.issued_at && !d.received_at && (
                  <button type="button" style={ghostBtn} disabled={busy} onClick={() => void receive(d.id)}>
                    <PackageCheck size={13} />Mark received
                  </button>
                )}
              </div>
            )}

            {openForm?.id === d.id && openForm.action === 'seal' && (
              <div style={formStyle}>
                {/* Said here, not after a rejected save: "final" means a licensed surveyor has taken
                    professional responsibility, and a sealed record with nobody's name on it asserts
                    something nobody did. */}
                <p style={{ ...mutedStyle, margin: '0 0 0.5rem' }}>
                  Sealing marks this final. Both fields are required — they are what make “final” mean
                  anything.
                </p>
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Surveyor</span>
                    <input style={inputStyle} value={sealedBy} onChange={(e) => setSealedBy(e.target.value)} placeholder="Hank Maddux" />
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Registration no.</span>
                    <input style={inputStyle} value={sealNumber} onChange={(e) => setSealNumber(e.target.value)} placeholder="RPLS 1234" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <button type="button" style={primaryBtn} disabled={busy || !sealedBy.trim() || !sealNumber.trim()} onClick={() => void seal(d.id)}>
                    Seal as final
                  </button>
                  <button type="button" style={ghostBtn} disabled={busy} onClick={() => setOpenForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            {openForm?.id === d.id && openForm.action === 'issue' && (
              <div style={formStyle}>
                <p style={{ ...mutedStyle, margin: '0 0 0.5rem' }}>
                  Who received it? A delivery with no recipient is just a file.
                </p>
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Issued to</span>
                    <input style={inputStyle} value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="Client name or email" />
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>How</span>
                    <select style={inputStyle} value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
                      <option value="email">Email</option>
                      <option value="portal">Client portal</option>
                      <option value="hand">By hand</option>
                      <option value="mail">Mail / courier</option>
                    </select>
                  </label>
                </div>
                <label style={{ ...fieldStyle, marginTop: '0.5rem' }}>
                  <span style={labelStyle}>Note (optional)</span>
                  <input style={inputStyle} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <button type="button" style={primaryBtn} disabled={busy || !issuedTo.trim()} onClick={() => void issue(d.id)}>
                    Record as issued
                  </button>
                  <button type="button" style={ghostBtn} disabled={busy} onClick={() => setOpenForm(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function badgeStyle(state: string): React.CSSProperties {
  const tone =
    state === 'final' ? { fg: 'var(--color-success-text)', bg: 'var(--color-success-surface)' }
    : state === 'issued' ? { fg: 'var(--color-info-text)', bg: 'var(--color-info-surface)' }
    : state === 'superseded' ? { fg: 'var(--color-text-tertiary)', bg: 'var(--color-bg-subtle)' }
    : { fg: 'var(--color-warning-text)', bg: 'var(--color-warning-surface)' };
  return {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 999, color: tone.fg, background: tone.bg,
  };
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8,
  padding: '0.75rem 0.9rem', marginTop: '0.6rem', background: 'var(--color-surface)',
};
const formStyle: React.CSSProperties = {
  marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--color-border)',
};
const fieldStyle: React.CSSProperties = { display: 'block' };
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', marginBottom: '0.2rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.5rem', borderRadius: 6,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
};
// `inline-flex` rather than the default `inline-block`: with an icon and a label inside, a block
// button wraps the icon onto its own line the moment the label is more than a word. It rendered as a
// stray "+" floating above "Add a deliverable".
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  border: '1px solid var(--color-brand-navy)', background: 'var(--color-brand-navy)',
  color: 'var(--color-text-on-brand)', borderRadius: 6, padding: '0.4rem 0.9rem',
  fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', borderRadius: 6, padding: '0.35rem 0.75rem',
  fontSize: '0.82rem', cursor: 'pointer',
};
const mutedStyle: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--color-text-tertiary)' };
const mutedInline: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--color-text-tertiary)' };
