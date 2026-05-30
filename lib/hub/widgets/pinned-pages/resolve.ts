// lib/hub/widgets/pinned-pages/resolve.ts
//
// hub-widget-excellence-15 — pinned-pages R2: "never render a dead
// link". The resolution logic is shared with recent-activity, so it
// now lives in `_shared/route-resolve`; this module re-exports it under
// the pinned-pages names the widget + its specs already use.

export {
  resolveRouteHrefs as resolvePinnedRoutes,
  deepestPrefix,
  type RouteLike,
  type ResolvedRoute as PinnedItem,
} from '@/lib/hub/widgets/_shared/route-resolve';
