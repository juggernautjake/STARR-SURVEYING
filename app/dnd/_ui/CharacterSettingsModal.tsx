'use client';
// CharacterSettingsModal — the per-character settings gear (settings S-3).
//
// A gear button (owner/DM only) opens a modal that surfaces THIS character's configurable rules + display/
// roller preferences in one place, organised by section. Each control shows the EFFECTIVE value (with the
// DM's lock honoured — a locked setting is disabled and marked "set by your DM"), and lets the player pick
// their own value or "Follow campaign" to unset it. It writes the full player-preferences object to the
// `/preferences` endpoint (S-2) and reloads so the freshly-resolved preferences drive the sheet (same
// store-rehydration reason the layout/roller pickers reload).
//
// It reads the SHARED option catalog (`preference-options.ts`), the same source the DM's campaign panel
// uses, so the two never drift. Works for EVERY system because it lives at the page level on the
// server-resolved preferences, not inside the 5e store.
import { useState } from 'react';
import styles from './hextech.module.css';
import type { EffectivePreferences, PlayerPreferences } from '@/lib/dnd/preferences';
import {
  ENUM_OPTIONS, ENUM_HELP, ENUM_LABEL, ENUM_ORDER, BOOL_LABEL, BOOL_HELP, BOOL_ORDER, PREF_GROUP,
  type EnumPrefField, type BoolPrefField,
} from '@/lib/dnd/preference-options';

type Draft = PlayerPreferences;

export default function CharacterSettingsModal({
  characterId,
  effective,
  player,
  canWrite = true,
  isOwner = false,
  characterName,
}: {
  characterId: string;
  /** The resolved preferences (value + lockedByDM per field), so each control shows the live value. */
  effective: EffectivePreferences;
  /** The player's OWN stored choices, so a control shows "Follow campaign" when unset. */
  player: PlayerPreferences;
  canWrite?: boolean;
  /** Only the OWNER may delete the character (a DM can write but must not erase it). */
  isOwner?: boolean;
  /** Shown in the delete confirmation so the owner knows exactly what they're removing. */
  characterName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(player);
  const [busy, setBusy] = useState(false);
  // Delete flow: a typed-confirmation guard so a permanent, irreversible delete can't happen on one stray click.
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deleteCharacter = async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}`, { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Delete failed (${r.status}).`); }
      window.location.href = '/dnd/characters'; // back to the lobby; the character is gone
    } catch (e) {
      setDeleting(false);
      setErr(e instanceof Error ? e.message : 'Could not delete the character.');
    }
  };
  const [err, setErr] = useState<string | null>(null);

  async function save(next: Draft) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/preferences`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: next }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not save.'); setBusy(false); return; }
      window.location.reload();
    } catch {
      setErr('Network error.'); setBusy(false);
    }
  }

  function setField(field: EnumPrefField | BoolPrefField, value: string | boolean | undefined) {
    const next = { ...draft } as Record<string, unknown>;
    if (value === undefined) delete next[field]; else next[field] = value;
    setDraft(next as Draft);
    void save(next as Draft);
  }

  const enumRow = (field: EnumPrefField) => {
    const eff = effective[field];
    const locked = eff.lockedByDM;
    const chosen = (draft as Record<string, unknown>)[field] as string | undefined;
    return (
      <div key={field} style={{ display: 'grid', gap: 4, marginBottom: 12, opacity: locked ? 0.75 : 1 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hx-gold-2)' }}>
          {ENUM_LABEL[field]} {locked && <span title="Set by your DM for this campaign" style={{ color: 'var(--hx-muted)', fontWeight: 400 }}>🔒 set by your DM</span>}
        </label>
        <select
          value={locked ? String(eff.value) : (chosen ?? '')}
          disabled={locked || busy || !canWrite}
          onChange={(e) => setField(field, e.target.value === '' ? undefined : e.target.value)}
          className={styles.hexInput}
          style={{ width: '100%' }}
        >
          <option value="">Follow campaign ({ENUM_OPTIONS[field].find((o) => o.value === eff.value)?.label ?? String(eff.value)})</option>
          {ENUM_OPTIONS[field].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--hx-muted)', lineHeight: 1.4 }}>{ENUM_HELP[field]}</span>
      </div>
    );
  };

  const boolRow = (field: BoolPrefField) => {
    const eff = effective[field];
    const locked = eff.lockedByDM;
    const chosen = (draft as Record<string, unknown>)[field];
    const cur = chosen === undefined ? '' : chosen ? 'on' : 'off';
    return (
      <div key={field} style={{ display: 'grid', gap: 4, marginBottom: 12, opacity: locked ? 0.75 : 1 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--hx-gold-2)' }}>
          {BOOL_LABEL[field]} {locked && <span title="Set by your DM for this campaign" style={{ color: 'var(--hx-muted)', fontWeight: 400 }}>🔒 set by your DM</span>}
        </label>
        <select
          value={locked ? (eff.value ? 'on' : 'off') : cur}
          disabled={locked || busy || !canWrite}
          onChange={(e) => setField(field, e.target.value === '' ? undefined : e.target.value === 'on')}
          className={styles.hexInput}
          style={{ width: '100%' }}
        >
          <option value="">Follow campaign ({eff.value ? 'On' : 'Off'})</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--hx-muted)', lineHeight: 1.4 }}>{BOOL_HELP[field]}</span>
      </div>
    );
  };

  const displayFields = ENUM_ORDER.filter((f) => PREF_GROUP[f] === 'display');
  const rulesEnum = ENUM_ORDER.filter((f) => PREF_GROUP[f] === 'rules');

  return (
    <>
      <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpen(true)} className={styles.hexBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Character settings — rules variants + display/roller preferences">
          <span aria-hidden>⚙</span> Settings
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Character settings"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(1,6,12,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 16px' }}
        >
          <div className={styles.framedPanel} style={{ maxWidth: 560, width: '100%', padding: '16px 18px', background: 'var(--hx-navy-0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>⚙ Character settings</h2>
              <button type="button" onClick={() => setOpen(false)} className={styles.hexBtn} aria-label="Close settings">✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--hx-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Your own rules + display choices for this character. A setting your DM locked for the campaign
              shows 🔒 and can’t be changed here (it applies only inside that campaign). Changes save at once.
            </p>

            <h3 style={{ fontSize: 13, color: 'var(--hx-teal-1)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Display &amp; roller</h3>
            {displayFields.map(enumRow)}

            <h3 style={{ fontSize: 13, color: 'var(--hx-teal-1)', margin: '10px 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rules</h3>
            {BOOL_ORDER.map(boolRow)}
            {rulesEnum.map(enumRow)}

            {err && <p style={{ fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)', margin: '4px 0 0' }}>{err}</p>}
            {!canWrite && <p style={{ fontSize: 12, color: 'var(--hx-muted)', margin: '6px 0 0' }}>You’re viewing this character; only its owner or DM can change settings.</p>}

            {/* Danger zone — permanent delete, OWNER only, behind a typed confirmation. */}
            {isOwner && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hx-danger, #ff6b6b)' }}>
                <h3 style={{ fontSize: 13, color: 'var(--hx-danger, #ff6b6b)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Danger zone</h3>
                {!confirming ? (
                  <button type="button" onClick={() => { setConfirming(true); setConfirmText(''); setErr(null); }}
                    style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', color: 'var(--hx-danger, #ff6b6b)', background: 'transparent', border: '1px solid var(--hx-danger, #ff6b6b)' }}>
                    🗑 Delete this character
                  </button>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: 0 }}>
                      This <strong>permanently</strong> deletes {characterName ? <strong>{characterName}</strong> : 'this character'} and all of its data from the site — this cannot be undone.
                      Type <strong>{characterName || 'DELETE'}</strong> to confirm.
                    </p>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={characterName || 'DELETE'} autoFocus
                      style={{ fontSize: 13, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--hx-line)', background: 'var(--hx-inset-strong, rgba(130,132,140,0.10))', color: 'inherit', maxWidth: 260 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" disabled={deleting || confirmText.trim() !== (characterName || 'DELETE')} onClick={deleteCharacter}
                        style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 7, color: '#fff', background: 'var(--hx-danger, #c0392b)', border: 'none',
                          cursor: deleting || confirmText.trim() !== (characterName || 'DELETE') ? 'default' : 'pointer', opacity: confirmText.trim() === (characterName || 'DELETE') && !deleting ? 1 : 0.5 }}>
                        {deleting ? 'Deleting…' : 'Permanently delete'}
                      </button>
                      <button type="button" disabled={deleting} onClick={() => setConfirming(false)}
                        style={{ fontSize: 13, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', color: 'inherit', background: 'transparent', border: '1px solid var(--hx-line)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
