'use client';
// app/admin/cad/components/TextStylePicker.tsx
//
// C19 — pick a named text style, anywhere text is placed, with a live sample.
//
// C18 built the model (`TextStyleDefinition`, `BUILTIN_TEXT_STYLES`, `resolveTextLabelStyle`) and
// wired the canvas + both exporters to it. Nothing could SET `textStyleId`, so every label in every
// drawing still had none. This is the control that makes the model reachable.
//
// One component, mounted at each place a `TextLabelStyle` is edited, so "which font is this" is
// asked and answered the same way everywhere — which is the whole point of naming styles.

import { useMemo } from 'react';
import { Type } from 'lucide-react';

import {
  listTextStyles,
  getTextStyle,
  resolveTextLabelStyle,
  effectiveWidthFactor,
} from '@/lib/cad/styles/text-style-library';
import type { TextStyleDefinition } from '@/lib/cad/styles/types';
import type { TextLabelStyle } from '@/lib/cad/types';

/** Value of the "no named style" option. Not an empty string: an empty `<option value="">` is
 *  indistinguishable from "nothing selected" when reading the DOM in a test or a screenshot. */
export const NO_TEXT_STYLE = '__CUSTOM__';

const CATEGORY_LABELS: Record<TextStyleDefinition['category'], string> = {
  ANNOTATION: 'Annotation',
  TITLE: 'Titles',
  SURVEY: 'Survey',
  TABLE: 'Tables & legends',
  CUSTOM: 'This drawing',
};

const CATEGORY_ORDER: TextStyleDefinition['category'][] =
  ['CUSTOM', 'ANNOTATION', 'SURVEY', 'TITLE', 'TABLE'];

interface Props {
  /** The label style being edited. */
  value: TextLabelStyle;
  onChange: (next: TextLabelStyle) => void;
  /** `document.customTextStyles ?? []`. */
  customStyles?: TextStyleDefinition[];
  /** Ink for the sample when the style itself sets no colour. */
  inkColor?: string;
  /** Sample text. Defaults to something a surveyor would recognise at a glance. */
  sampleText?: string;
  /** Compact variant for the on-canvas label editor, where vertical space is scarce. */
  dense?: boolean;
}

/**
 * CSS transform for the sample.
 *
 * `skewX` is NEGATED for the same reason the canvas negates its Pixi skew: both coordinate systems
 * have y growing downward, so a positive skew leans the top of the glyph LEFT. A positive oblique
 * angle has to lean right — that is what oblique means everywhere a surveyor has seen it, and a
 * sample that leaned the other way from the drawing would be worse than no sample.
 */
export function sampleTransform(style: TextLabelStyle): string {
  const w = effectiveWidthFactor(style);
  const oblique = style.obliqueAngle ?? 0;
  const parts: string[] = [];
  if (w !== 1) parts.push(`scaleX(${w})`);
  if (oblique !== 0) parts.push(`skewX(${-oblique}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export default function TextStylePicker({
  value,
  onChange,
  customStyles = [],
  inkColor = '#e5e7eb',
  sampleText = 'N 45°30′12″ E  132.48′',
  dense = false,
}: Props) {
  const styles = useMemo(() => listTextStyles(customStyles), [customStyles]);
  const grouped = useMemo(() => {
    const out = new Map<TextStyleDefinition['category'], TextStyleDefinition[]>();
    for (const c of CATEGORY_ORDER) {
      const inCat = styles.filter((s) => s.category === c);
      if (inCat.length) out.set(c, inCat);
    }
    return out;
  }, [styles]);

  const active = getTextStyle(value.textStyleId, customStyles);
  const resolved = resolveTextLabelStyle(value, customStyles);

  function pick(id: string) {
    if (id === NO_TEXT_STYLE) {
      // Detaching BAKES the resolved values into the label before dropping the id.
      //
      // Without this, clearing the style would snap the text back to whatever fields were sitting
      // underneath — usually the untouched defaults, so the label would visibly jump to Arial 10
      // the moment the surveyor chose "custom" in order to tweak it. Detach has to mean "keep what
      // I can see and let me edit it", which is the only reading of that menu item.
      onChange({ ...resolved, textStyleId: null });
      return;
    }
    onChange({ ...value, textStyleId: id });
  }

  const sizeClass = dense ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className="space-y-1.5" data-testid="text-style-picker">
      <div className="flex items-center gap-1.5">
        <Type size={dense ? 10 : 11} className="text-gray-500 shrink-0" />
        <span className={`${sizeClass} text-gray-400 shrink-0`}>Style</span>
        <select
          className={`flex-1 min-w-0 bg-gray-700 text-white ${sizeClass} rounded px-1 h-6 border border-gray-600 outline-none focus:border-blue-500`}
          value={value.textStyleId ?? NO_TEXT_STYLE}
          onChange={(e) => pick(e.target.value)}
          aria-label="Text style"
          data-testid="text-style-select"
        >
          <option value={NO_TEXT_STYLE}>Custom (this label only)</option>
          {[...grouped.entries()].map(([cat, list]) => (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
          {/* A style deleted from the drawing while a label still names it. Shown rather than
              silently reverting to "Custom", which would hide the fact that the drawing refers to
              something that no longer exists. */}
          {value.textStyleId && !active && (
            <option value={value.textStyleId}>{value.textStyleId} (missing)</option>
          )}
        </select>
      </div>

      {/* Live sample — the actual resolved typography, not a description of it. */}
      <div
        className="rounded border border-gray-700 bg-gray-900/70 px-2 py-1.5 overflow-hidden"
        data-testid="text-style-sample"
      >
        <div
          className="truncate"
          style={{
            fontFamily: resolved.fontFamily,
            fontSize: `${Math.min(20, Math.max(9, resolved.fontSize))}px`,
            fontWeight: resolved.fontWeight,
            fontStyle: resolved.fontStyle,
            color: resolved.color ?? inkColor,
            transform: sampleTransform(resolved),
            transformOrigin: 'left center',
          }}
        >
          {sampleText}
        </div>
      </div>

      {active && (
        <p className={`${sizeClass} text-gray-500 leading-snug`} data-testid="text-style-note">
          {/* Naming exactly what the style governs, because the controls below this picker are
              about to stop responding and a disabled field with no explanation reads as broken. */}
          <span className="text-gray-400">{active.name}</span> sets the font, size, weight, slant
          and width. Choose <span className="text-gray-400">Custom</span> to edit them here.
        </p>
      )}
    </div>
  );
}
