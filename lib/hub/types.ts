// lib/hub/types.ts
//
// TypeScript shapes mirroring the `public.user_hub_layouts` table
// (seeds/301_user_hub_layouts.sql) and the per-widget customization
// contract from the customizable-hub planning doc.
//
// These types are the single source of truth consumed by:
//   - the GET/PUT/POST /api/admin/me/hub-layout routes (Slice 79)
//   - the widget registry (Slice 90)
//   - the WidgetFrame component (Slice 91)
//   - the settings panel tabs (Slices 102-104)
//
// Adding a new field here? Bump `LAYOUT_VERSION` and add an
// up-converter in lib/hub/migrate-layout.ts (lands in Phase 2 when the
// schema first changes). Never silently drop fields — old saved
// layouts should keep working forever.

/** Bump when the WidgetInstance / HubLayout shape changes in a
 *  non-backwards-compatible way. The API GET layer up-converts older
 *  rows on read. */
export const LAYOUT_VERSION = 1;

// ─── Theme ──────────────────────────────────────────────────────────────

export type BuiltinThemeId =
  | 'starr-default'
  | 'starr-dark'
  | 'slate-light'
  | 'slate-dark'
  | 'forest-light'
  | 'forest-dark'
  | 'sunset'
  | 'ocean'
  | 'plum'
  | 'high-contrast-light'
  | 'high-contrast-dark';

export type ThemeId = BuiltinThemeId | 'custom';

/** WCAG contrast ratio between two colors. 1.0 is no contrast, 21.0
 *  is pure white on pure black. */
export interface ContrastResult {
  /** Computed ratio. */
  ratio: number;
  /** Highest passed level. */
  passes: 'AAA' | 'AA' | 'AA-large-only' | 'fail';
}

/** Captured at custom-theme save time so the contrast guard's verdict
 *  is durable even if the spec or font sizes change later. */
export interface CustomThemeContrastAudit {
  primaryOnSurface: ContrastResult;
  primaryOnPage: ContrastResult;
  secondaryOnSurface: ContrastResult;
  accentFgOnAccent: ContrastResult;
  accentOnSurface: ContrastResult;
}

/** Saved when `theme = 'custom'`. The four user-input colors plus the
 *  eight system-derived ones, plus the audit. */
export interface CustomThemePayload {
  /** Human-readable name. Optional; UI auto-generates if blank. */
  name?: string;
  /** User-chosen. */
  bgPage: string;
  bgSurface: string;
  fgPrimary: string;
  accent: string;
  /** System-derived from the four above. */
  derived: {
    bgElevated: string;
    fgSecondary: string;
    fgMuted: string;
    accentFg: string;
    border: string;
    borderStrong: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
  };
  /** Captured at save time. */
  contrastAudit: CustomThemeContrastAudit;
}

// ─── Density + scale ────────────────────────────────────────────────────

export type Density = 'compact' | 'comfortable' | 'spacious';

/** Clamped at the app layer to [0.875, 1.5] for sensible UI. DB CHECK
 *  enforces a wider [0.75, 2.0] envelope as a defensive backstop. */
export type FontScale = number;

// ─── Widget instance ────────────────────────────────────────────────────

export type WidgetCategory =
  | 'personal'
  | 'work'
  | 'time-pay'
  | 'equipment'
  | 'cad'
  | 'research'
  | 'learning'
  | 'communication'
  | 'office'
  | 'financial'
  | 'operational';

export type WidgetColorMode =
  | 'inherit'        // uses --theme-bg-surface
  | 'accent'         // accent bg, accent-fg text
  | 'subtle-accent'  // tinted accent bg
  | 'status'         // success/warning/danger/info tint
  | 'custom';        // user-picked bg + auto-derived (or user-overridden) fg

export type WidgetStatusTint = 'success' | 'warning' | 'danger' | 'info';

export type WidgetBorderRadius = 'sharp' | 'rounded' | 'pill';

export type WidgetShadowDepth = 0 | 1 | 2 | 3;

export type WidgetClickAction = 'navigate' | 'expand' | 'none';

/** Customization stored alongside each widget instance. Every field
 *  optional so a fresh widget added by the catalog uses widget defaults
 *  + theme inheritance. */
export interface WidgetCustomization {
  layout?: {
    showTitle?: boolean;
    titleOverride?: string;
    /** Per-widget density override; falls back to page density. */
    density?: Density;
  };
  style?: {
    colorMode?: WidgetColorMode;
    statusTint?: WidgetStatusTint;
    customBg?: string;
    customFg?: string;
    borderRadius?: WidgetBorderRadius;
    shadowDepth?: WidgetShadowDepth;
  };
  /** Widget-specific. Shape defined by the widget's own SettingsForm
   *  + recorded on the WidgetDefinition. */
  content?: Record<string, unknown>;
  interaction?: {
    clickAction?: WidgetClickAction;
    clickTarget?: string;
    refreshIntervalSec?: number;
    showSeeAllLink?: boolean;
    showRowActions?: boolean;
  };
}

/** One widget on the user's hub. */
export interface WidgetInstance {
  /** Stable per-instance UUID. Survives reorders so settings stick to
   *  the right widget when the user shuffles things around. */
  id: string;
  /** Maps to a `WidgetDefinition.id` in the catalog. */
  type: string;
  /** Grid position. Top-left is (0, 0). */
  x: number;
  y: number;
  /** Grid width + height. Must be inside the widget definition's
   *  minSize..maxSize envelope. */
  w: number;
  h: number;
  customization?: WidgetCustomization;
}

// ─── Hub-level settings ─────────────────────────────────────────────────

export interface HubSettings {
  /** Whether to auto-collapse the greeting card after N minutes of
   *  session activity. */
  greetingAutoCollapseMin?: number;
  /** User-typed greeting prefix override (e.g., "Howdy"). When unset,
   *  the system picks based on time-of-day. */
  greetingPrefix?: string;
  /** Whether the Sign Out action lives in the top-bar directly or
   *  nested in the user menu. Default true (nested). */
  signOutInUserMenu?: boolean;
}

// ─── Full layout row ────────────────────────────────────────────────────

/** Mirrors the `user_hub_layouts` table 1:1 (camelCase TS columns). */
export interface HubLayoutRow {
  userEmail: string;
  layoutVersion: number;
  widgets: WidgetInstance[];
  activePersona: string | null;
  theme: ThemeId;
  customTheme: CustomThemePayload | null;
  density: Density;
  fontScale: FontScale;
  hubSettings: HubSettings;
  updatedAt: string;
}

/** Payload accepted by `PUT /api/admin/me/hub-layout`. The server fills
 *  in user_email + layout_version + updated_at. */
export interface HubLayoutPutPayload {
  widgets: WidgetInstance[];
  activePersona?: string | null;
  theme?: ThemeId;
  customTheme?: CustomThemePayload | null;
  density?: Density;
  fontScale?: FontScale;
  hubSettings?: HubSettings;
}

// ─── DB row shape (snake_case as PG returns) ────────────────────────────

/** Raw DB row. Only used inside the API route to map to/from
 *  `HubLayoutRow`. Components should NEVER see this shape. */
export interface HubLayoutDbRow {
  user_email: string;
  layout_version: number;
  widgets: WidgetInstance[];
  active_persona: string | null;
  theme: ThemeId;
  custom_theme: CustomThemePayload | null;
  density: Density;
  font_scale: number | string;
  hub_settings: HubSettings;
  updated_at: string;
}

/** Convert a DB row to the camelCase shape consumers expect. */
export function dbRowToHubLayout(row: HubLayoutDbRow): HubLayoutRow {
  return {
    userEmail: row.user_email,
    layoutVersion: row.layout_version,
    widgets: row.widgets ?? [],
    activePersona: row.active_persona,
    theme: row.theme,
    customTheme: row.custom_theme,
    density: row.density,
    fontScale:
      typeof row.font_scale === 'string'
        ? parseFloat(row.font_scale)
        : row.font_scale,
    hubSettings: row.hub_settings ?? {},
    updatedAt: row.updated_at,
  };
}
