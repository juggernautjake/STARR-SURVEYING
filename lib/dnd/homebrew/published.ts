// lib/dnd/homebrew/published.ts — load the PUBLISHED catalog for the surfaces that show it (P6-10).
//
// WHY THIS IS ITS OWN MODULE, AND NOT A CHANGE INSIDE library.ts.
//
// `lib/dnd/library.ts` is deliberately pure and DB-free: its own header says the library "needs no DB
// round-trip and works with no embeddings key", and that property is load-bearing — the rules reference
// renders and searches correctly on a cold deploy with an empty database, which is why the six
// under-construction systems can be fully documented while nothing is seeded for them.
//
// Making it read `dnd_homebrew` directly would trade that away for a feature nobody has published to yet.
// So instead the library takes an **injectable** catalog (`extraHomebrew`, defaulting to `[]`), and this
// module is what callers use to fill it. Pass nothing and you get exactly the previous behaviour: the two
// hand-authored seeds and nothing else.
//
// The split also keeps the failure mode right. If this query fails — bad credentials, a missing table on a
// fresh environment — the library still renders every official rule, minus the community extras. A library
// that 500s because someone's homebrew table is unreachable would be a much worse trade than one that is
// briefly missing the extras.
import { supabaseAdmin } from '@/lib/supabase';
import type { HomebrewContent } from './model';
import { rowToHomebrew, isBrowsable, type HomebrewRow, type StoredHomebrew } from './store';

/**
 * Every piece a public surface may show: `public` visibility, not `rejected`, scoped to one system when
 * asked. `'any'`-scoped pieces are always included — they belong to every system by definition, and
 * filtering them out is how system-agnostic content vanishes from precisely the lists it was scoped for.
 *
 * Returns `[]` rather than throwing on any failure, for the reason in the header.
 */
export async function loadPublishedHomebrew(system?: string): Promise<StoredHomebrew[]> {
  try {
    let q = supabaseAdmin
      .from('dnd_homebrew')
      .select('*')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      // The library renders every entry inline, so this is a page-size guard, not a paging strategy. If a
      // system ever has more than this, the library needs its own pagination and this cap is the signal.
      .limit(400);
    if (system) q = q.in('system', [system, 'any']);

    const { data, error } = await q;
    if (error) return [];

    const rows = (data ?? []) as HomebrewRow[];
    const ids = [...new Set(rows.map((r) => r.owner_user_id))];
    if (!ids.length) return [];

    // Attribution in one batched lookup. The model REQUIRES a creator name, so a piece whose author has
    // been deleted is dropped rather than shown as "Unknown" — inventing attribution is worse than
    // omitting the row, and the catalog is the one place a creator's credit is the point.
    const { data: users } = await supabaseAdmin.from('dnd_users').select('id, display_name').in('id', ids);
    const names = new Map<string, string>();
    for (const u of (users ?? []) as { id: string; display_name: string | null }[]) {
      if (u.display_name) names.set(u.id, u.display_name);
    }

    return rows
      .map((r) => rowToHomebrew(r, names.get(r.owner_user_id) ?? ''))
      .filter((p): p is StoredHomebrew => p !== null && isBrowsable(p));
  } catch {
    return [];
  }
}

/** The same list narrowed to the pure model, which is all `library.ts` and the AI grounding need. Keeps
 *  the Studio-only fields (visibility, ownership, assessment) out of surfaces that have no business
 *  reading them. */
export async function loadPublishedForLibrary(system?: string): Promise<HomebrewContent[]> {
  return (await loadPublishedHomebrew(system)).map((p) => ({
    id: p.id, kind: p.kind, name: p.name, system: p.system, creator: p.creator,
    status: p.status, summary: p.summary, description: p.description, tags: p.tags,
    payload: p.payload, createdAt: p.createdAt, updatedAt: p.updatedAt,
  }));
}
