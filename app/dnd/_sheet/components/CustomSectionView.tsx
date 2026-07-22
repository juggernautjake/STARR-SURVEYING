'use client';
// CustomSectionView — renders (and optionally edits) a player-authored custom section (D-13).
//
// The SAME component draws on 5e, PF2 and IG sheets, which use different CSS scopes, so every colour here is
// a `var(--hx-*, <neutral fallback>)`: on the bespoke IG/PF2 sheets the hextech tokens resolve; on the 5e
// sheet the neutral fallbacks apply. Muted text uses `opacity` on the inherited colour so it reads on light
// and dark skins alike. The model + all mutations live in `lib/dnd/custom-sections.ts` (pure, unit-tested);
// this file is only presentation + controlled inputs that hand a whole new section back through `onChange`.
import React from 'react';
import type { CustomSection, CustomBlock, CustomBlockKind } from '@/lib/dnd/custom-sections';
import { blockIsEmpty, blankBlock } from '@/lib/dnd/custom-sections';

const LINE = 'var(--hx-line, rgba(130,132,140,0.30))';
const INSET = 'var(--hx-inset, rgba(130,132,140,0.06))';
const paras = (body: string) => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

// ── Read-only render ────────────────────────────────────────────────────────────────────────────────────

function BlockView({ block }: { block: CustomBlock }) {
  const heading = 'heading' in block ? block.heading?.trim() : '';
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: INSET, padding: '11px 13px' }}>
      {heading && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{heading}</div>}
      {block.kind === 'text' &&
        paras(block.body).map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '7px 0 0', lineHeight: 1.5, fontSize: 13.5 }}>
            {p}
          </p>
        ))}
      {block.kind === 'stats' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {block.rows
            .filter((r) => r.label.trim() || r.value.trim())
            .map((r, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.62 }}>{r.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{r.value}</span>
              </div>
            ))}
        </div>
      )}
      {block.kind === 'list' && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {block.items
            .filter((i) => i.trim())
            .map((it, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                {it}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ── Inline editor ───────────────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 13.5, padding: '5px 8px', borderRadius: 6, width: '100%',
  background: 'var(--hx-inset-strong, rgba(130,132,140,0.10))', color: 'inherit', border: `1px solid ${LINE}`,
};
const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
  background: 'none', border: `1px solid ${LINE}`, color: 'inherit',
};

function BlockEditor({ block, onChange, onRemove }: { block: CustomBlock; onChange: (b: CustomBlock) => void; onRemove: () => void }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: INSET, padding: 11, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>{block.kind}</span>
        <button type="button" onClick={onRemove} style={{ ...miniBtn, marginLeft: 'auto', color: 'var(--hx-danger, #c0392b)', borderColor: 'var(--hx-danger, #c0392b)' }}>Remove block</button>
      </div>
      <input value={'heading' in block ? block.heading ?? '' : ''} placeholder="Heading (optional)"
        onChange={(e) => onChange({ ...block, heading: e.target.value })} style={inputStyle} />
      {block.kind === 'text' && (
        <textarea value={block.body} placeholder="Write anything… blank lines start a new paragraph." rows={4}
          onChange={(e) => onChange({ ...block, body: e.target.value })} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      )}
      {block.kind === 'stats' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {block.rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input value={r.label} placeholder="Label" style={inputStyle}
                onChange={(e) => onChange({ ...block, rows: block.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input value={r.value} placeholder="Value" style={inputStyle}
                onChange={(e) => onChange({ ...block, rows: block.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <button type="button" style={miniBtn} aria-label="Remove row"
                onClick={() => onChange({ ...block, rows: block.rows.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button type="button" style={miniBtn} onClick={() => onChange({ ...block, rows: [...block.rows, { label: '', value: '' }] })}>+ Add row</button>
        </div>
      )}
      {block.kind === 'list' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {block.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input value={it} placeholder={`Item ${i + 1}`} style={inputStyle}
                onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" style={miniBtn} aria-label="Remove item"
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button type="button" style={miniBtn} onClick={() => onChange({ ...block, items: [...block.items, ''] })}>+ Add item</button>
        </div>
      )}
    </div>
  );
}

export interface CustomSectionViewProps {
  section: CustomSection;
  /** When true, renders the inline editor (title, blocks, add/remove) instead of the read-only view. */
  editable?: boolean;
  /** Called with the whole updated section on any edit. Required when `editable`. */
  onChange?: (section: CustomSection) => void;
  /** Called when the player deletes the section. Shown only in edit mode. */
  onDelete?: () => void;
}

export default function CustomSectionView({ section, editable, onChange, onDelete }: CustomSectionViewProps) {
  const [editing, setEditing] = React.useState(false);

  if (editable && editing && onChange) {
    const addBlockOfKind = (kind: CustomBlockKind) =>
      onChange({ ...section, blocks: [...section.blocks, blankBlock(kind, section.blocks.map((b) => b.id))] });
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={section.title} placeholder="Section title" style={{ ...inputStyle, maxWidth: 260, fontWeight: 700 }}
            onChange={(e) => onChange({ ...section, title: e.target.value })} />
          <input value={section.icon ?? ''} placeholder="Icon" aria-label="Section icon" maxLength={2}
            style={{ ...inputStyle, width: 56, textAlign: 'center' }}
            onChange={(e) => onChange({ ...section, icon: e.target.value })} />
          <button type="button" style={{ ...miniBtn, marginLeft: 'auto' }} onClick={() => setEditing(false)}>Done</button>
          {onDelete && (
            <button type="button" onClick={onDelete} style={{ ...miniBtn, color: 'var(--hx-danger, #c0392b)', borderColor: 'var(--hx-danger, #c0392b)' }}>Delete section</button>
          )}
        </div>
        {section.blocks.map((b) => (
          <BlockEditor key={b.id} block={b}
            onChange={(nb) => onChange({ ...section, blocks: section.blocks.map((x) => (x.id === nb.id ? nb : x)) })}
            onRemove={() => onChange({ ...section, blocks: section.blocks.filter((x) => x.id !== b.id) })} />
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={miniBtn} onClick={() => addBlockOfKind('text')}>+ Text</button>
          <button type="button" style={miniBtn} onClick={() => addBlockOfKind('stats')}>+ Stat grid</button>
          <button type="button" style={miniBtn} onClick={() => addBlockOfKind('list')}>+ List</button>
        </div>
      </div>
    );
  }

  const visible = section.blocks.filter((b) => !blockIsEmpty(b));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {editable && (
        <button type="button" style={{ ...miniBtn, justifySelf: 'end' }} onClick={() => setEditing(true)}>Edit section</button>
      )}
      {visible.length === 0 ? (
        <p style={{ opacity: 0.6, fontSize: 13.5 }}>
          This section is empty.{editable ? ' Tap “Edit section” to add content.' : ''}
        </p>
      ) : (
        visible.map((b) => <BlockView key={b.id} block={b} />)
      )}
    </div>
  );
}
