// lib/search/pages.ts — find a PAGE, not just a record.
//
// Owner, 2026-08-04: *"the search everything link takes us to a search. I want this to work so that
// it can search pages and stuff too. We have a lot of info and links and pages and tools on this
// website, and we need to be able to find them. If we go to the search page and input 'taxes' then
// all of the tools and pages and info on the site that relate to taxes should show up."*
//
// Search reads ten corpora and every one of them is **data** — documents, files, customers, jobs,
// contacts, leads, invoices. So "taxes" found receipts *about* tax and not the tax pages themselves,
// which is the opposite of what somebody typing a topic into a search box is asking for. In a
// product with 130-odd admin routes, "where is the thing that does X" is the more common question.
//
// ── IT SEARCHES THE NAV REGISTRY, NOT A NEW LIST ────────────────────────────────────────────────
//
// `ADMIN_ROUTES` already carries a label, a description written for humans, keywords, and the roles
// allowed to open each page — it is what the icon rail, the ⌘K palette, the mobile drawer and the
// breadcrumb resolver all read. A second list of "searchable pages" would drift from it within a
// month; this repo has the receipts for that, in a §1.3 audit that found two hand-maintained
// navigation lists 32 routes apart.
//
// So a page is findable exactly when it is registered, and a page nobody registered is invisible
// here for the same reason it is invisible in the menu — one fix, one place.

import { ADMIN_ROUTES, type AdminRoute } from '@/lib/admin/route-registry';

export interface PageHit {
  href: string;
  title: string;
  /** The route's own description — written to explain the page, so it is the right snippet. */
  snippet: string;
  /** Higher is better. Only the ordering matters; the number is not shown. */
  score: number;
  /** Which field matched, so the UI can say *why* a page came back for a word not in its title. */
  matchedOn: 'title' | 'description' | 'keyword' | 'path';
}

/** Where a match counts for most. A title hit is what the searcher meant; a path hit is a guess. */
const WEIGHT = { title: 100, keyword: 60, description: 30, path: 10 } as const;

function visibleTo(route: AdminRoute, roles: readonly string[]): boolean {
  // No `roles` on the route means every signed-in user may open it. Mirrors the rail's own rule
  // rather than restating a stricter one — a search that hides pages the menu shows would read as
  // the search being broken.
  if (!route.roles || route.roles.length === 0) return true;
  return route.roles.some((r) => roles.includes(r));
}

/**
 * Rank registered pages against a query.
 *
 * Every term must match *something* on the route (AND across terms, OR across fields), so "tax
 * report" does not return every page mentioning "report". A page that matches one term of three is
 * noise in a list somebody is scanning for one answer.
 */
export function searchPages(query: string, roles: readonly string[], limit = 8): PageHit[] {
  const terms = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const hits: PageHit[] = [];

  for (const route of ADMIN_ROUTES) {
    if (!visibleTo(route, roles)) continue;

    const title = route.label.toLowerCase();
    const description = (route.description ?? '').toLowerCase();
    const keywords = (route.keywords ?? []).map((k) => k.toLowerCase());
    const path = route.href.toLowerCase();

    let score = 0;
    let best: PageHit['matchedOn'] = 'path';
    let bestWeight = 0;
    let allTermsMatched = true;

    for (const term of terms) {
      let termWeight = 0;
      let where: PageHit['matchedOn'] = 'path';

      if (title.includes(term)) { termWeight = WEIGHT.title; where = 'title'; }
      else if (keywords.some((k) => k.includes(term))) { termWeight = WEIGHT.keyword; where = 'keyword'; }
      else if (description.includes(term)) { termWeight = WEIGHT.description; where = 'description'; }
      else if (path.includes(term)) { termWeight = WEIGHT.path; where = 'path'; }

      if (termWeight === 0) { allTermsMatched = false; break; }
      score += termWeight;
      if (termWeight > bestWeight) { bestWeight = termWeight; best = where; }
    }

    if (!allTermsMatched) continue;

    // A whole-word title match beats a substring one, so searching "job" puts "Jobs" above
    // "Job Files" — the shorter, more general page is nearly always the one meant.
    if (terms.some((t) => title === t || title.startsWith(`${t} `))) score += 40;

    hits.push({
      href: route.href,
      title: route.label,
      snippet: route.description ?? '',
      score,
      matchedOn: best,
    });
  }

  // Ties broken by the shorter label: "Money" before "Money Out Reconciliation" for a bare "money".
  return hits
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length)
    .slice(0, limit);
}
