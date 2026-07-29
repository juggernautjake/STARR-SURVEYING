'use client';
// app/dnd/_ui/DraftAssistPanel.tsx — "fill in everything from the name and a sentence" (P6-15b).
//
// THE PER-FIELD REVIEW IS THE FEATURE, not the packaging. P6-15b was split off P6-15 with a specific
// warning: *"one all-or-nothing button would quietly become the auto-apply this slice exists to avoid."*
// So every suggestion is its own row with its own control, a row that would REPLACE existing text says so
// and shows what it would replace, and nothing reaches the form until a row is ticked.
//
// There is a "Use all the empty ones" shortcut and deliberately no "Use everything": filling blanks is a
// low-stakes bulk action, overwriting an author's paragraphs is not, and collapsing the two is exactly the
// slide this design is guarding against.
import { useState } from 'react';
import styles from './hextech.module.css';
import type { DraftRow } from '@/lib/dnd/homebrew/draft-assist';

export default function DraftAssistPanel({
  kind,
  system,
  name,
  values,
  onApply,
}: {
  kind: string;
  system: string;
  name: string;
  values: Record<string, unknown>;
  /** Called with the accepted row keys. The BUILDER owns the merge, so the form stays the single writer
   *  of its own state — a panel that mutated values directly would be a second one. */
  onApply: (rows: DraftRow[], acceptedKeys: string[]) => void;
}) {
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [summary, setSummary] = useState('');
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  async function draft() {
    if (busy) return;
    setBusy(true); setErr(null); setRows(null); setTaken(new Set());
    try {
      const r = await fetch('/api/dnd/homebrew/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, system, name, idea, values }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'Could not draft that.'); return; }
      setRows(Array.isArray(j.rows) ? (j.rows as DraftRow[]) : []);
      setSummary(typeof j.summary === 'string' ? j.summary : '');
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function take(row: DraftRow) {
    onApply([row], [row.key]);
    setTaken((prev) => new Set(prev).add(row.key));
  }

  function takeBlanks() {
    const blanks = (rows ?? []).filter((r) => !r.overwrites && !taken.has(r.key));
    if (!blanks.length) return;
    onApply(blanks, blanks.map((r) => r.key));
    setTaken((prev) => { const next = new Set(prev); blanks.forEach((r) => next.add(r.key)); return next; });
  }

  const pending = (rows ?? []).filter((r) => !taken.has(r.key));
  const blankCount = pending.filter((r) => !r.overwrites).length;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
        Or describe it in a sentence and get a first pass at every field. Each suggestion is offered on its
        own — nothing goes into the form until you take it.
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="A duelist who fights with a rapier and a grudge…"
          aria-label="Describe this piece"
          maxLength={2000}
          style={{ flex: '1 1 300px', minWidth: 0, padding: '7px 10px', fontSize: 12.5 }}
        />
        <button type="button" className={styles.hexBtn} disabled={busy || (!idea.trim() && !name.trim())}
          onClick={draft} style={{ padding: '6px 14px', fontSize: 12.5 }}>
          {busy ? 'Drafting…' : '✨ Draft it'}
        </button>
      </div>
      {err && <span style={{ fontSize: 12, color: 'var(--hx-danger)' }}>{err}</span>}

      {rows && rows.length === 0 && (
        <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
          Nothing to suggest — either the form is already filled in or there was not enough to go on.
        </span>
      )}

      {pending.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{summary}</span>
            {blankCount > 1 && (
              // Blanks only. There is no "use everything" — see the note at the top of this file.
              <button type="button" className={styles.hexBtn} onClick={takeBlanks} style={{ padding: '4px 10px', fontSize: 12 }}>
                Use all {blankCount} empty ones
              </button>
            )}
          </div>
          {pending.map((row) => (
            <div key={row.key} style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: '8px 10px', display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12.5, color: 'var(--hx-text)' }}>{row.label}</strong>
                {row.overwrites && (
                  // Named, not styled-and-hoped-for. Overwriting a paragraph someone typed is a different
                  // act from filling an empty box, and a review screen that presents them identically is a
                  // review screen that gets clicked through.
                  <span style={{ fontSize: 11, color: 'var(--hx-gold-2)' }}>would replace what you wrote</span>
                )}
              </div>
              {row.overwrites && (
                <div style={{ fontSize: 12, color: 'var(--hx-muted)', textDecoration: 'line-through' }}>{row.current}</div>
              )}
              <div style={{ fontSize: 12.5, color: 'var(--hx-text)', whiteSpace: 'pre-wrap' }}>{row.proposed}</div>
              <div>
                <button type="button" className={styles.hexBtn} onClick={() => take(row)} style={{ padding: '4px 10px', fontSize: 12 }}>
                  {row.overwrites ? 'Replace mine' : 'Use it'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
