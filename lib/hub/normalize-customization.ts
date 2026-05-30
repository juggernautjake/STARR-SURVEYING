// lib/hub/normalize-customization.ts
//
// Slice 5 of employee-hub-overhaul-2026-05-30.md. Pure helper that
// runs on the server-fetched widget list before it lands in the hub
// store. Two jobs:
//
//   1. Tolerate old saved layouts. Pre-overhaul `WidgetCustomization`
//      carried `colorMode/statusTint/customBg/customFg/borderRadius/
//      shadowDepth` (style) + `showTitle` (layout) + `interaction.*`.
//      The render path is migrating off those; the type still names
//      them for back-compat, but we make sure any unknown / removed
//      field can't crash the store on load.
//
//   2. Force header visibility. The user ask is "the label header
//      title for the widget should always be visible", so we drop
//      any persisted `layout.showTitle === false` on load. The
//      surveyor can't accidentally end up with a hidden header from
//      a pre-overhaul save.
//
// The helper is intentionally lenient: it copies known fields through
// and silently discards unknown ones. Never throws — a malformed row
// degrades to default chrome rather than nuking the user's hub.

import type {
  Density,
  WidgetBorderRadius,
  WidgetClickAction,
  WidgetColorMode,
  WidgetCustomization,
  WidgetInstance,
  WidgetShadowDepth,
  WidgetStatusTint,
} from './types';

const COLOR_MODES: ReadonlySet<WidgetColorMode> = new Set([
  'inherit',
  'accent',
  'subtle-accent',
  'status',
  'custom',
]);
const STATUS_TINTS: ReadonlySet<WidgetStatusTint> = new Set([
  'success',
  'warning',
  'danger',
  'info',
]);
const RADII: ReadonlySet<WidgetBorderRadius> = new Set(['sharp', 'rounded', 'pill']);
const SHADOW_DEPTHS: ReadonlySet<number> = new Set([0, 1, 2, 3]);
const CLICK_ACTIONS: ReadonlySet<WidgetClickAction> = new Set(['navigate', 'expand', 'none']);
const DENSITIES: ReadonlySet<Density> = new Set(['compact', 'comfortable', 'spacious']);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}
function asKnown<T>(v: unknown, set: ReadonlySet<T>): T | undefined {
  return typeof v === 'string' && (set as ReadonlySet<unknown>).has(v) ? (v as T) : undefined;
}

export function normalizeCustomization(
  raw: unknown,
): WidgetCustomization | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;

  const out: WidgetCustomization = {};

  // Layout — title always visible post-Slice-5, so `showTitle` is
  // dropped from the loaded shape even if the saved row had it.
  if (c.layout && typeof c.layout === 'object') {
    const l = c.layout as Record<string, unknown>;
    const titleOverride = asString(l.titleOverride);
    const density = asKnown<Density>(l.density, DENSITIES);
    const layout: WidgetCustomization['layout'] = {};
    if (titleOverride !== undefined) layout.titleOverride = titleOverride;
    if (density !== undefined) layout.density = density;
    if (Object.keys(layout).length > 0) out.layout = layout;
  }

  // Style — the new headerColor passes through; the legacy fields
  // also pass through (still on the type for back-compat) but are
  // dropped if their values don't match the documented enum sets.
  if (c.style && typeof c.style === 'object') {
    const s = c.style as Record<string, unknown>;
    const headerColor = asString(s.headerColor);
    const colorMode = asKnown<WidgetColorMode>(s.colorMode, COLOR_MODES);
    const statusTint = asKnown<WidgetStatusTint>(s.statusTint, STATUS_TINTS);
    const customBg = asString(s.customBg);
    const customFg = asString(s.customFg);
    const borderRadius = asKnown<WidgetBorderRadius>(s.borderRadius, RADII);
    const shadowRaw = asNumber(s.shadowDepth);
    const shadowDepth = shadowRaw !== undefined && SHADOW_DEPTHS.has(shadowRaw)
      ? (shadowRaw as WidgetShadowDepth)
      : undefined;
    const style: WidgetCustomization['style'] = {};
    if (headerColor !== undefined) style.headerColor = headerColor;
    if (colorMode !== undefined) style.colorMode = colorMode;
    if (statusTint !== undefined) style.statusTint = statusTint;
    if (customBg !== undefined) style.customBg = customBg;
    if (customFg !== undefined) style.customFg = customFg;
    if (borderRadius !== undefined) style.borderRadius = borderRadius;
    if (shadowDepth !== undefined) style.shadowDepth = shadowDepth;
    if (Object.keys(style).length > 0) out.style = style;
  }

  // Content — opaque per-widget bag. Pass through unchanged when
  // it's an object; drop if anything else.
  if (c.content && typeof c.content === 'object' && !Array.isArray(c.content)) {
    out.content = c.content as Record<string, unknown>;
  }

  // Interaction — pass through known keys only.
  if (c.interaction && typeof c.interaction === 'object') {
    const i = c.interaction as Record<string, unknown>;
    const clickAction = asKnown<WidgetClickAction>(i.clickAction, CLICK_ACTIONS);
    const clickTarget = asString(i.clickTarget);
    const refreshIntervalSec = asNumber(i.refreshIntervalSec);
    const showSeeAllLink = asBool(i.showSeeAllLink);
    const showRowActions = asBool(i.showRowActions);
    const interaction: WidgetCustomization['interaction'] = {};
    if (clickAction !== undefined) interaction.clickAction = clickAction;
    if (clickTarget !== undefined) interaction.clickTarget = clickTarget;
    if (refreshIntervalSec !== undefined) interaction.refreshIntervalSec = refreshIntervalSec;
    if (showSeeAllLink !== undefined) interaction.showSeeAllLink = showSeeAllLink;
    if (showRowActions !== undefined) interaction.showRowActions = showRowActions;
    if (Object.keys(interaction).length > 0) out.interaction = interaction;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeWidgetInstance(raw: unknown): WidgetInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const type = asString(r.type);
  const x = asNumber(r.x);
  const y = asNumber(r.y);
  const w = asNumber(r.w);
  const h = asNumber(r.h);
  if (!id || !type || x === undefined || y === undefined || w === undefined || h === undefined) {
    return null;
  }
  const customization = normalizeCustomization(r.customization);
  return customization ? { id, type, x, y, w, h, customization } : { id, type, x, y, w, h };
}

export function normalizeWidgets(raw: unknown): WidgetInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetInstance[] = [];
  for (const item of raw) {
    const norm = normalizeWidgetInstance(item);
    if (norm) out.push(norm);
  }
  return out;
}
