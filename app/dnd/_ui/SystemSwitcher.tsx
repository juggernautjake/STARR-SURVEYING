// app/dnd/_ui/SystemSwitcher.tsx — switch or transpose the character's active game system
// (Phase V, Slice 13). Lists the systems the character already has a sheet for (instant
// switch) and the other systems it can be transposed into (AI-built on demand, grounded in
// that system). Owner/DM only. Switching preserves each system's sheet independently.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS, systemLabel, isSystemAvailable } from '@/lib/dnd/systems';
import styles from './hextech.module.css';

export default function SystemSwitcher({
  characterId,
  activeSystem,
  builtSystems,
  sheets = [],
  aiConfigured,
  allowCustom = true,
}: {
  characterId: string;
  activeSystem: string;
  builtSystems: string[];
  /** Every sheet the character holds (Area MV2c): active + each stored slot, with kind + name. */
  sheets?: { slotId: string; system: string; kind: 'vanilla' | 'custom'; name: string; active: boolean }[];
  aiConfigured: boolean;
  /** Whether custom content is allowed for this character/campaign — gates the transpose consent prompt (TR2). */
  allowCustom?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Transpose lifecycle (Area TR1): 'working' shows the animated progress bar; 'done' shows an obvious
  // success notification. Only set for a transpose (an AI build), not an instant switch.
  const [transpose, setTranspose] = useState<{ system: string; phase: 'working' | 'done'; summary?: string | null; allowedCustom?: boolean; custom?: { type: string; name: string; note?: string }[]; hp?: number } | null>(null);
  // The system awaiting the custom-content consent decision (Area TR2).
  const [consent, setConsent] = useState<string | null>(null);
  // Add-sheet form state (Area MV2c).
  const [adding, setAdding] = useState(false);
  const [addSystem, setAddSystem] = useState(activeSystem || SYSTEM_AMBIGUOUS);
  const [addKind, setAddKind] = useState<'vanilla' | 'custom'>('vanilla');
  const [addName, setAddName] = useState('');
  // How to build the new sheet (Area MV): 'blank' = an empty sheet; 'transpose' = the AI rebuilds THIS
  // character into the chosen system as a new sheet, keeping every existing one. Transpose needs the AI.
  const [addMethod, setAddMethod] = useState<'blank' | 'transpose'>('blank');

  // Switch the active sheet to a SPECIFIC stored slot (MV2c) — a character can hold several sheets per system.
  async function switchSlot(slotId: string) {
    if (busy) return;
    setBusy(slotId); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not switch sheet.'); return; }
      router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(null); }
  }

  // Rename / delete a sheet (Area MV).
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editSlotName, setEditSlotName] = useState('');
  // The sheet pending a delete confirmation (owner: an in-app popup, not the browser confirm).
  const [confirmDelete, setConfirmDelete] = useState<{ slotId: string; name: string } | null>(null);
  async function slotAction(slotId: string, extra: Record<string, unknown>, okMsg?: string) {
    setBusy(slotId); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not update sheet.'); return; }
      setEditingSlot(null); if (okMsg) setMsg(okMsg); router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(null); }
  }

  // Create a NEW sheet for a playable system (MV2c/MV). 'blank' parks an empty sheet without switching; a
  // 'transpose' has the AI rebuild THIS character into that system as a fresh, now-active sheet, keeping every
  // existing one (so you can hold e.g. a vanilla AND a custom build for the same system).
  async function addSheet() {
    const name = addName.trim() || undefined;
    if (addMethod === 'transpose') {
      if (!aiConfigured) { setMsg('AI is not configured — cannot transpose. Add a blank sheet instead.'); return; }
      setBusy('__add'); setMsg(null); setAdding(false);
      setTranspose({ system: addSystem, phase: 'working' });
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transpose', system: addSystem, allowCustom: addKind === 'custom', name }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg(j.error ?? 'Could not build the sheet.'); setTranspose(null); return; }
        setTranspose({ system: addSystem, phase: 'done', summary: j.summary ?? null, allowedCustom: j.allowedCustom, custom: j.custom ?? [], hp: j.hp });
        setAddName(''); router.refresh();
      } catch { setMsg('Network error — please try again.'); setTranspose(null); } finally { setBusy(null); }
      return;
    }
    setBusy('__add'); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', system: addSystem, kind: addKind, name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not add sheet.'); return; }
      setAdding(false); setAddName(''); router.refresh();
    } catch { setMsg('Network error — please try again.'); } finally { setBusy(null); }
  }

  const active = activeSystem || SYSTEM_AMBIGUOUS;
  const built = new Set(builtSystems.map((s) => s || SYSTEM_AMBIGUOUS));
  // Under-construction systems are HIDDEN entirely (owner 2026-07-18) — they can't be a build/transpose
  // target. The list is ambiguous + the four playable systems + (defensively) the character's current system
  // if it somehow sits on a hidden one, so a legacy character never shows a blank active system.
  const all = [SYSTEM_AMBIGUOUS, ...GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key) || s.key === active).map((s) => s.key)];

  const selectable = (system: string) => system === SYSTEM_AMBIGUOUS || system === active || isSystemAvailable(system);

  // Decide whether to run now or ask for custom-content consent first (TR2).
  function go(system: string) {
    if (system === active || busy || !selectable(system)) return;
    const isTranspose = !built.has(system);
    if (!isTranspose) { runChange(system, false); return; } // instant switch to a saved sheet — no AI, no consent
    if (!aiConfigured) { setMsg('AI is not configured — cannot transpose to a new system.'); return; }
    if (allowCustom) { setConsent(system); return; } // custom is permitted → ask before the AI invents anything
    runChange(system, false); // custom not allowed here → best-effort vanilla-only transpose
  }

  // Perform the switch/transpose. `useCustom` tells the AI it may create balanced custom content (TR3).
  async function runChange(system: string, useCustom: boolean) {
    setConsent(null);
    if (busy) return;
    const isTranspose = !built.has(system);
    setBusy(system); setMsg(null);
    if (isTranspose) setTranspose({ system, phase: 'working' });
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, allowCustom: useCustom }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not change system.'); setTranspose(null); setBusy(null); return; }
      // Obvious completion notification, carrying the AI's summary (what it built, incl. any CUSTOM: pieces).
      if (isTranspose) setTranspose({ system, phase: 'done', summary: j.summary ?? null, allowedCustom: j.allowedCustom, custom: j.custom ?? [], hp: j.hp });
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
      setTranspose(null);
    } finally {
      setBusy(null);
    }
  }

  // The active sheet (MV3) — its name + kind label shown on the switcher header so you always know which of
  // the character's sheets is live.
  const activeSheet = sheets.find((s) => s.active);
  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={styles.hexBtn}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          ◆ Game system — {systemLabel(active)}
          {activeSheet && (
            <span style={{ fontSize: 9.5, color: activeSheet.kind === 'custom' ? 'var(--hx-gold-2)' : 'var(--hx-muted)', border: '1px solid currentColor', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--hx-font-body)' }}>
              {activeSheet.kind === 'custom' ? 'CUSTOM' : 'VANILLA'}
            </span>
          )}
        </span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{open ? 'Hide' : 'Switch / transpose'}</span>
      </button>
      {activeSheet && sheets.length > 1 && (
        // When the character has more than one sheet, name the active one so it's unmistakable which is live.
        <div style={{ fontSize: 11.5, color: 'var(--hx-muted)', marginTop: 4 }}>Active sheet: <strong style={{ color: 'var(--hx-text)' }}>{activeSheet.name}</strong></div>
      )}
      {open && (
        <>
          <p style={{ margin: '10px 0 8px', fontSize: 12.5, color: 'var(--hx-muted)' }}>
            This character can hold several sheets — even more than one per system (a vanilla build and a
            custom build). Switch between them below, add a new one, or transpose into a new system.
          </p>

          {/* Your sheets (Area MV2c) — every sheet the character holds, each switchable; add a new one. */}
          {sheets.length > 0 && (
            <div style={{ display: 'grid', gap: 9, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>Your sheets</span>
                <button type="button" className={`${styles.hexBtn} ${adding ? '' : styles.hexBtnPrimary}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setAdding((a) => !a)} disabled={!!busy}>
                  {adding ? '× Cancel' : '＋ Add sheet'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {sheets.map((sh) => editingSlot === sh.slotId ? (
                  // Inline rename (Area MV).
                  <span key={sh.slotId} className={styles.sheetChip} style={{ borderColor: 'var(--hx-gold-1)' }}>
                    <input autoFocus value={editSlotName} onChange={(e) => setEditSlotName(e.target.value)} placeholder="Sheet name" maxLength={60}
                      onKeyDown={(e) => { if (e.key === 'Enter') slotAction(sh.slotId, { action: 'rename', name: editSlotName }); if (e.key === 'Escape') setEditingSlot(null); }}
                      className={`${styles.input} ${styles.sheetControl}`} style={{ width: 150 }} />
                    <button type="button" className={styles.chipIcon} title="Save name" onClick={() => slotAction(sh.slotId, { action: 'rename', name: editSlotName })} disabled={!!busy}>✓</button>
                    <button type="button" className={styles.chipIcon} title="Cancel" onClick={() => setEditingSlot(null)}>×</button>
                  </span>
                ) : (
                  <span key={sh.slotId} className={`${styles.sheetChip} ${sh.active ? styles.sheetChipActive : ''}`}>
                    <button
                      type="button"
                      disabled={sh.active || !!busy}
                      onClick={() => !sh.active && switchSlot(sh.slotId)}
                      title={sh.active ? 'The active sheet' : `Switch to “${sh.name}”`}
                      className={styles.sheetChipMain}
                    >
                      {sh.active && <span aria-hidden style={{ fontSize: 8, color: 'var(--hx-teal-1)' }}>●</span>}
                      <span style={{ fontWeight: sh.active ? 600 : 400 }}>{sh.name}</span>
                      <span className={`${styles.kindPill} ${sh.kind === 'custom' ? styles.kindCustom : styles.kindVanilla}`}>
                        {sh.kind === 'custom' ? 'CUSTOM' : 'VANILLA'}
                      </span>
                      {busy === sh.slotId && <span style={{ fontSize: 10 }}>…</span>}
                    </button>
                    {/* Rename any sheet; delete only a non-active one (switch away first). */}
                    <button type="button" className={styles.chipIcon} title="Rename this sheet" onClick={() => { setEditingSlot(sh.slotId); setEditSlotName(sh.name); }} disabled={!!busy}>✎</button>
                    {!sh.active && (
                      <button type="button" className={`${styles.chipIcon} ${styles.chipIconDanger}`} title="Delete this sheet" onClick={() => setConfirmDelete({ slotId: sh.slotId, name: sh.name })} disabled={!!busy}>✕</button>
                    )}
                  </span>
                ))}
              </div>
              {adding && (
                <div className={styles.sheetAddCard}>
                  <div className={styles.sheetAddHead}>◆ Add a new sheet</div>
                  <div className={styles.sheetAddGrid}>
                    <label className={styles.sheetField}>
                      <span className={styles.sheetFieldLabel}>Game system</span>
                      <select value={addSystem} onChange={(e) => setAddSystem(e.target.value)} className={`${styles.input} ${styles.sheetControl}`}>
                        {GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key)).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className={styles.sheetField}>
                      <span className={styles.sheetFieldLabel}>Sheet name <span style={{ opacity: 0.6, letterSpacing: 0 }}>(optional)</span></span>
                      <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={`e.g. ${systemLabel(addSystem)} · ${addKind === 'custom' ? 'Custom-built' : 'Vanilla'}`} maxLength={60}
                        onKeyDown={(e) => { if (e.key === 'Enter' && busy !== '__add') addSheet(); }}
                        className={`${styles.input} ${styles.sheetControl}`} />
                    </label>
                  </div>
                  <div className={styles.sheetAddGrid}>
                    <div className={styles.sheetField}>
                      <span className={styles.sheetFieldLabel}>Content</span>
                      <div className={styles.segmented} role="group" aria-label="Sheet content type">
                        <button type="button" aria-pressed={addKind === 'vanilla'} onClick={() => setAddKind('vanilla')}
                          className={`${styles.segment} ${addKind === 'vanilla' ? `${styles.segmentOn} ${styles.segmentVanilla}` : ''}`}>
                          📖 Vanilla
                        </button>
                        <button type="button" aria-pressed={addKind === 'custom'} onClick={() => setAddKind('custom')}
                          className={`${styles.segment} ${addKind === 'custom' ? `${styles.segmentOn} ${styles.segmentCustom}` : ''}`}>
                          ✦ Custom
                        </button>
                      </div>
                    </div>
                    <div className={styles.sheetField}>
                      <span className={styles.sheetFieldLabel}>Start from</span>
                      <div className={styles.segmented} role="group" aria-label="How to build the sheet">
                        <button type="button" aria-pressed={addMethod === 'blank'} onClick={() => setAddMethod('blank')}
                          className={`${styles.segment} ${addMethod === 'blank' ? `${styles.segmentOn} ${styles.segmentVanilla}` : ''}`}>
                          ▢ Blank
                        </button>
                        <button type="button" aria-pressed={addMethod === 'transpose'} onClick={() => setAddMethod('transpose')} disabled={!aiConfigured}
                          title={aiConfigured ? 'The AI rebuilds this character in the chosen system' : 'AI is not configured'}
                          className={`${styles.segment} ${addMethod === 'transpose' ? `${styles.segmentOn} ${styles.segmentCustom}` : ''}`} style={!aiConfigured ? { opacity: 0.5, cursor: 'default' } : undefined}>
                          ✨ AI transpose
                        </button>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--hx-muted)', lineHeight: 1.45 }}>
                    {addMethod === 'transpose'
                      ? `The AI reads ${systemLabel(addSystem)}’s rules and rebuilds this character as a new ${addKind === 'custom' ? 'custom-content' : 'vanilla'} sheet — your other sheets are kept.`
                      : addKind === 'custom'
                        ? 'A blank sheet you can build with homebrew classes, feats and content.'
                        : 'A blank sheet built strictly from the system’s official rules.'}
                  </span>
                  <div className={styles.sheetAddActions}>
                    <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ padding: '7px 18px', fontSize: 12.5 }} onClick={addSheet} disabled={busy === '__add'}>
                      {busy === '__add' ? (addMethod === 'transpose' ? 'Building…' : 'Adding…') : addMethod === 'transpose' ? '✨ Build sheet' : '＋ Create sheet'}
                    </button>
                    <button type="button" className={styles.hexBtn} style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setAdding(false)} disabled={busy === '__add'}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delete confirmation (Area MV, owner request) — a themed in-app popup, not the browser confirm. */}
          {confirmDelete && (
            <div role="dialog" aria-label="Delete this sheet?" style={{ margin: '0 0 10px', padding: '12px 14px', border: '1px solid var(--hx-danger)', borderRadius: 8, background: 'rgba(198,64,59,0.1)', display: 'grid', gap: 10 }}>
              <div>
                <strong style={{ color: 'var(--hx-danger)', fontFamily: 'var(--hx-font-display)' }}>Delete “{confirmDelete.name}”?</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
                  This permanently removes this sheet from the character. It can’t be undone. Your other sheets are kept.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={styles.hexBtn} style={{ padding: '6px 16px', borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)' }}
                  onClick={() => { const d = confirmDelete; setConfirmDelete(null); slotAction(d.slotId, { action: 'delete' }, `Deleted “${d.name}”.`); }} disabled={!!busy}>
                  {busy === confirmDelete.slotId ? 'Deleting…' : 'Delete sheet'}
                </button>
                <button type="button" className={styles.hexBtn} style={{ padding: '6px 16px' }} onClick={() => setConfirmDelete(null)} disabled={!!busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)', marginBottom: 4 }}>Systems</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {all.map((s) => {
              const on = s === active;
              const has = built.has(s);
              const canPick = selectable(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!!busy || on || !canPick}
                  onClick={() => go(s)}
                  title={
                    on ? 'Active system'
                    : !canPick ? 'Under construction — this system isn\'t built out yet'
                    : has ? 'Switch to your saved sheet for this system'
                    : 'Transpose (AI builds a sheet in this system)'
                  }
                  style={{
                    padding: '7px 11px',
                    borderRadius: 999,
                    border: on ? '2px solid var(--hx-teal-1)' : `1px solid ${has ? 'var(--hx-gold-2)' : 'var(--hx-line)'}`,
                    background: on ? 'rgba(10,200,185,0.14)' : has ? 'rgba(200,170,110,0.08)' : 'transparent',
                    color: canPick ? 'var(--hx-text)' : 'var(--hx-muted)',
                    cursor: busy || on || !canPick ? 'default' : 'pointer',
                    opacity: !canPick ? 0.6 : 1,
                    fontSize: 12.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {systemLabel(s)}
                  {on ? <span style={{ fontSize: 10, color: 'var(--hx-teal-1)' }}>● ACTIVE</span>
                    : !canPick ? <span style={{ fontSize: 10, color: 'var(--hx-muted)' }}>🚧 soon</span>
                    : has ? <span style={{ fontSize: 10, color: 'var(--hx-gold-2)' }}>saved</span>
                    : <span style={{ fontSize: 10, color: 'var(--hx-muted)' }}>+ transpose</span>}
                  {busy === s && <span style={{ fontSize: 10 }}>…</span>}
                </button>
              );
            })}
          </div>
          {/* Custom-content consent (TR2) — before an AI transpose, when custom is allowed, ask whether the
              AI may create balanced custom content to fit the character, or build vanilla-only. */}
          {consent && (
            <div role="dialog" aria-label="Allow custom content?" style={{ margin: '10px 0 0', padding: '12px 14px', border: '1px solid var(--hx-gold-1)', borderRadius: 8, background: 'rgba(212,175,55,0.08)', display: 'grid', gap: 10 }}>
              <div>
                <strong style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' }}>Transpose into {systemLabel(consent)} — allow custom content?</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
                  The AI will build this character with {systemLabel(consent)}’s <strong>vanilla</strong> rules as far as
                  possible. To fully preserve the character’s abilities and vibe it may need to create some balanced
                  <strong> custom</strong> classes, ancestries, feats, or abilities — each validated against the system.
                  Is that OK, or should it stay strictly vanilla?
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ padding: '6px 14px' }} onClick={() => runChange(consent, true)}>
                  Yes — allow balanced custom content
                </button>
                <button type="button" className={styles.hexBtn} style={{ padding: '6px 14px' }} onClick={() => runChange(consent, false)}>
                  No — vanilla only
                </button>
                <button type="button" className={styles.hexBtn} style={{ padding: '6px 14px', opacity: 0.8 }} onClick={() => setConsent(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Transpose progress + completion (TR1) — a working state that obviously reads as "the AI is
              building", then a clear done notification. */}
          {transpose?.phase === 'working' && (
            <div style={{ margin: '10px 0 0', padding: '10px 12px', border: '1px solid var(--hx-teal-2)', borderRadius: 8, background: 'rgba(10,200,185,0.06)', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={styles.spinner} aria-hidden />
                <div>
                  <strong style={{ color: 'var(--hx-teal-1)', fontFamily: 'var(--hx-font-display)' }}>Transposing into {systemLabel(transpose.system)}…</strong>
                  <div style={{ fontSize: 12, color: 'var(--hx-muted)' }}>The AI is reading {systemLabel(transpose.system)}’s rules and rebuilding the character. Your other versions are kept.</div>
                </div>
              </div>
              <div className={styles.transposeBar} />
            </div>
          )}
          {transpose?.phase === 'done' && (
            <div role="status" style={{ margin: '10px 0 0', padding: '10px 12px', border: '1px solid var(--hx-gold-1)', borderRadius: 8, background: 'rgba(212,175,55,0.1)', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' }}>✓ Transposed into {systemLabel(transpose.system)} — now active!</strong>
                <button type="button" className={styles.hexBtn} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setTranspose(null)}>Dismiss</button>
              </div>
              {transpose.summary && (
                // What the AI built — the vanilla mapping + a note on any custom pieces (TR1/TR3).
                <p style={{ margin: 0, fontSize: 12, color: 'var(--hx-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{transpose.summary}</p>
              )}
              {typeof transpose.hp === 'number' && (
                <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Built at <strong style={{ color: 'var(--hx-text)' }}>{transpose.hp} HP</strong> for the character’s level.</span>
              )}
              {transpose.custom && transpose.custom.length > 0 && (
                // Every AI-INVENTED (non-vanilla) element, so it's unmistakable what is homebrew (owner request).
                <div style={{ border: '1px solid var(--hx-gold-1)', borderRadius: 7, background: 'rgba(212,175,55,0.06)', padding: '8px 10px', display: 'grid', gap: 5 }}>
                  <strong style={{ fontSize: 11.5, color: 'var(--hx-gold-2)', letterSpacing: '0.04em' }}>
                    ✦ {transpose.custom.length} custom {transpose.custom.length === 1 ? 'element' : 'elements'} created (not vanilla to {systemLabel(transpose.system)})
                  </strong>
                  <ul style={{ margin: 0, padding: '0 0 0 2px', listStyle: 'none', display: 'grid', gap: 4 }}>
                    {transpose.custom.map((c, i) => (
                      <li key={i} style={{ fontSize: 11.5, color: 'var(--hx-text)', lineHeight: 1.4 }}>
                        <span style={{ fontSize: 9, color: 'var(--hx-gold-2)', border: '1px solid currentColor', borderRadius: 3, padding: '0 4px', marginRight: 5, textTransform: 'uppercase' }}>{c.type}</span>
                        <strong>{c.name}</strong>
                        {c.note && <span style={{ color: 'var(--hx-muted)' }}> — {c.note}</span>}
                      </li>
                    ))}
                  </ul>
                  <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>These are flagged as customized on the sheet for DM review.</span>
                </div>
              )}
            </div>
          )}
          {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
