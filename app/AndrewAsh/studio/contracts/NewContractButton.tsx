'use client';
// app/AndrewAsh/studio/contracts/NewContractButton.tsx — drafting an agreement.
//
// ── EVERY FIELD HERE IS A CLAUSE ────────────────────────────────────────────────────────────────
//
// This is not a form that collects metadata and attaches a document. Each answer is substituted into
// the agreement's actual wording — the fee into section 2, the usage scope into section 3, the
// revision count into section 5. That is why the usage picker shows what each scope MEANS rather than
// just its name: choosing "national broadcast" instead of "web" is a decision worth roughly $700, and
// a dropdown of six unexplained words is how that decision gets made carelessly.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, Loader2 } from 'lucide-react';
import { USAGE_SCOPES } from '@/lib/voice/usage';
import { formatCents, parseCents } from '@/lib/voice/money';
import { BASE_PATH } from '@/lib/voice/content';

interface Client {
  id: string;
  name: string;
  company: string | null;
}

export default function NewContractButton({ clients }: { clients: Client[] }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState<'voiceover' | 'coaching'>('voiceover');
  const [clientId, setClientId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [fee, setFee] = useState('');
  const [usageScopeId, setUsageScopeId] = useState('web');
  const [usageTermMonths, setUsageTermMonths] = useState('12');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [revisions, setRevisions] = useState('1');
  const [depositPct, setDepositPct] = useState(50);
  const [sessionCount, setSessionCount] = useState('4');
  const [sessionMinutes, setSessionMinutes] = useState('45');
  const [extraTerms, setExtraTerms] = useState('');

  const scope = useMemo(() => USAGE_SCOPES.find((u) => u.id === usageScopeId), [usageScopeId]);
  const feeCents = parseCents(fee || '0');
  const depositCents = Math.round((feeCents * depositPct) / 100);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!clientId) {
      setError('Choose a client.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/voice/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          templateId,
          projectTitle,
          feeCents,
          usageScopeId,
          usageTermMonths: Number(usageTermMonths) || null,
          deliveryDate: deliveryDate || null,
          revisionsIncluded: Number(revisions) || 1,
          depositPct,
          sessionCount: Number(sessionCount) || 1,
          sessionMinutes: Number(sessionMinutes) || 45,
          extraTerms,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not draft that.');
      router.push(`${BASE_PATH}/studio/contracts/${body.contract.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft that.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="vaBtn vaBtnSolid vaBtnSm"
        onClick={() => setOpen(true)}
        disabled={clients.length === 0}
        title={clients.length === 0 ? 'Add a client first' : undefined}
      >
        <FileSignature size={14} aria-hidden /> New agreement
      </button>
    );
  }

  return (
    <form onSubmit={create} className="vaPanel" style={{ marginBottom: 0, width: 'min(100%, 560px)' }}>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      <div className="vaSegmented" style={{ marginBottom: 18 }}>
        {(['voiceover', 'coaching'] as const).map((t) => (
          <label key={t} className="vaSegment">
            <input type="radio" name="tpl" checked={templateId === t} onChange={() => setTemplateId(t)} />
            <span>{t === 'voiceover' ? 'Voice work' : 'Coaching'}</span>
          </label>
        ))}
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-co-client">Client</label>
        <select id="va-co-client" className="vaSelect" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
          <option value="">Choose…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.company ? ` — ${c.company}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-co-title">What is the job?</label>
        <input
          id="va-co-title"
          className="vaInput"
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder={templateId === 'coaching' ? 'Four-lesson block' : 'Radio spot — 30 seconds'}
          required
        />
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-co-fee">Fee</label>
        <input id="va-co-fee" className="vaInput" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="450.00" required />
      </div>

      {templateId === 'voiceover' ? (
        <>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-co-usage">Where will it be used?</label>
            <select id="va-co-usage" className="vaSelect" value={usageScopeId} onChange={(e) => setUsageScopeId(e.target.value)}>
              {USAGE_SCOPES.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
            {scope && <p className="vaHint">{scope.detail}</p>}
          </div>

          <div className="vaFieldRow vaFieldRow2">
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-co-term">Licence length (months)</label>
              <input id="va-co-term" className="vaInput" inputMode="numeric" value={usageTermMonths} onChange={(e) => setUsageTermMonths(e.target.value)} />
            </div>
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-co-rev">Revisions included</label>
              <input id="va-co-rev" className="vaInput" inputMode="numeric" value={revisions} onChange={(e) => setRevisions(e.target.value)} />
            </div>
          </div>

          <div className="vaField">
            <label className="vaLabel" htmlFor="va-co-delivery">Delivery date (optional)</label>
            <input id="va-co-delivery" type="date" className="vaInput" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="vaFieldRow vaFieldRow2">
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-co-sessions">Sessions</label>
            <input id="va-co-sessions" className="vaInput" inputMode="numeric" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} />
          </div>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-co-mins">Minutes each</label>
            <input id="va-co-mins" className="vaInput" inputMode="numeric" value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} />
          </div>
        </div>
      )}

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-co-deposit">Deposit — {depositPct}%</label>
        <input
          id="va-co-deposit"
          type="range"
          className="vaRange"
          min={0}
          max={100}
          step={5}
          value={depositPct}
          onChange={(e) => setDepositPct(Number(e.target.value))}
        />
        <p className="vaHint">
          {depositPct === 0
            ? 'No deposit — the whole fee is due on delivery. Risky on a first job with a new client.'
            : `${formatCents(depositCents)} before recording, ${formatCents(feeCents - depositCents)} on delivery.`}
        </p>
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-co-extra">Anything else to add (optional)</label>
        <textarea id="va-co-extra" className="vaTextarea" rows={3} value={extraTerms} onChange={(e) => setExtraTerms(e.target.value)} />
      </div>

      <div className="vaStudioActions">
        <button type="submit" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy}>
          {busy ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <FileSignature size={14} aria-hidden />}
          Draft it
        </button>
        <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      <p className="vaHint" style={{ marginTop: 12 }}>
        You will see the full wording before anything is sent, and you can edit it.
      </p>
    </form>
  );
}
