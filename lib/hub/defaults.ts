// lib/hub/defaults.ts
//
// Per-persona default hub layouts. Used when a user has no
// `user_hub_layouts` row yet — the GET /hub-layout route falls back
// here so first-time users see a sensible canvas instead of empty
// space.
//
// Each layout is a hand-curated mix of widgets that match the
// persona's daily workflow per v2 §5.3 of the planning doc. Widgets
// that aren't shipped yet (slices 94+) render via the WidgetGrid's
// unknown-widget placeholder until their slice lands — the layout
// itself stays valid.
//
// Slice 93 of customizable-hub-and-work-mode-2026-05-28.md.

import type { Persona } from '@/lib/admin/personas';
import type { WidgetInstance } from './types';

/** Per-persona layout. The renderer fills in missing widgets with the
 *  "unknown widget" placeholder, so adding a widget to the catalog
 *  doesn't break existing layouts. */
export const PERSONA_DEFAULT_LAYOUTS: Record<Persona, WidgetInstance[]> = {
  'field-surveyor': [
    { id: 'def_today',  type: 'today-schedule',   x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_jobs',   type: 'my-jobs',          x: 6, y: 0, w: 6, h: 2 },
    { id: 'def_qa',     type: 'quick-actions',    x: 0, y: 2, w: 6, h: 2 },
    { id: 'def_pay',    type: 'my-pay',           x: 6, y: 2, w: 4, h: 2 },
    { id: 'def_pinned', type: 'pinned-pages',     x: 0, y: 4, w: 6, h: 2 },
    { id: 'def_pto',    type: 'pto-balance',      x: 6, y: 4, w: 4, h: 2 },
  ],
  'equipment-manager': [
    { id: 'def_eqout',  type: 'equipment-out-today', x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_maint',  type: 'maintenance-due',     x: 6, y: 0, w: 6, h: 2 },
    { id: 'def_cons',   type: 'low-consumables',     x: 0, y: 2, w: 4, h: 2 },
    { id: 'def_veh',    type: 'vehicles-status',     x: 4, y: 2, w: 8, h: 2 },
    { id: 'def_jobs',   type: 'my-jobs',             x: 0, y: 4, w: 6, h: 2 },
    { id: 'def_qa',     type: 'quick-actions',       x: 6, y: 4, w: 6, h: 2 },
  ],
  'dispatcher': [
    { id: 'def_crew',   type: 'crew-calendar',    x: 0, y: 0, w: 12, h: 3 },
    { id: 'def_jobs',   type: 'my-jobs',          x: 0, y: 3, w: 6, h: 2 },
    { id: 'def_ass',    type: 'assignments-due',  x: 6, y: 3, w: 6, h: 2 },
    { id: 'def_team',   type: 'team-status',      x: 0, y: 5, w: 6, h: 2 },
    { id: 'def_pto',    type: 'pending-time-off', x: 6, y: 5, w: 6, h: 2 },
    { id: 'def_qa',     type: 'quick-actions',    x: 0, y: 7, w: 12, h: 1 },
  ],
  'bookkeeper': [
    { id: 'def_rec',    type: 'pending-receipts',    x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_pto',    type: 'pending-time-off',    x: 6, y: 0, w: 6, h: 2 },
    { id: 'def_hrs',    type: 'pending-hours',       x: 0, y: 2, w: 6, h: 2 },
    { id: 'def_inv',    type: 'outstanding-invoices', x: 6, y: 2, w: 6, h: 2 },
    { id: 'def_jobs',   type: 'recent-jobs-created', x: 0, y: 4, w: 6, h: 2 },
    { id: 'def_rev',    type: 'monthly-revenue',     x: 6, y: 4, w: 6, h: 2 },
  ],
  'researcher': [
    { id: 'def_proj',  type: 'active-research-projects', x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_pipe',  type: 'pipeline-status',          x: 6, y: 0, w: 6, h: 2 },
    { id: 'def_disc',  type: 'recent-discoveries',       x: 0, y: 2, w: 6, h: 2 },
    { id: 'def_jobs',  type: 'my-jobs',                  x: 6, y: 2, w: 6, h: 2 },
    { id: 'def_qa',    type: 'quick-actions',            x: 0, y: 4, w: 6, h: 2 },
    { id: 'def_cov',   type: 'coverage-snapshot',        x: 6, y: 4, w: 6, h: 3 },
  ],
  'admin': [
    { id: 'def_jobs',   type: 'my-jobs',           x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_rec',    type: 'pending-receipts',  x: 6, y: 0, w: 6, h: 2 },
    { id: 'def_today',  type: 'today-schedule',    x: 0, y: 2, w: 6, h: 2 },
    { id: 'def_team',   type: 'team-status',       x: 6, y: 2, w: 6, h: 2 },
    { id: 'def_rev',    type: 'monthly-revenue',   x: 0, y: 4, w: 6, h: 2 },
    { id: 'def_qa',     type: 'quick-actions',     x: 6, y: 4, w: 6, h: 2 },
  ],
  'student': [
    { id: 'def_assn',  type: 'class-assignments',  x: 0, y: 0, w: 6, h: 2 },
    { id: 'def_road',  type: 'roadmap-progress',   x: 6, y: 0, w: 6, h: 1 },
    { id: 'def_rec',   type: 'recommended-lessons', x: 6, y: 1, w: 6, h: 1 },
    { id: 'def_fc',    type: 'flashcards-due',     x: 0, y: 2, w: 3, h: 1 },
    { id: 'def_qh',    type: 'quiz-history',       x: 3, y: 2, w: 3, h: 1 },
    { id: 'def_pin',   type: 'pinned-pages',       x: 6, y: 2, w: 6, h: 2 },
  ],
};

/** Fallback when persona inference somehow returns an unknown value
 *  (e.g., a future persona is added to lib/admin/personas without a
 *  layout being added here). Surfaces a single-row pinned-pages widget
 *  so the user can still navigate. */
export const FALLBACK_DEFAULT_LAYOUT: WidgetInstance[] = [
  { id: 'def_pin', type: 'pinned-pages', x: 0, y: 0, w: 12, h: 2 },
];

/** Returns the default layout for the given persona, or
 *  `FALLBACK_DEFAULT_LAYOUT` if unmapped. */
export function defaultLayoutForPersona(persona: Persona): WidgetInstance[] {
  return PERSONA_DEFAULT_LAYOUTS[persona] ?? FALLBACK_DEFAULT_LAYOUT;
}
