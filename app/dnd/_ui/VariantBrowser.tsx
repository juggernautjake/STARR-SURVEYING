'use client';
// VariantBrowser — the character VERSIONS picker (VT). A dropdown section (same framedPanel idiom as the
// STYLE·TEMPLATE·THEME chrome) that lists every version of a character as lobby-style cards: portrait, name,
// system, per-class level line, tags and an AI summary tooltip. The version being viewed is highlighted;
// clicking another switches to it (reload). The highlighted card can branch a NEW variant (git-like), which
// drops the user into the editor on the fork. Up to 20 versions; at the cap, creating one is blocked with a
// message to delete another first.
import { useEffect, useRef, useState } from 'react';
import styles from './hextech.module.css';
import { VARIANT_TAG_COLORS, type VariantTag } from '@/lib/dnd/variant-tags';
import type { VariantCard } from '@/lib/dnd/variant-view';
import { MAX_VARIANTS } from '@/lib/dnd/system-variants';
import EditFlow, { type EditFlowSystem } from './EditFlow';

export default function VariantBrowser({
  characterId, cards, aiConfigured = false, canWrite = true, transposeSystems = [], startOpen = false,
}: {
  characterId: string;
  cards: VariantCard[];
  aiConfigured?: boolean;
  canWrite?: boolean;
  /** Playable systems the Edit→Transpose step can target (the current one is filtered out per card). */
  transposeSystems?: EditFlowSystem[];
  /** Open the panel expanded on mount (used by the preview harness). */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState<string | null>(null); // slotId:action while a request is in flight
  const [err, setErr] = useState<string | null>(null);
  const [openSummary, setOpenSummary] = useState<string | null>(null); // slotId whose summary popover is open
  const [editing, setEditing] = useState<{ slotId: string; name: string; system: string } | null>(null);
  const [renaming, setRenaming] = useState<{ slotId: string; value: string } | null>(null); // inline rename
  // Locally-updated summaries (from refresh/auto-generate) so we can show them without a full reload.
  const [summaries, setSummaries] = useState<Record<string, { summary: string; updatedAt: string | null; stale: boolean }>>({});
  const autoFired = useRef(false);

  const atCap = cards.length >= MAX_VARIANTS;
  const activeCard = cards.find((c) => c.active) ?? null;

  const summaryOf = (c: VariantCard) => summaries[c.slotId] ?? { summary: c.summary ?? '', updatedAt: c.summaryUpdatedAt, stale: c.summaryStale };

  async function generateSummary(slotId: string, silent = false) {
    if (!aiConfigured) return;
    if (!silent) { setBusy(`${slotId}:summary`); setErr(null); }
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summary', slotId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.summary) setSummaries((s) => ({ ...s, [slotId]: { summary: j.summary, updatedAt: j.summaryUpdatedAt ?? null, stale: false } }));
      else if (!silent) setErr(j.error ?? 'Could not generate a summary.');
    } catch { if (!silent) setErr('Network error — please try again.'); }
    finally { if (!silent) setBusy(null); }
  }

  // "Saved after changes / on create" freshness: when the viewed version's summary is missing or has gone
  // stale since the last edit, regenerate it once on load. Staleness only becomes true after a real save, so
  // an unchanged sheet reloaded repeatedly costs nothing.
  useEffect(() => {
    if (autoFired.current || !aiConfigured || !canWrite || !activeCard) return;
    const cur = summaryOf(activeCard);
    if (!cur.summary || cur.stale) { autoFired.current = true; void generateSummary(activeCard.slotId, true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfigured, canWrite, activeCard?.slotId]);

  async function switchTo(slotId: string) {
    setBusy(`${slotId}:switch`); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not switch to that version.'); setBusy(null); return; }
      window.location.reload();
    } catch { setErr('Network error — please try again.'); setBusy(null); }
  }

  async function createVariant(fromSlotId: string) {
    if (atCap) { setErr(`You’ve hit the ${MAX_VARIANTS}-version limit. Delete a version to make room.`); return; }
    setBusy(`${fromSlotId}:fork`); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fork', fromSlotId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'Could not create a variant.'); setBusy(null); return; }
      window.location.reload(); // the fork is now the active sheet — the user lands in the editor on it
    } catch { setErr('Network error — please try again.'); setBusy(null); }
  }

  /** Rename a version in place (consolidation: the last of SystemSwitcher's switch/rename/delete trio to
   *  land here, so the versions picker is capability-complete before that panel can be retired). */
  async function renameVariant(slotId: string, name: string) {
    const next = name.trim();
    if (!next) { setRenaming(null); return; }
    setBusy(`${slotId}:rename`); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', slotId, name: next }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not rename that version.'); setBusy(null); return; }
      window.location.reload();
    } catch { setErr('Network error — please try again.'); setBusy(null); }
  }

  async function deleteVariant(slotId: string) {
    setBusy(`${slotId}:delete`); setErr(null);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/system`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', slotId }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not delete that version.'); setBusy(null); return; }
      window.location.reload();
    } catch { setErr('Network error — please try again.'); setBusy(null); }
  }

  const tagChip = (t: VariantTag, i: number) => {
    const c = VARIANT_TAG_COLORS[t.tone];
    return (
      <span key={`${t.label}:${i}`} style={{
        display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 999, fontSize: 10,
        lineHeight: 1.5, fontWeight: 600, letterSpacing: '0.02em',
        background: c.bg, border: `1px solid ${c.border}`, color: c.fg, whiteSpace: 'nowrap',
      }}>{t.label}</span>
    );
  };

  const iconBtn = (label: string, onClick: () => void, opts: { title: string; disabled?: boolean; danger?: boolean } = { title: '' }) => (
    <button type="button" title={opts.title} disabled={!!busy || opts.disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: busy || opts.disabled ? 'default' : 'pointer',
        border: `1px solid ${opts.danger ? 'var(--hx-danger, #ff6b6b)' : 'var(--hx-line, rgba(255,255,255,0.14))'}`,
        background: 'rgba(255,255,255,0.03)', color: opts.danger ? '#ff9d9d' : 'var(--hx-text, #e8e0cf)',
        opacity: busy || opts.disabled ? 0.5 : 1,
      }}>{label}</button>
  );

  return (
    <details className={styles.framedPanel} style={{ margin: '10px 0', padding: '10px 14px' }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', letterSpacing: '0.08em' }}>
        VERSIONS //
        <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--hx-muted)', marginLeft: 8 }}>
          {cards.length} of {MAX_VARIANTS} · every version of this character{atCap ? ' · limit reached' : ''}
        </span>
      </summary>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginTop: 10 }}>
        {cards.map((c) => {
          const sum = summaryOf(c);
          const showSummary = openSummary === c.slotId;
          const canDelete = !c.active && !c.origin;
          return (
            <div
              key={c.slotId}
              onClick={() => { if (!c.active && canWrite) switchTo(c.slotId); }}
              className={styles.framedPanel}
              style={{
                position: 'relative', padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center',
                cursor: c.active || !canWrite ? 'default' : 'pointer',
                outline: c.active ? '2px solid var(--hx-gold-3, #e5c07b)' : 'none',
                boxShadow: c.active ? '0 0 14px rgba(229,192,123,0.35)' : undefined,
              }}
            >
              {/* Portrait — the variant's own image, else a first-letter monogram (mirrors the lobby card). */}
              {c.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={c.active ? styles.portraitActive : styles.portrait} src={c.artUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span className={c.active ? styles.portraitActive : styles.portrait} style={{ width: 72, height: 72, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)' }}>
                  {(c.name || '?').charAt(0).toUpperCase()}
                </span>
              )}

              {/* width:100% + minWidth:0 so the inline rename input shrinks to the card instead of widening
                  it — an auto-width grid sizes to the input's content and the row overhangs the card edge. */}
              <div style={{ display: 'grid', gap: 2, width: '100%', minWidth: 0 }}>
                {renaming?.slotId === c.slotId ? (
                  // Inline rename — committed on Enter or ✓, abandoned on Escape. Click-through to the
                  // card's switch handler is stopped so typing a name can't swap the version under you.
                  <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      autoFocus value={renaming.value} maxLength={60}
                      onChange={(e) => setRenaming({ slotId: c.slotId, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameVariant(c.slotId, renaming.value);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      aria-label={`Rename ${c.name}`}
                      style={{ width: '100%', minWidth: 0, fontSize: 12.5, padding: '3px 6px', borderRadius: 5, background: 'rgba(1,10,19,0.7)', border: '1px solid var(--hx-gold-1, #c8aa6e)', color: 'var(--hx-text, #e8e0cf)' }}
                    />
                    <button type="button" title="Save name" onClick={() => renameVariant(c.slotId, renaming.value)} disabled={!!busy}
                      style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--hx-gold-2, #c8aa6e)', background: 'transparent', color: 'var(--hx-gold-2, #c8aa6e)' }}>✓</button>
                    <button type="button" title="Cancel" onClick={() => setRenaming(null)}
                      style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--hx-muted)' }}>×</button>
                  </span>
                ) : (
                  <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 14.5, color: 'var(--hx-gold-2)', wordBreak: 'break-word', lineHeight: 1.2 }}>{c.name}</span>
                )}
                {/* The system is NOT repeated here — it's already a tag below, and printing it twice on a
                    210px card cost a line for nothing. Tags are the one place system/kind/lineage live. */}
                <span style={{ fontSize: 11.5, color: 'var(--hx-teal-1)' }}>{c.levelLabel}</span>
                {c.parentName && !c.origin && <span style={{ fontSize: 10, color: 'var(--hx-muted)', fontStyle: 'italic' }}>branched from {c.parentName}</span>}
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                {c.tags.map(tagChip)}
              </div>

              {/* Actions row */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                <button type="button" title="Show summary" onClick={(e) => { e.stopPropagation(); setOpenSummary(showSummary ? null : c.slotId); }}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--hx-teal-1, #0ac8b9)', background: 'rgba(10,200,185,0.10)', color: 'var(--hx-teal-1, #0ac8b9)' }}>
                  {sum.stale ? 'ⓘ Summary ·' : 'ⓘ Summary'}{sum.stale ? <span style={{ color: '#f0dd8a' }}> stale</span> : null}
                </button>
                {canWrite && iconBtn('✎ Edit', () => setEditing({ slotId: c.slotId, name: c.name, system: c.system }), { title: `Edit ${c.name} — directly, or transpose to another system` })}
                {canWrite && iconBtn(busy === `${c.slotId}:rename` ? '…' : '✎ Name', () => setRenaming({ slotId: c.slotId, value: c.name }), { title: `Rename this version (currently “${c.name}”)` })}
                {canWrite && iconBtn(busy === `${c.slotId}:fork` ? 'Creating…' : '+ Variant', () => createVariant(c.slotId), { title: atCap ? 'Version limit reached — delete one first' : `Branch a new variant from ${c.name}`, disabled: atCap })}
                {canWrite && canDelete && iconBtn(busy === `${c.slotId}:delete` ? '…' : '✕', () => deleteVariant(c.slotId), { title: 'Delete this version', danger: true })}
              </div>

              {/* Summary tooltip — FLOATS over the grid rather than expanding the card. Growing the card
                  pushed every other card's row down and made the whole picker jump, which is exactly what
                  you don't want from a peek at one version. Anchored above the card, centred, with a gold
                  arrow; on a narrow card it still gets a readable minimum width by overhanging. */}
              {showSummary && (
                <div role="tooltip" onClick={(e) => e.stopPropagation()} style={{
                  position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                  width: 'max(100%, 240px)', maxWidth: '82vw', zIndex: 30,
                  padding: '9px 11px', borderRadius: 8, textAlign: 'left',
                  background: 'linear-gradient(180deg, rgba(6,20,32,0.98), rgba(1,10,19,0.98))',
                  border: '1px solid var(--hx-gold-1, #c8aa6e)',
                  boxShadow: '0 10px 26px rgba(0,0,0,0.6), inset 0 0 22px rgba(200,155,60,0.05)',
                }}>
                  {/* Arrow: a rotated square straddling the bottom border, so the border reads continuous. */}
                  <span aria-hidden style={{
                    position: 'absolute', bottom: -5, left: '50%', width: 9, height: 9, marginLeft: -4.5,
                    transform: 'rotate(45deg)', background: 'rgba(1,10,19,0.98)',
                    borderRight: '1px solid var(--hx-gold-1, #c8aa6e)', borderBottom: '1px solid var(--hx-gold-1, #c8aa6e)',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' }}>Summary</span>
                    <button type="button" aria-label="Close summary" onClick={(e) => { e.stopPropagation(); setOpenSummary(null); }}
                      style={{ fontSize: 13, lineHeight: 1, background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
                  {sum.summary ? (
                    <>
                      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--hx-text, #e8e0cf)' }}>{sum.summary}</p>
                      {sum.updatedAt && <p style={{ margin: '5px 0 0', fontSize: 10, color: 'var(--hx-muted)' }}>Updated {new Date(sum.updatedAt).toLocaleString()}{sum.stale ? ' · out of date' : ''}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--hx-muted)' }}>{aiConfigured ? 'No summary yet.' : 'AI summaries are unavailable.'}</p>
                  )}
                  {canWrite && aiConfigured && (
                    <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); generateSummary(c.slotId); }}
                      style={{ marginTop: 6, fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: busy ? 'default' : 'pointer', border: '1px solid var(--hx-line)', background: 'rgba(255,255,255,0.04)', color: 'var(--hx-text)' }}>
                      {busy === `${c.slotId}:summary` ? 'Generating…' : sum.summary ? (sum.stale ? 'Update summary' : 'Regenerate') : 'Generate summary'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {err && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
      {atCap && <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--hx-muted)' }}>This character has the maximum {MAX_VARIANTS} versions. Delete one to create another.</p>}

      {editing && (
        <EditFlow
          characterId={characterId}
          slotId={editing.slotId}
          name={editing.name}
          system={editing.system}
          systems={transposeSystems.filter((s) => s.id !== editing.system)}
          aiConfigured={aiConfigured}
          onClose={() => setEditing(null)}
        />
      )}
    </details>
  );
}
