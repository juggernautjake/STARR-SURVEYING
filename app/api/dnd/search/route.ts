// app/api/dnd/search/route.ts — the command palette's index (P4-4, audit D-6).
//
// SCOPING IS THE WHOLE JOB HERE. A palette that searches "everything" is a palette that leaks: characters
// belong to people, campaigns have members, and the library is public. Each source below is fetched with
// the same rule the page that owns it uses, so the palette can never surface something its user could not
// already reach by navigating.
//
// The RANKING is in `lib/dnd/palette.ts` and is pure — this route only gathers.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { searchLibrary } from '@/lib/dnd/library';
import { characterCard } from '@/lib/dnd/character-card';
import { rankPalette, PALETTE_ACTIONS, type PaletteItem } from '@/lib/dnd/palette';

export const dynamic = 'force-dynamic';

/** Cheap ceiling on what we pull before ranking. The palette shows ~20; over-fetching to rank is fine. */
const FETCH_LIMIT = 200;

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  // An empty query returns the ACTIONS only, so opening the palette shows what it can do rather than a
  // blank box. Ranking an empty string would return nothing at all.
  if (!q) {
    return NextResponse.json({ items: PALETTE_ACTIONS.slice(0, 6) });
  }

  const items: PaletteItem[] = [...PALETTE_ACTIONS];

  // CHARACTERS — owned or played, the same rule `/dnd/characters` uses. Not "every character in every
  // campaign I am in": a DM browsing the palette should not have every player's sheet in their results.
  const { data: charRows } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, system, data')
    .or(`owner_user_id.eq.${session.userId},played_by_user_id.eq.${session.userId}`)
    .limit(FETCH_LIMIT);
  for (const c of (charRows ?? []) as { id: string; name: string; system: string | null; data: unknown }[]) {
    const card = characterCard(c.data, c.system);
    items.push({
      id: `c:${c.id}`,
      kind: 'character',
      title: c.name,
      subtitle: [card.line, card.systemName].filter(Boolean).join(' · '),
      href: `/dnd/characters/${c.id}`,
      keywords: [card.className, card.subclass].filter(Boolean).join(' '),
    });
  }

  // CAMPAIGNS — membership only. The public index at /dnd/campaigns is a separate, deliberately filtered
  // surface (P2-5); the palette is a shortcut to YOUR things, not a directory.
  const { data: memberRows } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('campaign_id, role')
    .eq('user_id', session.userId)
    .limit(FETCH_LIMIT);
  const memberships = (memberRows ?? []) as { campaign_id: string; role: string }[];
  if (memberships.length) {
    const { data: campRows } = await supabaseAdmin
      .from('dnd_campaigns')
      .select('id, name')
      .in('id', memberships.map((m) => m.campaign_id));
    const roleOf = new Map(memberships.map((m) => [m.campaign_id, m.role]));
    for (const c of (campRows ?? []) as { id: string; name: string }[]) {
      items.push({
        id: `g:${c.id}`,
        kind: 'campaign',
        title: c.name,
        subtitle: roleOf.get(c.id) === 'dm' ? 'You run this' : 'You play here',
        href: `/dnd/campaigns/${c.id}`,
      });
    }
  }

  // CUSTOM CONTENT — yours, plus anything published. Mirrors what /dnd/content already shows, and degrades
  // to nothing if the Studio's table has not been created yet (seed 455) rather than failing the search.
  try {
    const { data: hbRows } = await supabaseAdmin
      .from('dnd_homebrew')
      .select('id, name, kind, system, visibility, created_by')
      .or(`created_by.eq.${session.userId},visibility.eq.public`)
      .limit(FETCH_LIMIT);
    for (const h of (hbRows ?? []) as { id: string; name: string; kind: string; system: string | null; created_by: string }[]) {
      items.push({
        id: `h:${h.id}`,
        kind: 'content',
        title: h.name,
        subtitle: [h.kind, h.created_by === session.userId ? 'yours' : 'shared'].filter(Boolean).join(' · '),
        href: `/dnd/content/${h.id}`,
        keywords: h.system ?? '',
      });
    }
  } catch {
    // The Studio is optional infrastructure until its seed is applied; a missing table must not break the
    // palette's other sources.
  }

  // LIBRARY — public, and the one source with a real prose engine already. Reusing `searchLibrary` here is
  // the part of the slice's "reuse the library's keyword engine" that genuinely applies: these ARE articles.
  for (const hit of searchLibrary(q, null, 12)) {
    items.push({
      id: `l:${hit.system}:${hit.name}`,
      kind: 'library',
      title: hit.name,
      // The KIND (class, spell, condition) as well as the system: two systems can both have a "Rage", and
      // the system alone does not say what you are about to open.
      subtitle: [hit.kind, hit.systemName].filter(Boolean).join(' · '),
      href: `/dnd/library/${hit.system}`,
      // NO BODY IN KEYWORDS, and this was a real bug caught in the browser rather than by a test.
      //
      // Passing `hit.body` made every article match on any substring anywhere in its prose, so searching
      // "orin" returned "Restoring Touch", "Spell-Storing Item" and "Confused" above the character actually
      // named Orin — seven rows of noise under one right answer. A palette that returns plausible-looking
      // rubbish is worse than one that returns less: you stop trusting the first result.
      //
      // Library items are therefore scored on their NAME. `searchLibrary` has already decided the article
      // is relevant to the query; the palette's job is only to rank what you are trying to NAVIGATE to. An
      // article that matches only deep in its body still belongs in the library's own full-text search,
      // which is a page built for reading, not a jump list.
    });
  }

  return NextResponse.json({ items: rankPalette(items, q, 20) });
}
