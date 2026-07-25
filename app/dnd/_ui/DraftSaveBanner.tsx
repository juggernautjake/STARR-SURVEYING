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

  const btn = (label: string, onClick: () => void, opts: { primary?: boolean; danger?: boolean; key: string } ) => (
    <button type="button" disabled={!!busy} onClick={onClick} style={{
      fontSize: 12.5, padding: '7px 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
      fontFamily: 'var(--hx-font-display)', letterSpacing: '0.02em',
      border: `1px solid ${opts.danger ? 'var(--hx-danger, #ff6b6b)' : opts.primary ? 'var(--hx-gold-2, #c8aa6e)' : 'var(--hx-line, rgba(255,255,255,0.14))'}`,
      background: opts.primary ? 'rgba(200,170,110,0.16)' : opts.danger ? 'rgba(255,107,107,0.10)' : 'rgba(255,255,255,0.03)',
      color: opts.danger ? '#ff9d9d' : opts.primary ? 'var(--hx-gold-2, #c8aa6e)' : 'var(--hx-text, #e8e0cf)',
      opacity: busy ? 0.6 : 1,
    }}>{busy === opts.key ? 'Working…' : label}</button>
  );

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '12px 14px', display: 'grid', gap: 8, borderColor: 'var(--hx-gold-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.06em' }}>✎ EDITING A DRAFT</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>Changes are on a working copy of <strong style={{ color: 'var(--hx-text)' }}>{sourceName}</strong> — nothing is saved until you choose:</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {btn(`Save to ${sourceName}`, () => act('save-to-original'), { primary: true, key: 'save-to-original' })}
        {btn('Save as new variant', () => act('save-as-variant'), { key: 'save-as-variant' })}
        {btn('Discard', () => act('discard-draft'), { danger: true, key: 'discard-draft' })}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--hx-muted)' }}>
        <strong style={{ color: 'var(--hx-text)' }}>Save to {sourceName}</strong> overwrites that version. <strong style={{ color: 'var(--hx-text)' }}>Save as new variant</strong> keeps {sourceName} unchanged and branches a new version with your edits.
      </p>
      {err && <p style={{ margin: 0, fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </div>
  );
}
