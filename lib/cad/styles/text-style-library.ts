// lib/cad/styles/text-style-library.ts — Built-in text style library (C18)
//
// The third style axis. Line types and symbols each had a library, a definition shape and a
// resolver; text had `fontFamily: string` on each label and nothing else. This is the missing one,
// built to the same spine so C20 can give all three one editor and C22 can drive all three from
// field codes.

import type { TextStyleDefinition } from './types';
import type { TextLabelStyle } from '../types';

/** Keeps the library below readable: everything unstated is the plain upright default. */
function ts(
  id: string,
  name: string,
  category: TextStyleDefinition['category'],
  fontFamily: string,
  fontSize: number,
  rest: Partial<TextStyleDefinition> = {},
): TextStyleDefinition {
  return {
    id,
    name,
    category,
    fontFamily,
    fontSize,
    fontWeight: 'normal',
    fontStyle: 'normal',
    widthFactor: 1,
    obliqueAngle: 0,
    isBuiltIn: true,
    isEditable: false,
    assignedCodes: [],
    ...rest,
  };
}

/**
 * The styles a plat actually uses, named for the job they do rather than for their typeface —
 * "Bearing & Distance", not "Arial 8 Condensed". A surveyor changing how calls look wants to find
 * the thing called calls.
 *
 * Sizes are points on paper, so they hold at any plot scale.
 */
export const BUILTIN_TEXT_STYLES: TextStyleDefinition[] = [
  // ── Annotation: the everyday text on the face of the drawing ──
  ts('STANDARD', 'Standard', 'ANNOTATION', 'Arial', 10),
  ts('STANDARD_BOLD', 'Standard Bold', 'ANNOTATION', 'Arial', 10, { fontWeight: 'bold' }),
  ts('SMALL', 'Small Note', 'ANNOTATION', 'Arial', 8),
  ts('LARGE', 'Large Note', 'ANNOTATION', 'Arial', 12),
  // Condensed rather than smaller: a call has to fit along the line it describes, and dropping the
  // point size to make it fit is what makes a plat unreadable at the recorder's office.
  ts('CONDENSED', 'Condensed Note', 'ANNOTATION', 'Arial Narrow', 10, { widthFactor: 0.85 }),

  // ── Titles: sheet furniture, not drawing content ──
  ts('SHEET_TITLE', 'Sheet Title', 'TITLE', 'Arial', 24, { fontWeight: 'bold', widthFactor: 1.1 }),
  ts('PLAT_TITLE', 'Plat Title', 'TITLE', 'Times New Roman', 18, { fontWeight: 'bold' }),
  ts('SUBTITLE', 'Subtitle', 'TITLE', 'Arial', 14, { fontWeight: 'bold' }),
  ts('BLOCK_LABEL', 'Block Label', 'TITLE', 'Arial', 11, { fontWeight: 'bold', widthFactor: 1.15 }),

  // ── Survey: the text that carries measurements ──
  ts('BEARING_DISTANCE', 'Bearing & Distance', 'SURVEY', 'Arial', 9),
  ts('POINT_NUMBER', 'Point Number', 'SURVEY', 'Arial', 9, { fontWeight: 'bold' }),
  ts('POINT_DESCRIPTION', 'Point Description', 'SURVEY', 'Arial', 8),
  // Monospaced on purpose: elevations and coordinates are read in columns, and a proportional
  // digit makes two stacked numbers fail to line up on the decimal.
  ts('ELEVATION', 'Elevation', 'SURVEY', 'Courier New', 9),
  ts('COORDINATE', 'Coordinate', 'SURVEY', 'Courier New', 9),
  ts('CURVE_DATA', 'Curve Data', 'SURVEY', 'Arial', 8, { widthFactor: 0.9 }),
  // The cartographic convention: water leans. Oblique, not italic — a sheared upright reads as
  // hydrography, a true italic reads as emphasis.
  ts('HYDROGRAPHY', 'Hydrography', 'SURVEY', 'Arial', 9, { obliqueAngle: 15 }),
  ts('EASEMENT', 'Easement Call', 'SURVEY', 'Arial', 8, { obliqueAngle: 12 }),
  ts('LEGAL_DESCRIPTION', 'Legal Description', 'SURVEY', 'Times New Roman', 10),

  // ── Tables: legends, line/curve tables, notes blocks ──
  ts('TABLE_HEADER', 'Table Header', 'TABLE', 'Arial', 9, { fontWeight: 'bold' }),
  ts('TABLE_BODY', 'Table Body', 'TABLE', 'Courier New', 8),
  ts('LEGEND', 'Legend', 'TABLE', 'Arial', 9),
  ts('NOTES', 'Notes', 'TABLE', 'Arial', 8),
];

/** The style used when a label names no style at all. Named once so nothing has to guess. */
export const DEFAULT_TEXT_STYLE_ID = 'STANDARD';

/**
 * Look a style up by id across the built-ins and this drawing's custom styles.
 *
 * Custom wins on an id collision, which is what lets a firm ship a drawing that redefines
 * `STANDARD` for itself. Returns null rather than a fallback so callers decide what a dangling
 * reference means — a silent substitution here would render a drawing in the wrong font and give
 * no sign that the style it asked for is missing.
 */
export function getTextStyle(
  id: string | null | undefined,
  custom: TextStyleDefinition[] = [],
): TextStyleDefinition | null {
  if (!id) return null;
  return custom.find((s) => s.id === id) ?? BUILTIN_TEXT_STYLES.find((s) => s.id === id) ?? null;
}

/** Every style available in this drawing, custom first, de-duplicated by id (custom wins). */
export function listTextStyles(custom: TextStyleDefinition[] = []): TextStyleDefinition[] {
  const seen = new Set(custom.map((s) => s.id));
  return [...custom, ...BUILTIN_TEXT_STYLES.filter((s) => !seen.has(s.id))];
}

/**
 * Resolve a label's effective typography.
 *
 * **The named style is the authority for the five typographic axes** — family, size, weight, slant
 * and width factor — and the label keeps everything else (colour, background, border, padding).
 * That split is not arbitrary: `TextLabelStyle` has no optional typographic fields, so every label
 * always carries *some* family and size, and there is no way to tell "the surveyor chose Arial"
 * from "Arial is what the default happened to be". With no way to distinguish them, a
 * label-overrides-style rule would mean the style never applied to anything.
 *
 * A dangling `textStyleId` leaves the label exactly as it was: the drawing renders, and the way to
 * notice is the picker showing an unknown style, not a page of silently re-fonted text.
 */
export function resolveTextLabelStyle(
  style: TextLabelStyle,
  custom: TextStyleDefinition[] = [],
): TextLabelStyle {
  const def = getTextStyle(style.textStyleId, custom);
  if (!def) return style;
  return {
    ...style,
    fontFamily: def.fontFamily,
    fontSize: def.fontSize,
    fontWeight: def.fontWeight,
    fontStyle: def.fontStyle,
    widthFactor: def.widthFactor,
    obliqueAngle: def.obliqueAngle,
  };
}

/** Width factor to actually render with. Clamped, because a 0 would collapse the text to an
 *  invisible sliver and a negative would mirror it — both look like the text vanished. */
export function clampWidthFactor(w: number | undefined): number {
  if (typeof w !== 'number' || !Number.isFinite(w)) return 1;
  return Math.min(4, Math.max(0.1, w));
}

export function effectiveWidthFactor(style: TextLabelStyle): number {
  return clampWidthFactor(style.widthFactor);
}

/** Oblique shear in RADIANS for the renderer. Clamped to ±60°: past that the glyphs lie down and
 *  the text is unreadable, which no surveyor is asking for. */
export function effectiveObliqueRadians(style: TextLabelStyle): number {
  const a = style.obliqueAngle;
  if (typeof a !== 'number' || !Number.isFinite(a) || a === 0) return 0;
  return (Math.min(60, Math.max(-60, a)) * Math.PI) / 180;
}

/**
 * C20 — the same resolution for a standalone TEXT feature.
 *
 * A TEXT feature keeps its font in the untyped `properties` bag (`fontSize`, `fontFamily`,
 * `fontWeight`, `fontStyle`) — a THIRD place fonts live, beside `TextLabelStyle` and the per-layer
 * label preferences. C18 named the first two; leaving this one out would mean "select the drawing's
 * text and give it the Plat Title style" worked for a bearing label and not for the title itself.
 *
 * Reads the same `textStyleId` key, so one style governs both kinds of text.
 */
export interface ResolvedTextFeatureStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  widthFactor: number;
  obliqueAngle: number;
}

export function resolveTextFeatureStyle(
  properties: Record<string, unknown>,
  custom: TextStyleDefinition[] = [],
): ResolvedTextFeatureStyle {
  const def = getTextStyle(
    typeof properties.textStyleId === 'string' ? properties.textStyleId : null,
    custom,
  );
  if (def) {
    return {
      fontFamily: def.fontFamily,
      fontSize: def.fontSize,
      fontWeight: def.fontWeight,
      fontStyle: def.fontStyle,
      widthFactor: clampWidthFactor(def.widthFactor),
      obliqueAngle: def.obliqueAngle,
    };
  }
  // No style, or a dangling one: the raw bag, with the defaults these three call sites already
  // used. Changing any of them here would re-font every existing TEXT feature in every drawing.
  return {
    fontFamily: String(properties.fontFamily ?? 'Arial'),
    fontSize: Number(properties.fontSize ?? 12),
    fontWeight: (properties.fontWeight ?? 'normal') as 'normal' | 'bold',
    fontStyle: (properties.fontStyle ?? 'normal') as 'normal' | 'italic',
    widthFactor: clampWidthFactor(
      typeof properties.widthFactor === 'number' ? properties.widthFactor : undefined,
    ),
    obliqueAngle: typeof properties.obliqueAngle === 'number' ? properties.obliqueAngle : 0,
  };
}

/**
 * C20 — how many labels in this drawing follow `styleId`.
 *
 * Deleting a style is not destructive (a dangling reference renders as "(missing)" rather than
 * silently re-fonting the page), but "delete Bearing & Distance?" and "delete Bearing & Distance,
 * used by 412 labels?" are different questions, and only one of them can be answered.
 *
 * Counts labels, not features: one feature commonly carries a bearing label and a distance label
 * following two different styles, so a feature count would understate it.
 */
export function countLabelsUsingTextStyle(
  features: Iterable<{ textLabels?: Array<{ style: TextLabelStyle }> }>,
  styleId: string,
): number {
  let n = 0;
  for (const f of features) {
    for (const l of f.textLabels ?? []) {
      if (l.style.textStyleId === styleId) n += 1;
    }
  }
  return n;
}

/** Validate a style name before saving. Mirrors `validateLayerStateName` (C8) so the two naming
 *  flows refuse the same things for the same reasons. */
export function validateTextStyleName(
  name: string,
  existing: TextStyleDefinition[],
  editingId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the style a name.';
  if (trimmed.length > 64) return 'Keep the name under 64 characters.';
  const clash = existing.some(
    (s) => s.id !== editingId && s.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return `A text style called "${trimmed}" already exists.`;
  return null;
}
