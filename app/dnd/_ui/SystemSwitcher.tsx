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
}: {
  characterId: string;
  activeSystem: string;
  builtSystems: string[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const active = activeSystem || SYSTEM_AMBIGUOUS;
  const built = new Set(builtSystems.map((s) => s || SYSTEM_AMBIGUOUS));
  // Every system the character can hold: ambiguous + the seeded systems.
  const all = [SYSTEM_AMBIGUOUS, ...GAME_SYSTEMS.map((s) => s.key)];

  // Under-construction systems are offered but not selectable yet — you can't switch a character INTO
  // one until it's built out (its rules/classes aren't ready). The active system always stays usable.
  const selectable = (system: string) => system === SYSTEM_AMBIGUOUS || system === active || isSystemAvailable(system);

  async function go(system: string) {
    if (system === active || busy || !selectable(system)) return;
    const isTranspose = !built.has(system);
    if (isTranspose && !aiConfigured) { setMsg('AI is not configured — cannot transpose to a new system.'); return; }
    setBusy(system); setMsg(isTranspose ? `Transposing into ${systemLabel(system)}…` : null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'Could not change system.'); setBusy(null); return; }
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
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
          {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--hx-muted)' }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
