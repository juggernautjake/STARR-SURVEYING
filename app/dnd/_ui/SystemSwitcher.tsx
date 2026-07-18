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
  aiConfigured,
  allowCustom = true,
}: {
  characterId: string;
  activeSystem: string;
  builtSystems: string[];
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
  const [transpose, setTranspose] = useState<{ system: string; phase: 'working' | 'done' } | null>(null);
  // The system awaiting the custom-content consent decision (Area TR2).
  const [consent, setConsent] = useState<string | null>(null);

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
      if (isTranspose) setTranspose({ system, phase: 'done' }); // obvious completion notification
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
      setTranspose(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={styles.hexBtn}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Game system — {systemLabel(active)}</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{open ? 'Hide' : 'Switch / transpose'}</span>
      </button>
      {open && (
        <>
          <p style={{ margin: '10px 0 8px', fontSize: 12.5, color: 'var(--hx-muted)' }}>
            This character can hold a separate sheet per system. Switch instantly between the ones you’ve built,
            or transpose into a new system — the AI rebuilds the character under that system’s rules only, and
            your other versions are kept.
          </p>
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
            <div role="status" style={{ margin: '10px 0 0', padding: '10px 12px', border: '1px solid var(--hx-gold-1)', borderRadius: 8, background: 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' }}>✓ Transposed into {systemLabel(transpose.system)} — now active!</strong>
              <button type="button" className={styles.hexBtn} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setTranspose(null)}>Dismiss</button>
            </div>
          )}
          {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
