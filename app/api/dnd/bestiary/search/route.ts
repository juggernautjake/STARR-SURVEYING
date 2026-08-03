// app/api/dnd/bestiary/search/route.ts — search the catalogue from a client surface (P13-13b).
//
// `/dnd/bestiary` filters entirely in the database through `loadBestiary()`, but it is a SERVER component:
// its filters are links and each keystroke would be a navigation. The map's placing control needs the same
// search from the client, mid-session, without leaving the board — so this is `loadBestiary()` behind a
// GET, and deliberately nothing more. A second query here would be a second answer to "which creatures
// match", and the canonical-view reasoning in `query.ts` (one entry per creature, facets unioned across
// its rows) is exactly the reasoning a hand-rolled query would get wrong.
//
// WHAT IT RETURNS is narrowed to what a picker draws — id, name, CR, type, size, systems. The full
// `CatalogueCreature` carries statblocks and descriptions; sending 40 of those on every keystroke would
// be megabytes to render one line of text each.
//
// AUTH: signed-in, not DM. The bestiary is already browsable by anyone who can reach `/dnd/bestiary`, so
// requiring a DM here would gate a read that is public two clicks away — and the WRITE this feeds
// (`/map-objects`) does its own DM check, which is where the privilege actually matters.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { loadBestiary } from '@/lib/dnd/bestiary/query';

export const dynamic = 'force-dynamic';

/** Kept small on purpose — this is a type-ahead, not a browse. `/dnd/bestiary` is the browse. */
const MAX_LIMIT = 40;

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const system = url.searchParams.get('system')?.trim() || null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  try {
    const page = await loadBestiary({ q: q || null, system, limit });
    return NextResponse.json({
      creatures: page.creatures.map((c) => ({
        id: c.id,
        name: c.name,
        cr: c.cr ?? null,
        type: c.type ?? null,
        size: c.size ?? null,
        systems: c.systems ?? [],
      })),
      // The TOTAL, not the returned length — so a picker can say "20 of 312" instead of implying the
      // catalogue is 20 creatures long. Silent truncation reads as "that is all there is".
      total: page.total,
    });
  } catch {
    return NextResponse.json({ error: 'Could not search the bestiary.' }, { status: 500 });
  }
}
