// lib/dnd/profile-summary.ts — everything /dnd/profile shows about you beyond your name (P11-9).
//
// The profile page was a display-name field, an avatar picker and a password form. The brief asks it to
// show "identity, characters, campaigns, content, activity", so the four things it did not have are
// gathered here rather than inline in the page: the SHAPING is worth unit-testing (which campaigns count
// as yours, what an activity line reads like, how a piece with no summary renders) and a server component
// cannot be.
//
// Deliberately reuses `loadUserProfile` for characters + campaigns instead of re-querying. That function
// already encodes a rule that is easy to get wrong and was got wrong once: a character is yours if you
// OWN it **or are the assigned player of it** — an assigned player must see the character in their list.
// A second query here would be a second place for that rule to drift.
import { supabaseAdmin } from '@/lib/supabase';
import { loadUserProfile, type UserCharacter, type UserCampaign } from '@/lib/dnd/campaign-summary';

export interface ProfilePiece {
  id: string;
  kind: string;
  name: string;
  system: string;
  /** `visibility` is a free-text column; anything that is not exactly 'public' is treated as private. */
  isPublic: boolean;
  updatedAt: string | null;
}

export interface ProfileActivity {
  characterId: string | null;
  characterName: string | null;
  summary: string;
  source: string | null;
  createdAt: string;
}

export interface ProfileSummary {
  characters: UserCharacter[];
  campaigns: UserCampaign[];
  pieces: ProfilePiece[];
  activity: ProfileActivity[];
  counts: {
    characters: number;
    campaigns: number;
    dmOf: number;
    pieces: number;
    /** Total audit rows, not the length of `activity` — the list is capped and the tile is not. */
    edits: number;
  };
}

/** How many of each thing, and a recent handful of each — one round trip per source, run together. */
export async function loadProfileSummary(userId: string, limit = 6): Promise<ProfileSummary> {
  const [profile, piecesRes, pieceCountRes, editsRes, editCountRes] = await Promise.all([
    loadUserProfile(userId),
    supabaseAdmin
      .from('dnd_homebrew')
      .select('id, kind, name, system, visibility, updated_at')
      .eq('owner_user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('dnd_homebrew')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', userId),
    supabaseAdmin
      .from('dnd_sheet_edits')
      .select('character_id, summary, field_path, source, created_at')
      .eq('editor_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 2),
    supabaseAdmin
      .from('dnd_sheet_edits')
      .select('character_id', { count: 'exact', head: true })
      .eq('editor_user_id', userId),
  ]);

  const pieceRows = (piecesRes.data ?? []) as {
    id: string; kind: string; name: string; system: string; visibility: string | null; updated_at: string | null;
  }[];
  const editRows = (editsRes.data ?? []) as {
    character_id: string | null; summary: string | null; field_path: string | null; source: string | null; created_at: string;
  }[];

  // Character names for the activity lines, in ONE batched lookup. An edit whose character has since been
  // deleted keeps its row and renders without a name rather than disappearing — the edit still happened.
  const charNames = new Map<string, string>();
  for (const c of profile.characters) charNames.set(c.id, c.name);
  const missing = [...new Set(editRows.map((e) => e.character_id).filter((id): id is string => !!id && !charNames.has(id)))];
  if (missing.length) {
    const { data } = await supabaseAdmin.from('dnd_characters').select('id, name').in('id', missing);
    for (const c of (data ?? []) as { id: string; name: string }[]) charNames.set(c.id, c.name);
  }

  return {
    characters: profile.characters,
    campaigns: profile.campaigns,
    pieces: pieceRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      system: r.system,
      isPublic: r.visibility === 'public',
      updatedAt: r.updated_at,
    })),
    activity: editRows.map((r) => ({
      characterId: r.character_id,
      characterName: r.character_id ? charNames.get(r.character_id) ?? null : null,
      summary: activityLine(r.summary, r.field_path),
      source: r.source,
      createdAt: r.created_at,
    })),
    counts: {
      characters: profile.characters.length,
      campaigns: profile.campaigns.length,
      dmOf: profile.campaigns.filter((c: UserCampaign) => c.role === 'dm').length,
      pieces: pieceCountRes.count ?? pieceRows.length,
      edits: editCountRes.count ?? editRows.length,
    },
  };
}

/**
 * What an activity row READS like. Most rows carry a written `summary`; the ones that do not are machine
 * edits identified only by `field_path`, and "combat.hp.current" is not a sentence. Falls back to the path
 * with its separators opened up, then to a generic line — never to an empty bullet, which looks like a
 * rendering bug rather than a sparse row.
 */
export function activityLine(summary: string | null, fieldPath: string | null): string {
  const s = (summary ?? '').trim();
  if (s) return s;
  const path = (fieldPath ?? '').trim();
  if (!path) return 'Edited a character';
  // `revert-batch:<uuid>` is an internal marker, not a field — say what it means instead of showing it.
  if (path.startsWith('revert-batch:')) return 'Undid an earlier change';
  const pretty = (s: string) => s.replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim();
  // `editPath` in `sheet-edits.ts` writes `section[slug]` for anything named — `inventory[oak-shield]`,
  // `spells[fireball]`. Split those so the NAME reads as a name instead of running into its section.
  const named = path.match(/^([\w.]+)\[(.+)\]$/);
  if (named) return `Changed ${pretty(named[1])}: ${pretty(named[2])}`;
  return `Changed ${pretty(path)}`;
}

/** "3 days ago" for the activity list. Absolute dates make a feed read like a ledger. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.round((now.getTime() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
