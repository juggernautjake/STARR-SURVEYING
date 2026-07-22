'use client';
// TemplateBrowser — the page-chrome picker for the TEMPLATE (format) axis. The owner's #1 named
// gap: "there doesn't seem to be an interface for switching templates easily like we can with color
// skins." This is that interface, and it is the deliberate TWIN of `SheetStyleBrowser` (the skin
// picker) — same framed panel, same open/close, same per-card selection — so the two sit side by
// side and read as the same KIND of choice: skin changes the colours, template changes the layout.
//
// It offers only the templates the character's system can actually render (from
// `templatesForSystem`), so a format a system has no shell for yet is simply not shown rather than
// offered and broken. Selecting one POSTs to the /layout endpoint (which sets `data.sheetLayout`)
// and refreshes, and the sheet re-renders in the new format.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { templatesForSystem } from '@/lib/dnd/sheet-templates';
import styles from './hextech.module.css';
import FormatPreview from './FormatPreview';

export default function TemplateBrowser({
  characterId,
  system,
  current,
}: {
  characterId: string;
  system: string;
  /** The character's current `sheetLayout`; defaults to 'classic'. */
  current?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const templates = templatesForSystem(system);
  const active = current && templates.some((t) => t.id === current) ? current : 'classic';

  // A single-option picker is not a choice — hide the whole panel until a system has more than one
  // built format, so it never reads as a dead control (the mistake the skin picker avoids too).
  if (templates.length < 2) return null;

  async function pick(id: string) {
    if (id === active || busy) return;
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/layout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: id }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? 'Could not switch template.'); setBusy(null); return; }
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(null);
    }
  }

  const activeLabel = templates.find((t) => t.id === active)?.label ?? 'Classic';

  return (
    <div className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={styles.hexBtn}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
          ◆ Template — {activeLabel}
        </span>
        <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>{open ? 'Hide' : 'Change layout'}</span>
      </button>

      {open && (
        <>
          <p style={{ margin: '10px 0 10px', fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
            A template is the LAYOUT — where the sections of your sheet sit and how they are arranged.
            Every template works with every colour skin; pick the one you like best.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {templates.map((t) => {
              const on = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => pick(t.id)}
                  aria-pressed={on}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                    border: on ? '2px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
                    background: on ? 'rgba(10,200,185,0.10)' : 'rgba(1,10,19,0.35)',
                    color: 'var(--hx-text)', display: 'grid', gap: 6,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontFamily: 'var(--hx-font-display)', fontSize: 14, color: on ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)' }}>{t.label}</strong>
                    {on && <span style={{ fontSize: 10, color: 'var(--hx-teal-1)' }}>● ACTIVE</span>}
                    {busy === t.id && <span style={{ fontSize: 10 }}>…</span>}
                  </span>
                  {/* A visual mini-diagram of the layout — the template axis's answer to the skin
                      swatch, so the FORMAT reads at a glance the way a colour does. The ASCII
                      `wireframe` rides along as the screen-reader label. */}
                  <span role="img" aria-label={`${t.label} layout: ${t.wireframe.replace(/\n/g, ', ')}`}>
                    <FormatPreview id={t.id} />
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.4 }}>{t.blurb}</span>
                </button>
              );
            })}
          </div>
          {msg && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--hx-danger)' }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
