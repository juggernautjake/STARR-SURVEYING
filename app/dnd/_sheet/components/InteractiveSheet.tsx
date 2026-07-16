'use client';
// InteractiveSheet — renders an AI-built custom sheet with REAL, WORKING controls
// (Phase V, Slice 11). Unlike the static (iframe) custom sheet, this renders via React so
// the interactive widgets — text/number fields, counters, toggles — are bound to the
// character's `customFields` and their edits persist through the normal sheet autosave.
// Presentational blocks (heading/text/stats/list/table/note) render statically and safely
// (React-escaped; `html` blocks sanitized). Used when a custom layout contains at least
// one interactive widget.
import { useCallback } from 'react';
import { useChar } from '../state/store';
import { normalizeLayout, sanitizeBlockHtml, type CustomBlock } from '@/lib/dnd/custom-sheet';

function useField(key: string): [string | number | boolean | undefined, (v: string | number | boolean) => void] {
  const { char, setChar, canWrite } = useChar();
  const value = char.customFields?.[key];
  const set = useCallback(
    (v: string | number | boolean) => {
      if (!canWrite) return;
      setChar((c) => ({ ...c, customFields: { ...(c.customFields ?? {}), [key]: v } }));
    },
    [key, setChar, canWrite],
  );
  return [value, set];
}

function FieldWidget({ block }: { block: Extract<CustomBlock, { type: 'field' }> }) {
  const [value, set] = useField(block.key);
  const { canWrite } = useChar();
  return (
    <label className="cs-widget">
      <span className="cs-widget-label">{block.label}</span>
      <input
        className="cs-widget-input"
        type={block.kind === 'number' ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        placeholder={block.placeholder}
        disabled={!canWrite}
        onChange={(e) => set(block.kind === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </label>
  );
}

function CounterWidget({ block }: { block: Extract<CustomBlock, { type: 'counter' }> }) {
  const [value, set] = useField(block.key);
  const { canWrite } = useChar();
  const n = typeof value === 'number' ? value : Number(value) || 0;
  const step = block.step ?? 1;
  const clamp = (x: number) => Math.max(block.min ?? -Infinity, Math.min(block.max ?? Infinity, x));
  return (
    <div className="cs-widget">
      <span className="cs-widget-label">{block.label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button type="button" disabled={!canWrite} onClick={() => set(clamp(n - step))} className="cs-widget-btn" aria-label="decrease">−</button>
        <span className="cs-widget-input" style={{ minWidth: 32, textAlign: 'center' }}>{n}</span>
        <button type="button" disabled={!canWrite} onClick={() => set(clamp(n + step))} className="cs-widget-btn" aria-label="increase">+</button>
      </span>
    </div>
  );
}

function ToggleWidget({ block }: { block: Extract<CustomBlock, { type: 'toggle' }> }) {
  const [value, set] = useField(block.key);
  const { canWrite } = useChar();
  const on = value === true || value === 'true';
  return (
    <label className="cs-widget" style={{ cursor: canWrite ? 'pointer' : 'default' }}>
      <span className="cs-widget-label">{block.label}</span>
      <input type="checkbox" checked={on} disabled={!canWrite} onChange={(e) => set(e.target.checked)} />
    </label>
  );
}

function StaticBlock({ block }: { block: CustomBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <header>
          <h2 style={{ margin: 0, color: 'var(--gold, #c8aa6e)', fontFamily: 'var(--font-display)' }}>{block.text}</h2>
          {block.sub && <p style={{ margin: '2px 0 0', color: 'var(--gold, #c8aa6e)', fontSize: 13 }}>{block.sub}</p>}
        </header>
      );
    case 'text':
      return <p style={{ margin: 0 }}>{block.text}</p>;
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px solid var(--line, #1e3a52)' }} />;
    case 'note':
      return (
        <div style={{ padding: '10px 12px', borderLeft: '3px solid var(--tealbright, #0ac8b9)', background: 'rgba(10,200,185,0.06)', borderRadius: 4, fontSize: 13 }}>
          {block.text}
        </div>
      );
    case 'stats':
      return (
        <section className="card">
          {block.title && <h3>{block.title}</h3>}
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8, margin: 0 }}>
            {block.items.map((it, i) => (
              <div key={i} style={{ background: 'rgba(1,10,19,0.5)', border: '1px solid var(--line,#1e3a52)', borderRadius: 6, padding: '7px 9px' }}>
                <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted,#7a8ba0)' }}>{it.label}</dt>
                <dd style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 600, color: 'var(--gold-2,#f0e6d2)' }}>{it.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    case 'list':
      return (
        <section className="card">
          {block.title && <h3>{block.title}</h3>}
          {block.ordered ? <ol>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ol> : <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
        </section>
      );
    case 'table':
      return (
        <section className="card" style={{ overflowX: 'auto' }}>
          {block.title && <h3>{block.title}</h3>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{block.columns.map((c, i) => <th key={i} style={{ border: '1px solid var(--line,#1e3a52)', padding: '6px 9px', textAlign: 'left' }}>{c}</th>)}</tr></thead>
            <tbody>{block.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ border: '1px solid var(--line,#1e3a52)', padding: '6px 9px' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </section>
      );
    case 'html':
      // Sanitized (scripts/handlers stripped); inert markup only.
      return <section className="card" dangerouslySetInnerHTML={{ __html: sanitizeBlockHtml(block.html) }} />;
    default:
      return null;
  }
}

export default function InteractiveSheet({ layout }: { layout: unknown }) {
  const parsed = normalizeLayout(layout);
  return (
    <div className="dnd-custom-interactive" style={{ display: 'grid', gap: 14 }}>
      <style>{`.cs-widget{display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(1,10,19,.5);border:1px solid var(--line,#1e3a52);border-radius:6px;padding:8px 11px}
.cs-widget-label{font-size:12px;color:var(--muted,#7a8ba0)}
.cs-widget-input{font-size:14px;color:var(--gold-2,#f0e6d2);background:transparent;border:0;text-align:right;max-width:140px}
input.cs-widget-input{border-bottom:1px solid var(--line,#1e3a52)}
.cs-widget-btn{width:24px;height:24px;border-radius:5px;border:1px solid var(--line,#1e3a52);background:rgba(10,200,185,0.1);color:var(--gold-2,#f0e6d2);cursor:pointer;font-size:15px;line-height:1}`}</style>
      {parsed.title && <h1 style={{ margin: 0, color: 'var(--gold-2,#f0e6d2)' }}>{parsed.title}</h1>}
      {parsed.blocks.map((b, i) => {
        if (b.type === 'field') return <FieldWidget key={i} block={b} />;
        if (b.type === 'counter') return <CounterWidget key={i} block={b} />;
        if (b.type === 'toggle') return <ToggleWidget key={i} block={b} />;
        return <StaticBlock key={i} block={b} />;
      })}
    </div>
  );
}
