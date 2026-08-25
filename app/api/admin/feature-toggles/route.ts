// app/api/admin/feature-toggles/route.ts — everything the toggle screen needs to draw a row.
//
//   GET /api/admin/feature-toggles → { destinations: [{ key, label, workspace, inbound, inboundFrom }] }
//
// T3 of §11 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// The toggle VALUES come from `/api/admin/settings`, which already owns `app_settings`. This adds
// the half that screen cannot compute in a browser: how many other pages link to each destination.
//
// ── §11.6: TURNING SOMETHING OFF SHOULD SAY WHAT IT BREAKS ──────────────────────────────────────
//
// *"Pages link to each other. Switching off `/admin/vehicles` leaves the mileage screen pointing at
// a page nobody can open, and the person flipping the switch has no way to know. … Not a refusal, a
// sentence. The owner is allowed to break a link on purpose; they are not well served by doing it
// invisibly."*
//
// ── WHY THE SCAN RUNS PER REQUEST AND IS NOT A GENERATED FILE ───────────────────────────────────
//
// Every other derived inventory in this codebase is generated — `pages.generated.json`,
// `conformance.generated.json`, the catalogue index — and every one of them has, at some point, been
// stale and believed. A link count is advisory: being a request slower is free, and being WRONG is
// the failure that matters, because it would tell somebody nothing links to a page that three pages
// link to.
//
// This is an admin settings screen opened occasionally, and the scan is a few hundred small files
// under `app/admin`. `force-dynamic` because a cached answer is a stale one by another name.

import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ADMIN_ROUTES, findRoute } from '@/lib/admin/route-registry';

export const dynamic = 'force-dynamic';

/** Every `.tsx`/`.ts` under a directory. Route groups and private folders included — a link from a
 *  `_components` file is still a link somebody can click. */
function sources(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;                       // an unreadable directory is not a reason to fail the screen
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Which admin pages link to each route.
 *
 * Matched on the quoted href rather than a bare substring: `"/admin/jobs"` must not be found inside
 * `"/admin/jobs/new"`, or every parent route would inherit its children's inbound links and the
 * warning would be wrong in the direction that matters — overstating what breaks.
 */
function inboundLinks(): Map<string, string[]> {
  const root = process.cwd();
  const files = sources(path.join(root, 'app', 'admin'));
  const hrefs = ADMIN_ROUTES.map((r) => r.href);
  const map = new Map<string, string[]>(hrefs.map((h) => [h, []]));

  for (const file of files) {
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }

    // The page this file belongs to, so the answer names a PAGE rather than a path nobody
    // recognises. A component under `app/admin/mileage/_parts/Foo.tsx` is reported as Mileage.
    const rel = path.relative(root, file).split(path.sep).join('/');
    const owner = ADMIN_ROUTES
      .filter((r) => rel.startsWith(`app${r.href}/`) || rel === `app${r.href}/page.tsx`)
      .sort((a, b) => b.href.length - a.href.length)[0];

    // ── ONLY LINKS FROM A PAGE COUNT ─────────────────────────────────────────────────────────────
    //
    // A file under `app/admin/components/` belongs to no page — it is shared chrome that renders on
    // ALL of them. `AdminSidebar` and `AdminLayoutClient` link to every route in the registry by
    // construction, so counting them made every destination look like it had two or three more
    // dependants than it has, and `/admin/me` reported **19** when most of those were the navigation
    // itself listing it.
    //
    // That is worse than a wrong number: the sentence exists to tell somebody what they are about to
    // break, and "19 pages link here" when the real answer is a handful is exactly the kind of
    // inflated warning people learn to skip. Found by reading the output rather than by it failing.
    if (!owner) continue;

    for (const href of hrefs) {
      // A page linking to itself is not an inbound link, and reporting it would make every page
      // look like it had one more dependant than it does.
      if (owner.href === href) continue;
      if (!text.includes(`"${href}"`) && !text.includes(`'${href}'`) && !text.includes(`\`${href}\``)) continue;
      const list = map.get(href)!;
      const label = findRoute(owner.href)?.label ?? owner.href;
      if (!list.includes(label)) list.push(label);
    }
  }
  return map;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const links = inboundLinks();

  // ── EVERY ROUTE, NOT ONLY THE ONES THIS ADMIN CAN SEE ────────────────────────────────────────
  //
  // `accessibleRoutes` would be the obvious call and would be wrong here. This screen decides what
  // the FIRM uses, not what the person looking at it may open — filtering by their roles would hide
  // pages they are switching off on behalf of people who do have those roles, and a switch you
  // cannot find is indistinguishable from one that does not exist.
  //
  // `parked` routes ARE excluded: those are hidden from everybody by the registry already, so a
  // switch for one would do nothing and say nothing about why.
  const destinations = ADMIN_ROUTES
    .filter((r) => !r.parked)
    .map((r) => ({
      key: r.href,
      label: r.label,
      workspace: r.workspace,
      inboundFrom: links.get(r.href) ?? [],
      inbound: (links.get(r.href) ?? []).length,
    }));

  return NextResponse.json({ destinations });
}, { routeName: 'admin/feature-toggles' });
