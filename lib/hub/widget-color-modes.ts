// lib/hub/widget-color-modes.ts
//
// Catalog of the five `WidgetColorMode` values + the four
// `WidgetStatusTint` values + the three border-radius + four shadow
// depth options used by the Style tab. Each entry has a human-readable
// label + a short description.
//
// Slice 103 of customizable-hub-and-work-mode-2026-05-28.md.

import type {
  WidgetBorderRadius,
  WidgetColorMode,
  WidgetShadowDepth,
  WidgetStatusTint,
} from '@/lib/hub/types';

export interface ColorModeEntry {
  id: WidgetColorMode;
  label: string;
  description: string;
}

export const COLOR_MODES: ReadonlyArray<ColorModeEntry> = [
  { id: 'inherit',       label: 'Inherit',         description: 'Match the page background.' },
  { id: 'subtle-accent', label: 'Subtle accent',   description: 'Tint the surface with the theme accent.' },
  { id: 'accent',        label: 'Accent',          description: 'Full accent background + accent-fg text.' },
  { id: 'status',        label: 'Status',          description: 'Tint by a status color (success / warning / danger / info).' },
  { id: 'custom',        label: 'Custom',          description: 'Pick your own background + text colors.' },
];

export interface StatusTintEntry {
  id: WidgetStatusTint;
  label: string;
}

export const STATUS_TINTS: ReadonlyArray<StatusTintEntry> = [
  { id: 'info',    label: 'Info' },
  { id: 'success', label: 'Success' },
  { id: 'warning', label: 'Warning' },
  { id: 'danger',  label: 'Danger' },
];

export interface BorderRadiusEntry {
  id: WidgetBorderRadius;
  label: string;
  /** Pixel radius applied by the WidgetFrame's RADIUS_PX map — mirrored
   *  here so the Style tab can render a preview swatch without
   *  importing the frame. */
  px: number;
}

export const BORDER_RADII: ReadonlyArray<BorderRadiusEntry> = [
  { id: 'sharp',   label: 'Sharp',   px: 0 },
  { id: 'rounded', label: 'Rounded', px: 8 },
  { id: 'pill',    label: 'Pill',    px: 999 },
];

export interface ShadowDepthEntry {
  id: WidgetShadowDepth;
  label: string;
}

export const SHADOW_DEPTHS: ReadonlyArray<ShadowDepthEntry> = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Subtle' },
  { id: 2, label: 'Medium' },
  { id: 3, label: 'Strong' },
];

/** Look up a label by mode id — used in announce-style copy. */
export function labelForColorMode(id: WidgetColorMode): string {
  return COLOR_MODES.find((m) => m.id === id)?.label ?? id;
}

export function labelForStatusTint(id: WidgetStatusTint): string {
  return STATUS_TINTS.find((m) => m.id === id)?.label ?? id;
}
