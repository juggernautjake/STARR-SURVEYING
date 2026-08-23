// app/api/admin/design/import/route.ts — trace a real page into a design.
//
//   GET  /api/admin/design/import          → { classes: string[] }  the catalogue's class index
//   POST /api/admin/design/import { … }    → { doc, coverage }
//
// ── WHY THE MATCHING HAPPENS HERE AND NOT IN THE SCRIPT ─────────────────────────────────────────
//
// `scripts/design-import-page.mjs` is a `.mjs` file driving Playwright; it cannot import the
// TypeScript catalogue. The tempting workaround is to reimplement class matching inside the script,
// which would put the most consequential logic in the one file no test covers — and matching is
// where an import quietly goes wrong, by labelling a `.admin-btn--danger` as a plain button.
//
// So the script does what only a browser can do (walk a live page and measure it), and posts the
// raw nodes here. The matching runs against the real catalogue, in `lib/design/import.ts`, which is
// pure and tested.
//
// The GET exists so the script can filter as it walks: a page has ~1,200 nodes and the payload
// stays small if it only sends the ones the catalogue might recognise, plus text leaves.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ENTRIES } from '@/lib/design/catalogue';
import { documentFromCapture, type CapturedNode } from '@/lib/design/import';
import { saveMockup } from '@/lib/design/server';

async function gate() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isDeveloper(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const { error } = await gate();
  if (error) return error;
  const classes = [...new Set(ENTRIES.flatMap((e) => e.classes))].sort();
  return NextResponse.json({ classes, entries: ENTRIES.length });
});

/** A capture is a lot of untrusted shape; anything malformed is dropped rather than trusted. */
function sane(nodes: unknown): CapturedNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((n): n is CapturedNode =>
    !!n && typeof n === 'object'
    && typeof (n as CapturedNode).tag === 'string'
    && Array.isArray((n as CapturedNode).classes)
    && !!(n as CapturedNode).rect
    && typeof (n as CapturedNode).rect.w === 'number');
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { error, email } = await gate();
  if (error) return error;

  const body = await req.json().catch(() => null) as {
    name?: string; route?: string; desktop?: unknown; mobile?: unknown; dryRun?: boolean;
  } | null;
  if (!body?.route) return NextResponse.json({ error: 'Which route was captured?' }, { status: 400 });

  const now = new Date().toISOString();
  const id = `d-${Date.now().toString(36)}-imp${Math.floor(Math.random() * 1296).toString(36)}`;

  const { doc, coverage } = documentFromCapture({
    id,
    name: body.name || `${body.route} — as it is today`,
    route: body.route,
    now,
    desktop: sane(body.desktop),
    mobile: sane(body.mobile),
    entries: ENTRIES,
  });

  // The coverage sweep (C9) asks this question of all 147 routes. Saving each answer would leave
  // 147 designs nobody asked for, and the sweep only wants the report — so it says so.
  if (body.dryRun) return NextResponse.json({ coverage });

  const saved = await saveMockup(doc, email!, now, `imported from ${body.route}`);
  return NextResponse.json({ doc: saved, coverage });
});
