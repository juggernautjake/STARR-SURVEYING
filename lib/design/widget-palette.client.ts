'use client';

// lib/design/widget-palette.client.ts — the palette, read where the registry actually exists.
//
// W2 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── A CORRECTION, AND THE MISTAKE IT CORRECTS ───────────────────────────────────────────────────
//
// This was first built as `GET /api/admin/design/widgets`, on the reasoning that importing the
// registry into the design studio would pull all 54 widget implementations into its bundle, and
// that the server should hand the client a JSON projection instead — the same seam as
// `/api/admin/design/import`.
//
// The reasoning was sound and the conclusion was wrong, because **the registry does not exist on
// the server.** Every widget module begins with `'use client'`. In a Route Handler, Next replaces
// such a module with a client-reference proxy and never executes its body — so the `defineWidget()`
// calls in `register-all` do not run, and `allWidgets()` returns an empty array. The endpoint
// answered 200 with a palette of nothing.
//
// It was caught immediately only because the route REFUSED an empty palette instead of returning
// it. Had it shipped the empty array, the studio would have rendered "no widgets available" and the
// obvious suspect would have been the studio, not the endpoint. That refusal was written on the
// general principle that an empty palette is indistinguishable from a product with no widgets; it
// turned out to be the thing that found the bug on the first request.
//
// Confirming rather than assuming: `AddWidgetModal` and `GridEditor` are the only two consumers of
// `allWidgets()` in the codebase, and both are client components. There has never been a
// server-side reader.
//
// ── SO THE BUNDLE COST IS REAL, AND IT IS ACCEPTED ──────────────────────────────────────────────
//
// `/admin/me` already imports `register-all` for exactly this reason and pays exactly this cost.
// The design studio is a developer-only tool behind `isDeveloper`. Paying a precedented cost on one
// internal page beats restructuring 54 widget modules to split their metadata out — which is the
// only other way to make this readable from a server, and which would leave every widget's
// description in a different file from the widget.
//
// What the projection still buys, and the reason `toPaletteWidget` survives the correction: no
// React component ever reaches a stored design, a JSON response, or a test.

import '@/lib/hub/widgets/register-all';
import { allWidgets } from '@/lib/hub/widget-registry';
import { toPaletteWidget, groupByCategory, type PaletteWidget } from './widget-palette';

/**
 * Every widget a composition can be built from.
 *
 * Throws on an empty registry rather than returning `[]`, for the reason the endpoint's refusal
 * existed: a palette with nothing in it reads as "this product has no widgets", and the component
 * showing it is the last place anybody would look for the cause.
 */
export function paletteWidgets(): PaletteWidget[] {
  const widgets = allWidgets().map(toPaletteWidget);
  if (!widgets.length) {
    throw new Error('The widget registry is empty — `lib/hub/widgets/register-all` did not run.');
  }
  return widgets;
}

export function paletteGroups(): Array<{ category: string; widgets: PaletteWidget[] }> {
  return groupByCategory(paletteWidgets());
}
