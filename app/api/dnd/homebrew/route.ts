// app/api/dnd/homebrew/route.ts — the Content Studio's catalog (P6-4).
//   GET  ?mine=1 | ?system=… | ?kind=… | ?q=…  → the pieces this caller may see
//   POST                                        → create a piece, owned by the caller
//
// The authorization rules are NOT written here. They live in `lib/dnd/homebrew/store.ts` as pure
// functions (`canReadHomebrew`, `isBrowsable`, `visibleHomebrew`, `pickCreatorWritable`) with 27 tests
// over the whole visibility × status product, and this route calls them. That split is deliberate: a
// visibility rule expressed inline in a route handler is one that gets tested once, against a live table,
// in one direction.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { isHomebrewKind, homebrewMatchesSearch, validateHomebrew } from '@/lib/dnd/homebrew/model';
import { validateHomebrewPayload } from '@/lib/dnd/homebrew/adopt';
import { normalizeContentSystem, validateDraftFields, isPartialBuild, draftLevelReach } from '@/lib/dnd/homebrew/kinds';
import {
  rowToHomebrew, homebrewToRow, pickCreatorWritable, visibleHomebrew, statusForVisibility,
  normalizeVisibility, type HomebrewRow, type StoredHomebrew,
} from '@/lib/dnd/homebrew/store';

/** Resolve display names for a set of user ids in ONE lookup. Attribution is required by the model
 *  (content is never anonymous), and the row only carries `owner_user_id`. Same shape as the edit-log
 *  route's name resolution — a batched `in` beats an embed when the distinct authors are few. */
async function creatorNames(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await supabaseAdmin.from('dnd_users').select('id, display_name').in('id', unique);
  for (const u of (data ?? []) as { id: string; display_name: string | null }[]) {
    if (u.display_name) out.set(u.id, u.display_name);
  }
  return out;
}

/** Rows → models, dropping any row the model refuses (unknown kind, no name) and any whose author has
 *  been deleted. A piece with no resolvable creator is dropped rather than shown as "Unknown": the model
 *  requires attribution, and inventing one would be worse than omitting the row. */
function toPieces(rows: HomebrewRow[], names: Map<string, string>): StoredHomebrew[] {
  return rows
    .map((r) => rowToHomebrew(r, names.get(r.owner_user_id) ?? ''))
    .filter((p): p is StoredHomebrew => p !== null);
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  const viewer = { userId: session?.userId ?? null };
  const sp = req.nextUrl.searchParams;
  const mine = sp.get('mine') === '1';
  const system = sp.get('system');
  const kind = sp.get('kind');
  const q = sp.get('q') ?? '';

  if (mine && !viewer.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let query = supabaseAdmin.from('dnd_homebrew').select('*').order('updated_at', { ascending: false }).limit(500);
  if (mine) query = query.eq('owner_user_id', viewer.userId!);
  // `'any'`-scoped pieces belong to every system, so a system filter must include them or the Rangor
  // disappears from the very lists it was scoped to appear in.
  if (system) query = query.in('system', [system, 'any']);
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as HomebrewRow[];
  const pieces = toPieces(rows, await creatorNames(rows.map((r) => r.owner_user_id)));
  // The visibility filter runs HERE rather than in SQL: it is the rule with the tests, and duplicating it
  // as a `.or()` clause would create a second definition that drifts. The 500-row cap keeps that honest.
  const visible = visibleHomebrew(pieces, viewer, { includeOwn: mine })
    .filter((p) => homebrewMatchesSearch(p, q));

  return NextResponse.json({ content: visible });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const kind = body.kind;
  if (!isHomebrewKind(kind)) return NextResponse.json({ error: 'Pick what kind of thing you are making.' }, { status: 400 });

  const draft = pickCreatorWritable(body);
  const system = normalizeContentSystem(kind, body.system);
  const name = String(body.name ?? '').trim();

  // Three validation layers, each owning a different question, all reported together so an author fixes
  // everything in one pass rather than discovering the next problem after each save:
  //   · identity  — is this a valid piece at all (name, kind, attribution, scope)?
  //   · fields    — does it satisfy the KIND's own schema (required/min/max from the registry)?
  //   · payload   — do its mechanics validate against the ENGINE's validators, i.e. will it actually work?
  const problems = [
    ...validateHomebrew({ kind, name, system, creator: { id: session.userId, name: session.displayName } }),
    ...validateDraftFields(kind, body as Record<string, unknown>),
    ...validateHomebrewPayload({ id: 'new', kind, name, system, status: 'draft', creator: { name: session.displayName }, payload: draft.payload }),
  ];
  if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

  const visibility = normalizeVisibility(draft.visibility ?? 'private');
  const reach = draftLevelReach(kind, body as Record<string, unknown>);

  const { data, error } = await supabaseAdmin
    .from('dnd_homebrew')
    .insert({
      ...homebrewToRow({ ...draft, kind, name, system, visibility }),
      owner_user_id: session.userId,
      // Publishing has exactly ONE route (`statusForVisibility`), so a fresh piece cannot be born approved
      // by posting a status — `pickCreatorWritable` already dropped that field.
      status: statusForVisibility(visibility, 'draft'),
      // A partial build is a first-class state: record how far it got so the card can say so honestly.
      partial_to_level: isPartialBuild(kind, body as Record<string, unknown>) ? reach : null,
    })
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save that.' }, { status: 500 });

  const piece = rowToHomebrew(data as HomebrewRow, session.displayName);
  return NextResponse.json({ content: piece }, { status: 201 });
}
