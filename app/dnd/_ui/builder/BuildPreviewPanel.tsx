// app/dnd/_ui/builder/BuildPreviewPanel.tsx — the live preview the guided builder was designed with (P5-7).
//
// Server-rendered from the character's stored data, so it is CORRECT rather than optimistic: it shows what
// was actually saved, and it updates when a step's `router.refresh()` lands. A client-side preview
// mirroring form state would show what the player is about to save — which is the same thing right up
// until a save fails, and then it is a lie on screen while the character is unchanged.
//
// Not a client component at all: no state, no effects, nothing to hydrate.
import type { BuildPreview } from '@/lib/dnd/builder/preview';

export default function BuildPreviewPanel({ preview }: { preview: BuildPreview }) {
  return (
    <aside
      aria-label="Your character so far"
      style={{
        border: '1px solid var(--hx-line)', borderRadius: 12, background: 'var(--hx-inset-soft)',
        padding: '12px 14px', display: 'grid', gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
        So far
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--hx-text)', lineHeight: 1.3 }}>{preview.name}</div>
      {preview.headline && (
        <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{preview.headline}</div>
      )}

      {preview.empty ? (
        // An encouraging blank state, not a grid of dashes. "AC —, HP —, STR —" on a character nobody has
        // started reads as broken; this reads as the beginning.
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.55 }}>
          Nothing chosen yet. Your numbers appear here as you go.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px' }}>
          {preview.stats.map((s) => (
            <span key={s.label} style={{
              display: 'inline-flex', gap: 5, alignItems: 'baseline',
              border: '1px solid var(--hx-line)', borderRadius: 7, padding: '3px 8px',
            }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--hx-muted)' }}>{s.label}</span>
              <strong style={{ fontSize: 13, color: 'var(--hx-text)' }}>{s.value}</strong>
            </span>
          ))}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
        {/* Says WHEN it updates. A panel that appears stale for a second after a choice is a panel people
            stop trusting, and "after each choice is saved" is both true and reassuring. */}
        Updates as each choice saves.
      </p>
    </aside>
  );
}
