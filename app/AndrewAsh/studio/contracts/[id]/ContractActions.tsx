'use client';
// app/AndrewAsh/studio/contracts/[id]/ContractActions.tsx — send it, countersign it, edit the wording.
//
// ── EDITING IS OFFERED ONLY WHILE IT IS STILL EDITABLE ──────────────────────────────────────────
//
// Once signed, the editor is not disabled — it is absent. A greyed-out textarea invites the user to
// look for the way to enable it; a panel that simply is not there says the decision is made. The API
// refuses the write regardless, but the UI should not be proposing something the server will reject.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, Copy, ExternalLink, Loader2, PenLine, Send, Trash2 } from 'lucide-react';
// From `contract-status`, NOT `contracts` — the latter reaches node:crypto via tokens.ts and
// cannot be bundled for a browser. See lib/voice/contract-status.ts.
import { isEditable, type ContractStatus } from '@/lib/voice/contract-status';
import { BASE_PATH } from '@/lib/voice/content';

interface Props {
  id: string;
  status: string;
  accessToken: string;
  clientEmail: string | null;
  clientName: string;
  title: string;
  bodyMarkdown: string;
}

export default function ContractActions(props: Props): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [body, setBody] = useState(props.bodyMarkdown);
  const [editing, setEditing] = useState(false);

  const status = props.status as ContractStatus;
  const editable = isEditable(status);
  const signUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${BASE_PATH}/contract/${props.accessToken}` : '';

  async function patch(payload: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/contracts/${props.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const firstName = props.clientName.trim().split(/\s+/)[0] || 'there';
  const mailto = props.clientEmail
    ? `mailto:${encodeURIComponent(props.clientEmail)}?subject=${encodeURIComponent(
        `Agreement for ${props.title}`,
      )}&body=${encodeURIComponent(
        `Hi ${firstName},\n\nHere is the agreement for ${props.title}. You can read and sign it here:\n\n${signUrl}\n\nAny questions, just reply to this.\n\nThanks!\n`,
      )}`
    : null;

  return (
    <>
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {status === 'draft' ? (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Not sent yet</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 16 }}>
            Read it through first. Once the client signs, the wording is frozen — changing it after
            that means voiding this and issuing a new one.
          </p>
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            style={{ width: '100%' }}
            disabled={busy === 'send'}
            onClick={() => void patch({ send: true }, 'send')}
          >
            {busy === 'send' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Send size={14} aria-hidden />}
            Ready to send
          </button>
        </div>
      ) : (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">The signing link</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
            Send this to {props.clientName}. They read it and type their name — no account needed.
          </p>
          <div className="vaCopyRow">
            <input className="vaInput" readOnly value={signUrl} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="vaBtn vaBtnOutline vaBtnSm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(signUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  setError('Could not copy — select the link and copy it manually.');
                }
              }}
            >
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="vaStudioActions">
            {mailto && (
              <a href={mailto} className="vaBtn vaBtnSolid vaBtnSm">
                <Send size={13} aria-hidden /> Email it
              </a>
            )}
            <a href={signUrl} target="_blank" rel="noopener noreferrer" className="vaBtn vaBtnGhost vaBtnSm">
              <ExternalLink size={13} aria-hidden /> See what they see
            </a>
          </div>
        </div>
      )}

      {status === 'signed' && (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">Your turn</h2>
          </div>
          <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 16 }}>
            {props.clientName} has signed. Countersigning records your acceptance and completes the
            agreement — both sides having a timestamp is what makes it mutual.
          </p>
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            style={{ width: '100%' }}
            disabled={busy === 'counter'}
            onClick={() => void patch({ countersign: true }, 'counter')}
          >
            {busy === 'counter' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <PenLine size={14} aria-hidden />}
            Countersign
          </button>
        </div>
      )}

      {/* Absent, not disabled, once signed — see the note at the top of this file. */}
      {editable && (
        <div className="vaPanel">
          <div className="vaPanelHead">
            <h2 className="vaPanelTitle">The wording</h2>
            {!editing && (
              <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <>
              <textarea
                className="vaTextarea"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem' }}
              />
              <p className="vaHint">
                Plain text. `#` starts a heading, `**bold**` emphasises, `---` draws a rule.
              </p>
              <div className="vaStudioActions">
                <button
                  type="button"
                  className="vaBtn vaBtnSolid vaBtnSm"
                  disabled={busy === 'body'}
                  onClick={async () => {
                    const ok = await patch({ bodyMarkdown: body }, 'body');
                    if (ok) setEditing(false);
                  }}
                >
                  {busy === 'body' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
                  Save wording
                </button>
                <button
                  type="button"
                  className="vaBtn vaBtnGhost vaBtnSm"
                  onClick={() => {
                    setBody(props.bodyMarkdown);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="vaMuted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Editable until it is signed. The template already covers cancellation, revisions, late
              payment and ownership on payment — only add to it if you have a reason.
            </p>
          )}
        </div>
      )}

      <div className="vaPanel">
        <div className="vaStudioActions">
          {status === 'sent' && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              disabled={busy === 'unsend'}
              onClick={() => void patch({ unsend: true }, 'unsend')}
            >
              Back to draft
            </button>
          )}
          {status !== 'void' && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              disabled={busy === 'void'}
              onClick={() => {
                if (!window.confirm('Void this agreement? It stays on the record but is no longer in force.')) return;
                void patch({ void: true }, 'void');
              }}
            >
              <Ban size={13} aria-hidden /> Void it
            </button>
          )}
          {status === 'draft' && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              style={{ color: 'var(--va-danger)' }}
              disabled={busy === 'delete'}
              onClick={async () => {
                if (!window.confirm('Delete this draft?')) return;
                setBusy('delete');
                await fetch(`/api/voice/contracts/${props.id}`, { method: 'DELETE' });
                router.push(`${BASE_PATH}/studio/contracts`);
              }}
            >
              <Trash2 size={13} aria-hidden /> Delete draft
            </button>
          )}
        </div>
      </div>
    </>
  );
}
