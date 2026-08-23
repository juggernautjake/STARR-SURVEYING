'use client';
// app/admin/design/components/Inspector.tsx — editing the thing you selected.
//
// Slices I1–I6 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"if we want to make an element a certain color, or widen the element, or make it shorter,
// or make it more transparent, or make it more bold… if I make a red square, I need to then also be
// able to round the corners more or less if I want to."*
//
// Two things worth knowing about how this is built:
//
//   · **Tokens come first in every colour control.** The app's palette is offered as swatches and a
//     free colour picker sits after them, visibly marked as off-system. A mockup full of
//     hand-picked hexes is a mockup nobody can build with the design system, and the export names
//     every one of them so the choice is at least deliberate.
//
//   · **Corner radius is one control that becomes four.** Rounding all four corners is the common
//     case and gets a slider AND a number box — dragging is how you find the value you like, typing
//     is how you match one you already chose. A disclosure breaks it into four, because a card with
//     two square corners and two round ones is a real thing to want.

import { useState } from 'react';
import { Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { DesignElement } from '@/lib/design/document';
import type { CatalogueEntry } from '@/lib/design/catalogue/types';
import { FLAG_KINDS, toggleFlag, setFlagNote } from '@/lib/design/punchlist';

interface Props {
  element: DesignElement | null;
  entry: CatalogueEntry | undefined;
  count: number;
  onChange: (patch: Partial<DesignElement>) => void;
  onSlot: (name: string, value: string) => void;
  onStyle: (prop: string, value: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOrder: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
}

/** The token ramp, offered before any free colour. Values mirror `app/styles/tokens.css`. */
const TOKEN_SWATCHES: { label: string; value: string }[] = [
  { label: 'Navy', value: '#1D3095' },
  { label: 'Navy dark', value: '#152050' },
  { label: 'Red', value: '#BD1218' },
  { label: 'Success', value: '#10B981' },
  { label: 'Error', value: '#EF4444' },
  { label: 'Ink', value: '#0F1419' },
  { label: 'Body', value: '#374151' },
  { label: 'Muted', value: '#9CA3AF' },
  { label: 'Border', value: '#E5E7EB' },
  { label: 'Subtle', value: '#F3F4F6' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Amber', value: '#FEF3C7' },
];

function numberFrom(value: string | undefined, fallback: number): number {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

export default function Inspector({ element, entry, count, onChange, onSlot, onStyle, onDelete, onDuplicate, onOrder }: Props) {
  const [perCorner, setPerCorner] = useState(false);

  if (!element) {
    return (
      <aside className="dsx-ins" aria-label="Element properties">
        <p className="dsx-ins__empty">
          {count > 1
            ? `${count} elements selected. Pick one to edit it, or use the buttons below the canvas to move, hide or delete them together.`
            : 'Nothing selected. Click an element on the artboard, or drag one in from the left.'}
        </p>
      </aside>
    );
  }

  const radius = numberFrom(element.style.borderRadius, 8);
  const opacity = Math.round(numberFrom(element.style.opacity, 1) * 100);

  return (
    <aside className="dsx-ins" aria-label="Element properties">
      <header className="dsx-ins__head">
        <input
          className="dsx-ins__name"
          value={element.name ?? entry?.label ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Element name"
        />
        {entry && <p className="dsx-ins__id" title="The real classes this maps to">{entry.classes.map((c) => `.${c}`).join(' ')}</p>}
      </header>

      {/* ── Variant ─────────────────────────────────────────────────────────────────────────── */}
      {entry && entry.variants.length > 0 && (
        <section className="dsx-ins__section">
          <h4>Variant</h4>
          <div className="dsx-ins__chips">
            {entry.variants.map((v) => (
              <button
                key={v.id}
                className={`dsx-ins__chip${element.variant === v.id ? ' is-on' : ''}`}
                onClick={() => onChange({ variant: v.id })}
              >
                {v.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────────────────────── */}
      {entry && entry.slots.length > 0 && (
        <section className="dsx-ins__section">
          <h4>Content</h4>
          {entry.slots.map((slot) => (
            <label key={slot.name} className="dsx-ins__row">
              <span>{slot.label}</span>
              {slot.kind === 'rich' ? (
                <textarea
                  rows={3}
                  value={element.slots[slot.name] ?? ''}
                  onChange={(e) => onSlot(slot.name, e.target.value)}
                  placeholder={slot.default}
                />
              ) : (
                <input
                  value={element.slots[slot.name] ?? ''}
                  onChange={(e) => onSlot(slot.name, e.target.value)}
                  placeholder={slot.default}
                />
              )}
            </label>
          ))}
          {entry.slots.some((s) => s.stress) && (
            <button
              className="dsx-ins__stress"
              onClick={() => entry.slots.forEach((s) => s.stress && onSlot(s.name, s.stress))}
              title="Fill every slot with the longest realistic value — the fastest way to find out whether a layout survives real data"
            >
              Stress with the longest real text
            </button>
          )}
        </section>
      )}

      {/* ── Position and size ───────────────────────────────────────────────────────────────── */}
      <section className="dsx-ins__section">
        <h4>Position &amp; size</h4>
        <div className="dsx-ins__grid">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <label key={key} className="dsx-ins__cell">
              <span>{key.toUpperCase()}</span>
              <input
                type="number"
                value={element[key]}
                onChange={(e) => onChange({ [key]: Math.round(Number(e.target.value) || 0) } as Partial<DesignElement>)}
              />
            </label>
          ))}
        </div>
        <label className="dsx-ins__row">
          <span>Rotation</span>
          <input
            type="range" min={-180} max={180} step={1}
            value={element.rotation ?? 0}
            onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          />
        </label>
      </section>

      {/* ── Appearance ──────────────────────────────────────────────────────────────────────── */}
      <section className="dsx-ins__section">
        <h4>Appearance</h4>

        <div className="dsx-ins__field">
          <span>Background</span>
          <div className="dsx-ins__swatches">
            {TOKEN_SWATCHES.map((s) => (
              <button
                key={s.value}
                className="dsx-ins__swatch"
                style={{ background: s.value }}
                title={`${s.label} — a design-system colour`}
                onClick={() => onStyle('backgroundColor', s.value)}
              />
            ))}
            <input
              type="color"
              className="dsx-ins__custom"
              title="A custom colour — outside the design system, and named as such in the export"
              value={element.style.backgroundColor ?? '#ffffff'}
              onChange={(e) => onStyle('backgroundColor', e.target.value)}
            />
          </div>
        </div>

        <div className="dsx-ins__field">
          <span>Text colour</span>
          <div className="dsx-ins__swatches">
            {TOKEN_SWATCHES.slice(0, 8).map((s) => (
              <button key={s.value} className="dsx-ins__swatch" style={{ background: s.value }} title={s.label} onClick={() => onStyle('color', s.value)} />
            ))}
            <input type="color" className="dsx-ins__custom" value={element.style.color ?? '#0f1419'} onChange={(e) => onStyle('color', e.target.value)} />
          </div>
        </div>

        {/* Corner radius — one control that becomes four. */}
        <div className="dsx-ins__field">
          <span>
            Corner radius
            <button className="dsx-ins__link" onClick={() => setPerCorner((v) => !v)}>{perCorner ? 'all corners' : 'per corner'}</button>
          </span>
          {!perCorner ? (
            <div className="dsx-ins__slider">
              <input type="range" min={0} max={120} step={1} value={radius} onChange={(e) => onStyle('borderRadius', `${e.target.value}px`)} />
              <input type="number" min={0} value={radius} onChange={(e) => onStyle('borderRadius', `${Number(e.target.value) || 0}px`)} />
            </div>
          ) : (
            <div className="dsx-ins__grid">
              {([
                ['borderTopLeftRadius', 'TL'],
                ['borderTopRightRadius', 'TR'],
                ['borderBottomRightRadius', 'BR'],
                ['borderBottomLeftRadius', 'BL'],
              ] as const).map(([prop, label]) => (
                <label key={prop} className="dsx-ins__cell">
                  <span>{label}</span>
                  <input
                    type="number" min={0}
                    value={numberFrom(element.style[prop], radius)}
                    onChange={(e) => onStyle(prop, `${Number(e.target.value) || 0}px`)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="dsx-ins__field">
          <span>Border</span>
          <div className="dsx-ins__slider">
            <input
              type="range" min={0} max={12} step={1}
              value={numberFrom(element.style.borderWidth, 0)}
              onChange={(e) => { onStyle('borderWidth', `${e.target.value}px`); onStyle('borderStyle', 'solid'); }}
            />
            <input type="color" value={element.style.borderColor ?? '#1d3095'} onChange={(e) => onStyle('borderColor', e.target.value)} />
          </div>
        </div>

        <div className="dsx-ins__field">
          <span>Opacity</span>
          <div className="dsx-ins__slider">
            <input type="range" min={0} max={100} step={1} value={opacity} onChange={(e) => onStyle('opacity', String(Number(e.target.value) / 100))} />
            <output>{opacity}%</output>
          </div>
        </div>
      </section>

      {/* ── Type ────────────────────────────────────────────────────────────────────────────── */}
      <section className="dsx-ins__section">
        <h4>Type</h4>
        <div className="dsx-ins__grid">
          <label className="dsx-ins__cell">
            <span>Size</span>
            <input type="number" min={8} max={96} value={numberFrom(element.style.fontSize, 14)} onChange={(e) => onStyle('fontSize', `${Number(e.target.value) || 14}px`)} />
          </label>
          <label className="dsx-ins__cell">
            <span>Weight</span>
            <select value={element.style.fontWeight ?? '400'} onChange={(e) => onStyle('fontWeight', e.target.value)}>
              {['400', '500', '600', '700', '800'].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="dsx-ins__cell">
            <span>Align</span>
            <select value={element.style.textAlign ?? 'left'} onChange={(e) => onStyle('textAlign', e.target.value)}>
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label className="dsx-ins__cell">
            <span>Font</span>
            <select value={element.style.fontFamily ?? ''} onChange={(e) => onStyle('fontFamily', e.target.value)}>
              <option value="">Inherit</option>
              <option value="'Inter', sans-serif">Inter (app UI)</option>
              <option value="'Sora', sans-serif">Sora (app headings)</option>
              <option value="'SF Mono', ui-monospace, monospace">Mono (numbers)</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Times New Roman', serif">Times</option>
            </select>
          </label>
        </div>
      </section>

      {/* ── The note that carries into the export ───────────────────────────────────────────── */}
      <section className="dsx-ins__section">
        <h4>Note for the builder</h4>
        <textarea
          className="dsx-ins__note"
          rows={3}
          value={element.note ?? ''}
          placeholder="e.g. this should open the file viewer, not download"
          onChange={(e) => onChange({ note: e.target.value })}
        />
        <p className="dsx-ins__hint">Notes are carried into the exported spec. This is often the most useful thing on the screen.</p>
      </section>

      {/* ── Flag a defect (§14) ─────────────────────────────────────────────────────────────────
        *
        * Separate from the note above, and the difference is the point: a note is prose about THIS
        * mockup, read by whoever opens it. A flag is a row in a list of defects spread across 147
        * pages that has to survive as a list. Hence a fixed set of four kinds rather than free text
        * — four people will actually use beats twelve nobody can choose between, and each maps to a
        * different kind of fix.
        */}
      <section className="dsx-ins__section">
        <h4>Something wrong with it?</h4>
        <div className="dsx-ins__chips">
          {FLAG_KINDS.map(({ kind, label, means }) => {
            const on = (element.flags ?? []).some((f) => f.kind === kind);
            return (
              <button
                key={kind}
                type="button"
                className={`dsx-ins__chip${on ? ' is-on' : ''}`}
                title={means}
                onClick={() => onChange({ flags: toggleFlag(element, kind) })}
              >
                {label}
              </button>
            );
          })}
        </div>

        {(element.flags ?? []).map((flag) => (
          <label key={flag.kind} className="dsx-ins__row">
            <span>{FLAG_KINDS.find((k) => k.kind === flag.kind)?.label ?? flag.kind} — what is wrong?</span>
            <input
              className="dsx-ins__note"
              value={flag.note ?? ''}
              placeholder="e.g. saves but never shows a confirmation"
              onChange={(e) => onChange({ flags: setFlagNote(element, flag.kind, e.target.value) })}
            />
          </label>
        ))}

        {element.importedFrom ? (
          <p className="dsx-ins__hint">
            Traced from <code>.{element.importedFrom.split(' ').join('.')}</code> — flags on it export
            as a punch list pointing at that selector.
          </p>
        ) : (
          <p className="dsx-ins__hint">
            Flags export as a punch list. They point at a real selector when the design was traced
            from a live page.
          </p>
        )}
      </section>

      <footer className="dsx-ins__foot">
        <button onClick={onDuplicate} title="Duplicate (Ctrl+D)"><Copy size={14} aria-hidden /> Duplicate</button>
        <button onClick={() => onOrder('front')} title="Bring to front"><ArrowUp size={14} aria-hidden /></button>
        <button onClick={() => onOrder('back')} title="Send to back"><ArrowDown size={14} aria-hidden /></button>
        <button className="is-danger" onClick={onDelete} title="Delete"><Trash2 size={14} aria-hidden /> Delete</button>
      </footer>
    </aside>
  );
}
