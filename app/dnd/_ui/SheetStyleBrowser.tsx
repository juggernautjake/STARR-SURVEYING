// app/dnd/_ui/SheetStyleBrowser.tsx — browse & pick a sheet style (Phase V, Slice 7).
//
// A gallery of the selectable registry skins (Hextech default, Neon Odyssey, Streamer,
// Candy Bazaar, Homebrew Rulebook) with a live preview swatch. The owner or DM (so this
// also covers DM-owned NPCs) picks one; it PATCHes the character's `sheet_type` and
// refreshes so the sheet re-renders on the chosen skin. Every style works with every
// game system. Collapsed by default so it doesn't crowd the sheet.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SHEET_STYLES } from '@/lib/dnd/sheet-styles';
import styles from './hextech.module.css';

export default function SheetStyleBrowser({ characterId, current }: { characterId: string; current?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // `generic` is the legacy alias for the Hextech default — show it as `default` selected.
  const active = current === 'generic' ? 'default' : current;

  async function pick(id: string) {
    if (id === active || busy) return;
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet_type: id }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? 'Could not switch style.'); setBusy(null); return; }
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
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>◆ Sheet style</span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{open ? 'Hide' : 'Browse styles'}</span>
      </button>
      {open && (
        <>
          <p style={{ margin: '10px 0 8px', fontSize: 12.5, color: 'var(--hx-muted)' }}>
            Pick a look for this character sheet. Every style works with every game system, and you can switch any time.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            {SHEET_STYLES.map((s) => {
              const on = s.id === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => pick(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: 0,
                    border: on ? '2px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: busy ? 'wait' : 'pointer',
                    background: 'transparent',
                    boxShadow: on ? '0 0 12px rgba(10,200,185,0.35)' : 'none',
                  }}
                >
                  {/* Preview swatch — a mini card in the style's palette. */}
                  <div style={{ background: s.swatch.bg, padding: 10 }}>
                    <div
                      style={{
                        background: s.swatch.panel,
                        border: `1px solid ${s.swatch.gold}`,
                        borderRadius: 5,
                        padding: '8px 9px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ height: 5, width: '55%', borderRadius: 3, background: s.swatch.gold }} />
                      <div style={{ display: 'flex', gap: 5 }}>
                        <span style={{ height: 12, width: 12, borderRadius: '50%', background: s.swatch.accent }} />
                        <span style={{ height: 12, flex: 1, borderRadius: 3, background: s.swatch.accent, opacity: 0.35 }} />
                      </div>
                      <div style={{ height: 4, width: '80%', borderRadius: 2, background: s.light ? '#0003' : '#fff2' }} />
                      <div style={{ height: 4, width: '65%', borderRadius: 2, background: s.light ? '#0003' : '#fff2' }} />
                    </div>
                  </div>
                  <div style={{ padding: '7px 9px 9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 13, color: 'var(--hx-gold-2)' }}>{s.label}</strong>
                      {on && <span style={{ fontSize: 10.5, color: 'var(--hx-teal-1)' }}>● ACTIVE</span>}
                      {busy === s.id && <span style={{ fontSize: 10.5, color: 'var(--hx-muted)' }}>…</span>}
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.35 }}>{s.blurb}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--hx-danger, #c8413f)' }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
