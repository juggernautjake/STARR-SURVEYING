'use client';
// DraftSaveBanner — the Save bar shown while editing a working-copy DRAFT (Edit-flow). It replaces the
// versions switcher during a draft session. All the normal sheet editors act on the draft; this bar decides
// where the edits land: overwrite the version you branched from, branch a new variant (source kept), or throw
// the draft away. Mirrors the framedPanel chrome idiom.
import { useState } from 'react';
import styles from './hextech.module.css';

export default function DraftSaveBanner({
  characterId, sourceName,
}: {
  characterId: string;
  /** The name of the version this draft was branched from (the relative "original"). */
  sourceName: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: 'save-to-original' | 'save-as-variant' | 'discard-draft', body: Record<string, unknown> = {}) {
    setBusy(action); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'Could not save.'); setBusy(null); return; }
      window.location.reload();
    } catch { setErr('Network error — please try again.'); setBusy(null); }
  }

  // Three commits, three tones — each is a real choice, so none of them should read as the leftover option.
  // Gold = save to this version, TEAL = branch a new variant (the tone the versions picker already uses for
  // "Variant"), red = discard. A borderless middle button looked disabled next to the other two.
  const btn = (label: string, onClick: () => void, opts: { tone: 'gold' | 'teal' | 'danger'; key: string }) => {
    const tone = {
      gold: { line: 'var(--hx-gold-2, #c8aa6e)', bg: 'rgba(200,170,110,0.16)', fg: 'var(--hx-gold-2, #c8aa6e)', glow: 'rgba(200,170,110,0.18)' },
      teal: { line: 'var(--hx-teal-1, #0ac8b9)', bg: 'rgba(10,200,185,0.14)', fg: 'var(--hx-teal-1, #0ac8b9)', glow: 'rgba(10,200,185,0.16)' },
      danger: { line: 'var(--hx-danger, #ff6b6b)', bg: 'rgba(255,107,107,0.10)', fg: '#ff9d9d', glow: 'transparent' },
    }[opts.tone];
    return (
      <button type="button" disabled={!!busy} onClick={onClick} style={{
        fontSize: 12.5, padding: '7px 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
        fontFamily: 'var(--hx-font-display)', letterSpacing: '0.02em',
        border: `1px solid ${tone.line}`, background: tone.bg, color: tone.fg,
        boxShadow: `inset 0 0 12px ${tone.glow}`,
        opacity: busy ? 0.6 : 1,
      }}>{busy === opts.key ? 'Working…' : label}</button>
    );
  };

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '12px 14px', display: 'grid', gap: 8, borderColor: 'var(--hx-gold-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.06em' }}>✎ EDITING A DRAFT</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Changes are on a working copy of <strong style={{ color: 'var(--hx-text)' }}>{sourceName}</strong> — nothing is saved until you choose:</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {btn(`Save to ${sourceName}`, () => act('save-to-original'), { tone: 'gold', key: 'save-to-original' })}
        {/* No fork glyph: ⑂ (U+2442) has no coverage in the display face and rendered as tofu. */}
        {btn('+ Save as new variant', () => act('save-as-variant'), { tone: 'teal', key: 'save-as-variant' })}
        {btn('Discard', () => act('discard-draft'), { tone: 'danger', key: 'discard-draft' })}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--hx-muted)' }}>
        <strong style={{ color: 'var(--hx-text)' }}>Save to {sourceName}</strong> overwrites that version. <strong style={{ color: 'var(--hx-text)' }}>Save as new variant</strong> keeps {sourceName} unchanged and branches a new version with your edits.
      </p>
      {err && <p style={{ margin: 0, fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </div>
  );
}
