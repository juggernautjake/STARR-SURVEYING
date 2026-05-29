// lib/hub/widget-registry.ts
//
// The widget catalog. Every widget that can appear on the hub is
// declared here via `defineWidget(...)`. Consumers:
//   - the Add-Widget modal lists every entry the user's role can see
//   - the WidgetGrid renders an instance by looking up the type → Widget
//   - settings panels render Layout/Style/Interaction generically and
//     the widget's own Content tab via the registry entry's
//     SettingsForm
//
// Future slices add more widgets — each is a single defineWidget() call
// (plus the actual component code) in a category-organised file under
// lib/hub/widgets/<id>/.
//
// Slice 90 of customizable-hub-and-work-mode-2026-05-28.md.

import type { ComponentType } from 'react';
import type { BundleId } from '@/lib/saas/bundles';
import type { UserRole } from '@/lib/auth';
import type { WidgetCustomization } from './types';

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

/** Props every widget body component receives. */
export interface WidgetProps<TContent = Record<string, unknown>> {
  /** Per-instance customization. Widget reads `customization.content`
   *  for its own settings. */
  customization: WidgetCustomization;
  /** Current grid size of this instance. Widget uses `sizeBucket()` on
   *  these to choose its sub-render. */
  size: { w: number; h: number };
  /** True when the canvas is in edit mode. Widgets can use this to
   *  show drag affordances. */
  editMode: boolean;
  /** Typed accessor for the widget's content settings. */
  content: TContent;
}

/** Props every widget's Settings form component receives. */
export interface WidgetSettingsFormProps<TContent = Record<string, unknown>> {
  value: TContent;
  onChange: (next: TContent) => void;
}

export interface WidgetDefinition<TContent = Record<string, unknown>> {
  /** Stable id used in saved layouts. Format: kebab-case. */
  id: string;
  label: string;
  description: string;
  category: WidgetCategory;
  /** Lucide icon name (string, not component) — see ADMIN_NAVIGATION_REDESIGN
   *  pattern. Consumers map to <Icon /> in their own renderer. */
  iconName: string;
  defaultSize: { w: number; h: number };
  /** Inclusive min/max grid sizes. Resize handle won't let the user
   *  go outside this envelope. */
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  defaultContent: TContent;
  /** Roles allowed to add this widget. Empty array = everyone.
   *  Filtered in the Add-Widget modal. */
  allowedRoles: UserRole[];
  /** Bundle gating. undefined for now (every shipped widget is free
   *  in v1) — slice 182 wires this against the org's active bundles. */
  requiresBundle?: BundleId;
  Widget: ComponentType<WidgetProps<TContent>>;
  /** Optional. When omitted the widget has no Content tab; users
   *  still get Layout / Style / Interaction. */
  SettingsForm?: ComponentType<WidgetSettingsFormProps<TContent>>;
  /** Slice 204 — optional per-widget skeleton shape rendered while
   *  the widget is loading its first payload. When omitted, the
   *  cell falls back to the generic `<WidgetSkeleton rows={3} />`.
   *  Declare one that matches the widget's actual content layout
   *  (rows of list items, calendar grid, bar chart) so the
   *  loading state previews what's about to appear instead of
   *  three identical bars. */
  Skeleton?: ComponentType<WidgetSkeletonProps<TContent>>;
}

/** Props passed to a widget's declarative skeleton. Receives the
 *  same size + content the actual Widget body gets so the skeleton
 *  can adapt to the surveyor's customization (e.g. show 5 row
 *  placeholders when `content.rowLimit === 5`). */
export interface WidgetSkeletonProps<TContent = Record<string, unknown>> {
  size: { w: number; h: number };
  content: TContent;
}

const REGISTRY = new Map<string, WidgetDefinition<Record<string, unknown>>>();

/** Register a widget. Idempotent — re-registering overwrites. */
export function defineWidget<TContent extends Record<string, unknown>>(
  def: WidgetDefinition<TContent>,
): void {
  REGISTRY.set(def.id, def as WidgetDefinition<Record<string, unknown>>);
}

/** Look up a registered widget. Returns undefined for unknown ids
 *  (the renderer surfaces an "unknown widget" placeholder). */
export function getWidget(id: string): WidgetDefinition<Record<string, unknown>> | undefined {
  return REGISTRY.get(id);
}

/** Every registered widget in insertion order. */
export function allWidgets(): WidgetDefinition<Record<string, unknown>>[] {
  return Array.from(REGISTRY.values());
}

/** Filter widgets to those the given roles can add to their hub.
 *  Used by the Add-Widget modal (slice 100). */
export function widgetsForRoles(roles: UserRole[]): WidgetDefinition<Record<string, unknown>>[] {
  return allWidgets().filter((w) => {
    if (w.allowedRoles.length === 0) return true;
    return w.allowedRoles.some((r) => roles.includes(r));
  });
}

/** Returns the skeleton component to render while a widget is
 *  loading its first payload. Falls back to a sentinel `null` when
 *  the registry entry doesn't declare one — the caller renders the
 *  generic `<WidgetSkeleton rows={3} />` in that case. Slice 204. */
export function getWidgetSkeleton(id: string): ComponentType<WidgetSkeletonProps> | null {
  const def = REGISTRY.get(id);
  return def?.Skeleton ?? null;
}

/** Group registered widgets by category for the Add-Widget catalog
 *  modal (slice 100). */
export function widgetsByCategory(): Record<WidgetCategory, WidgetDefinition<Record<string, unknown>>[]> {
  const out = {
    personal: [], work: [], 'time-pay': [], equipment: [],
    cad: [], research: [], learning: [], communication: [],
    office: [], financial: [], operational: [],
  } as Record<WidgetCategory, WidgetDefinition<Record<string, unknown>>[]>;
  for (const def of REGISTRY.values()) {
    out[def.category].push(def);
  }
  return out;
}
