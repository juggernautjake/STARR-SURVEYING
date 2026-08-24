// lib/design/pages.ts — every page in the product, and how far its review has got.
//
// Phase C of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"a list of every single page on the frontend and backend that we can reference in the
// design editor. I want it so that we can go through them one by one and work on each one and then
// check it off when we are satisfied."*
//
// The inventory is generated from the filesystem (`scripts/generate-page-inventory.mjs`) because a
// hand-kept list of 270 pages is wrong the day after somebody adds a route — and the page you
// forgot to add is the page you never review. The STATUS lives in the database, because a review is
// a decision a person made and it has to be the same on every machine.

import inventory from './pages.generated.json';

export type PageArea = 'admin' | 'public' | 'platform' | 'customer' | 'auth' | 'dnd';
export type ReviewStatus = 'not_started' | 'in_progress' | 'done' | 'skipped';

export interface InventoryPage {
  route: string;
  area: PageArea;
  /** `/admin/jobs/[id]` — one page serving many records. Designed once, but not visitable
   *  without picking a record, which is why it is marked rather than dropped. */
  dynamic: boolean;
  file: string;
}

export interface PageReview {
  route: string;
  status: ReviewStatus;
  note?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

/** A page plus what is known about it. */
export interface PageRow extends InventoryPage {
  status: ReviewStatus;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /** Designs that name this route, so "open the mockup" is one click. */
  designs: Array<{ id: string; name: string; status: string; locked: boolean }>;
  /** ── WHAT EXISTS FOR THIS PAGE, AT A GLANCE ──────────────────────────────────────────────────
   *
   * Owner: *"I will need it so that we have all of the pages listed out and so that we can click
   * them and be taken to the editor."* A list of 270 rows is only useful if each row answers the
   * question you came with — is there a default, is anything active, how much work is in flight —
   * without opening it. Derived here rather than in the component so the list and any other reader
   * agree. */
  lifecycle: {
    default: { id: string; name: string } | null;
    active: { id: string; name: string } | null;
    alternatives: number;
    drafts: number;
  };
}

export const PAGES: InventoryPage[] = inventory.routes as InventoryPage[];

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
};

/** The order the areas are shown in: the ones being reviewed first, the side project last. */
export const AREA_ORDER: PageArea[] = ['admin', 'customer', 'public', 'auth', 'platform', 'dnd'];

export const AREA_LABELS: Record<PageArea, string> = {
  admin: 'Admin — the employee portal',
  customer: 'Customer-facing',
  public: 'Public site',
  auth: 'Sign in and registration',
  platform: 'Platform operator',
  dnd: 'D&D (side project)',
};

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === 'not_started' || value === 'in_progress' || value === 'done' || value === 'skipped';
}

/**
 * Join the inventory to whatever reviews and designs exist.
 *
 * A page with no review row reads as `not_started` rather than being absent: the list has to show
 * every page, and "we have not touched this" is the most important status in it.
 */
export function joinPages(
  reviews: PageReview[],
  designs: Array<{ id: string; name: string; route: string | null; status?: string; locked?: boolean }>,
): PageRow[] {
  const byRoute = new Map(reviews.map((r) => [r.route, r]));
  const designsByRoute = new Map<string, Array<{ id: string; name: string; status: string; locked: boolean }>>();
  for (const d of designs) {
    if (!d.route) continue;
    const list = designsByRoute.get(d.route) ?? [];
    list.push({ id: d.id, name: d.name, status: d.status ?? 'draft', locked: !!d.locked });
    designsByRoute.set(d.route, list);
  }

  return PAGES.map((page) => {
    const review = byRoute.get(page.route);
    return {
      ...page,
      status: review?.status ?? 'not_started',
      note: review?.note ?? null,
      updatedBy: review?.updatedBy ?? null,
      updatedAt: review?.updatedAt ?? null,
      designs: designsByRoute.get(page.route) ?? [],
      lifecycle: lifecycleOf(designsByRoute.get(page.route) ?? []),
    };
  });
}

export interface Progress {
  total: number;
  done: number;
  inProgress: number;
  skipped: number;
  notStarted: number;
  /** Percent of the pages that are actually in scope — skipped ones do not count against you. */
  percent: number;
}

/**
 * How far through the walkthrough we are.
 *
 * `skipped` is removed from the denominator rather than counted as done. Of 270 pages a good number
 * are redirects, dynamic detail routes covered by designing their list, or the D&D side project —
 * and a progress bar that can never reach 100% is a progress bar people stop looking at.
 */
export function progressOf(rows: PageRow[]): Progress {
  const done = rows.filter((r) => r.status === 'done').length;
  const inProgress = rows.filter((r) => r.status === 'in_progress').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const inScope = rows.length - skipped;
  return {
    total: rows.length,
    done,
    inProgress,
    skipped,
    notStarted: rows.length - done - inProgress - skipped,
    percent: inScope > 0 ? Math.round((done / inScope) * 100) : 0,
  };
}

/** Group for display, in a fixed order, dropping areas with nothing in them. */
export function groupByArea(rows: PageRow[]): Array<{ area: PageArea; label: string; rows: PageRow[] }> {
  return AREA_ORDER
    .map((area) => ({ area, label: AREA_LABELS[area], rows: rows.filter((r) => r.area === area) }))
    .filter((group) => group.rows.length > 0);
}

/** Free-text filter over route, note and design names — the way somebody actually looks for a page. */
export function filterPages(rows: PageRow[], query: string): PageRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    r.route.toLowerCase().includes(q)
    || (r.note ?? '').toLowerCase().includes(q)
    || r.designs.some((d) => d.name.toLowerCase().includes(q)));
}

/**
 * Reduce a route's designs to the four facts the list needs.
 *
 * Phase N of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
 *
 * Counted rather than listed for the plural kinds: a page with nine drafts should say "9 drafts",
 * not print nine links and push the row off the screen. The two singular kinds are named, because
 * "which one is active" is the question the row exists to answer.
 */
export function lifecycleOf(
  designs: Array<{ id: string; name: string; status: string }>,
): PageRow['lifecycle'] {
  const find = (status: string) => {
    const hit = designs.find((d) => d.status === status);
    return hit ? { id: hit.id, name: hit.name } : null;
  };
  return {
    default: find('default'),
    active: find('active'),
    alternatives: designs.filter((d) => d.status === 'alternative').length,
    // `archived` is deliberately not counted anywhere: it is the bucket for things nobody should be
    // reminded of, and a row saying "3 archived" is a reminder.
    drafts: designs.filter((d) => d.status === 'draft').length,
  };
}
