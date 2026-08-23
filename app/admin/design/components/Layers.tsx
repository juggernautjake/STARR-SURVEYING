'use client';
// app/admin/design/components/Layers.tsx — what is on top of what, and how to change it.
//
// Slice I2 of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"layer management… send things back a layer, or forward a layer, or… to the back or to
// the front. This needs to work for all elements and drawing elements and text and everything."*
//
// ── WHY A PANEL AND NOT JUST FOUR BUTTONS ───────────────────────────────────────────────────────
//
// Four buttons move the thing you have already selected. The harder problem is selecting the thing
// at all: importing a real page (§13 of the previous doc) puts a full-width card underneath a dozen
// labels, and on the canvas the card is unreachable — every click lands on something on top of it.
// A list is the only way to reach what is buried, which is why every editor that has layers has a
// list rather than only buttons.
//
// It is also where hide and lock belong. Both existed as footer buttons that acted on the current
// selection and were therefore invisible: nothing on screen said which elements were hidden, so
// hiding one looked exactly like deleting it.
//
// ── TOP OF THE LIST IS TOP OF THE STACK ─────────────────────────────────────────────────────────
//
// Higher `z` renders on top, so the list is sorted DESCENDING — the topmost row is the frontmost
// element. This matches every other design tool, and getting it backwards makes "move up" mean
// "move behind", which nobody recovers from.

import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { DesignElement } from '@/lib/design/document';
import type { CatalogueEntry } from '@/lib/design/catalogue/types';

interface Props {
  elements: DesignElement[];
  selection: string[];
  getEntry: (id: string) => CatalogueEntry | undefined;
  onSelect: (id: string, additive: boolean) => void;
  onOrder: (dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onPatch: (id: string, patch: Partial<DesignElement>) => void;
  /** The drawing layer sits in the stack like anything else — see I3. */
  hasDrawing: boolean;
  drawingBelow: boolean;
  onToggleDrawingDepth: () => void;
}

export default function Layers({
  elements, selection, getEntry, onSelect, onOrder, onPatch, hasDrawing, drawingBelow, onToggleDrawingDepth,
}: Props) {
  // Frontmost first.
  const ordered = [...elements].sort((a, b) => b.z - a.z);
  const anySelected = selection.length > 0;

  const nameOf = (el: DesignElement) =>
    el.name ?? (el.catalogId ? getEntry(el.catalogId)?.label : undefined) ?? el.kind;

  const row = (el: DesignElement) => {
    const selected = selection.includes(el.id);
    return (
      <li key={el.id} className={`dsx-lay__row${selected ? ' is-on' : ''}`}>
        <button
          type="button"
          className="dsx-lay__pick"
          onClick={(e) => onSelect(el.id, e.shiftKey)}
          title={el.importedFrom ? `Traced from .${el.importedFrom.split(' ').join('.')}` : nameOf(el)}
        >
          <span className="dsx-lay__name">{nameOf(el)}</span>
          <span className="dsx-lay__meta">{el.w}×{el.h}</span>
        </button>
        <button
          type="button"
          className="dsx-lay__icon"
          title={el.hidden ? 'Show' : 'Hide'}
          onClick={() => onPatch(el.id, { hidden: !el.hidden })}
        >
          {el.hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
        </button>
        <button
          type="button"
          className="dsx-lay__icon"
          title={el.locked ? 'Unlock' : 'Lock'}
          onClick={() => onPatch(el.id, { locked: !el.locked })}
        >
          {el.locked ? <Lock size={13} aria-hidden /> : <Unlock size={13} aria-hidden />}
        </button>
      </li>
    );
  };

  return (
    <section className="dsx-lay" aria-label="Layers">
      <header className="dsx-lay__head">
        <h4>Layers</h4>
        <span className="dsx-lay__count">{elements.length}</span>
      </header>

      {/* All four moves. `reorder()` has implemented forward and backward since the first slice and
        * only front and back were ever reachable — half a feature, silently. */}
      <div className="dsx-lay__moves">
        <button type="button" className="dsx__tool" disabled={!anySelected} onClick={() => onOrder('front')} title="Bring to front">
          <ChevronsUp size={14} aria-hidden />
        </button>
        <button type="button" className="dsx__tool" disabled={!anySelected} onClick={() => onOrder('forward')} title="Forward one layer">
          <ChevronUp size={14} aria-hidden />
        </button>
        <button type="button" className="dsx__tool" disabled={!anySelected} onClick={() => onOrder('backward')} title="Back one layer">
          <ChevronDown size={14} aria-hidden />
        </button>
        <button type="button" className="dsx__tool" disabled={!anySelected} onClick={() => onOrder('back')} title="Send to back">
          <ChevronsDown size={14} aria-hidden />
        </button>
      </div>

      <ul className="dsx-lay__list">
        {hasDrawing && !drawingBelow && (
          <li className="dsx-lay__row dsx-lay__row--drawing">
            <button type="button" className="dsx-lay__pick" onClick={onToggleDrawingDepth} title="Click to move the drawing behind the elements">
              <span className="dsx-lay__name">✏️ Drawing</span>
              <span className="dsx-lay__meta">in front</span>
            </button>
          </li>
        )}
        {ordered.map(row)}
        {hasDrawing && drawingBelow && (
          <li className="dsx-lay__row dsx-lay__row--drawing">
            <button type="button" className="dsx-lay__pick" onClick={onToggleDrawingDepth} title="Click to move the drawing in front of the elements">
              <span className="dsx-lay__name">✏️ Drawing</span>
              <span className="dsx-lay__meta">behind</span>
            </button>
          </li>
        )}
        {ordered.length === 0 && !hasDrawing && (
          <li className="dsx-lay__empty">Nothing on this view yet.</li>
        )}
      </ul>
    </section>
  );
}
