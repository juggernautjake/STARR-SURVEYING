'use client';
// PF2ElementEditor — edit a spell or feat on a PF2 sheet, or author a brand-new one.
//
// S15a/S15b of the PF2 buildout. The PF2 sheet could render content and (since S13) ADD catalogued
// content, but it could not change what it held or invent anything — the 2024 sheet does both.
//
// GROUND RULE 4 is what keeps this small: custom content is the SAME SHAPE as official content. A
// homebrew PF2 spell is a PF2KnownSpell like any other, saved through the same `add_spell` op and
// rendered by the same code. There is no parallel "custom" pathway, which is how a system ends up
// with two half-working ones.
//
// TWO AXES, KEPT SEPARATE — they answer different questions and an element can carry both:
//   · `customized` (✎) — edited away from how it came.
//   · `offRules`   (⚑) — official content this character may not legally take.
// Homebrew authored here is neither: it never claimed to be official, so it carries no offRules,
// and it was authored rather than edited, so it starts un-customized.
import { useState } from 'react';

type Kind = 'spell' | 'feat';

/** The subset of fields either shape exposes for editing. Deliberately narrow: these are the
 *  fields the sheet actually renders, so the editor cannot write something invisible. */
export interface PF2EditableElement {
  name: string;
  /** Spells only. */
  rank?: number;
  prepared?: boolean;
  /** Feats only. */
  level?: number;
  track?: string;
  /** Rules text — `effect` on a spell, `body` on a feat. */
  text?: string;
}

const TRACKS = ['ancestry', 'class', 'skill', 'general', 'archetype', 'feature'] as const;

export default function PF2ElementEditor({
  kind, initial, onSave, onClose,
}: {
  kind: Kind;
  /** Absent = authoring something new. Present = editing what the character holds. */
  initial?: PF2EditableElement;
  onSave: (edit: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const creating = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [rank, setRank] = useState(initial?.rank ?? 0);
  const [level, setLevel] = useState(initial?.level ?? 1);
  const [track, setTrack] = useState(initial?.track ?? 'class');
  const [text, setText] = useState(initial?.text ?? '');
  const [prepared, setPrepared] = useState(initial?.prepared ?? false);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;

  function save() {
    if (!canSave) return;
    if (creating) {
      // Authored content goes through the SAME add op as a catalogued pick. The server gate looks
      // it up in the catalog, misses (it is homebrew), and lets it through — homebrew makes no
      // claim to be official content, so refusing it would block authoring rather than close a
      // hole.
      onSave(kind === 'spell'
        ? { op: 'add_spell', name: trimmed, rank, ...(prepared ? { prepared: true } : {}), ...(text ? { effect: text } : {}) }
        : { op: 'add_feat', name: trimmed, level, track, ...(text ? { body: text } : {}) });
      return;
    }
    // Editing: `name` identifies the CURRENT element and `to` carries a rename, so renaming keeps
    // every other field rather than dropping what a remove + re-add would lose.
    const renamed = trimmed !== initial!.name;
    onSave(kind === 'spell'
      ? { op: 'update_spell', name: initial!.name, ...(renamed ? { to: trimmed } : {}), rank, prepared, effect: text }
      : { op: 'update_feat', name: initial!.name, ...(renamed ? { to: trimmed } : {}), level, track, body: text });
  }

  const field = { padding: '7px 9px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6 } as const;
  const lbl = { fontSize: 10.5, color: 'var(--hx-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '86vh', overflowY: 'auto', background: 'var(--hx-bg, #0a1018)', border: '1px solid var(--hx-line)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1, color: 'var(--hx-text)' }}>
            {creating ? `New ${kind}` : `Edit ${initial!.name}`}
          </strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {creating && (
          <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            Homebrew is yours — it is not checked against the rules, because it never claimed to be
            official content. It is flagged custom so a DM reviewing the sheet can see it.
          </div>
        )}

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} placeholder={kind === 'spell' ? 'e.g. Ember Lash' : 'e.g. Practised Duellist'} />
        </label>

        {kind === 'spell' ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 120 }}>
              {/* RANK, not level — PF2's word, and the two diverge constantly. */}
              <span style={lbl}>Rank (0 = cantrip)</span>
              <input type="number" min={0} max={10} value={rank} onChange={(e) => setRank(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} style={field} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-text)' }}>
              <input type="checkbox" checked={prepared} onChange={(e) => setPrepared(e.target.checked)} />
              Prepared today
            </label>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 110 }}>
              <span style={lbl}>Level</span>
              <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 3, flex: 1, minWidth: 130 }}>
              <span style={lbl}>Track</span>
              <select value={track} onChange={(e) => setTrack(e.target.value)} style={field}>
                {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
        )}

        <label style={{ display: 'grid', gap: 3 }}>
          <span style={lbl}>Rules text</span>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={5}
            style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="What it actually does — the numbers matter more than the flavour."
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn tiny" onClick={onClose}>Cancel</button>
          <button
            className="btn tiny solid" onClick={save} disabled={!canSave}
            title={canSave ? undefined : 'A name is required.'}
            style={canSave ? undefined : { opacity: 0.5, cursor: 'not-allowed' }}
          >
            {creating ? `Create ${kind}` : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
