// lib/dnd/characters.ts — character access control for the /dnd platform (Phase C4).
// The DM of a character's campaign has full read/write; the owner has full
// read/write to their own PC; a `public`/`campaign`-visible character is readable
// by any signed-in member. All /dnd API routes use the service-role client
// (bypasses RLS), so authorization is enforced HERE, in application code.
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export interface DndCharacterRow {
  id: string;
  campaign_id: string | null;
  owner_user_id: string | null;
  /** Who plays this character (null = the owner plays it). Ownership never transfers. */
  played_by_user_id?: string | null;
  name: string;
  sheet_type: string;
  theme: Record<string, unknown>;
  art_url: string | null;
  token_url: string | null;
  data: Record<string, unknown>;
  bio: Record<string, unknown>;
  visibility: 'private' | 'campaign' | 'public';
  is_npc: boolean;
  is_library: boolean;
  quick_stats: Record<string, unknown> | null;
  ai_generated: boolean;
  // Imported-character fields (Phase M).
  under_construction?: boolean;
  import_notes?: string | null;
  style_notes?: string | null;
  // AI-built custom sheet (Phase V, Slice 6): building blocks + CSS the sheet engine
  // renders in a sandboxed iframe when `sheet_type` is `custom`.
  custom_layout?: unknown;
  custom_css?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterAccess {
  character: DndCharacterRow;
  isOwner: boolean;
  /** True for whoever plays the character (the owner, or the player they handed it to). */
  isPlayer: boolean;
  isDM: boolean;
  canWrite: boolean;
}

export interface AccessResult {
  status: number;
  error?: string;
  access?: CharacterAccess;
}

/** Every campaign a character is in: its "home" campaign_id plus any join rows (Phase S).
 *  Defensive: if the join table isn't migrated yet, this is just the home campaign. */
export async function campaignsForCharacter(id: string, homeCampaignId: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (homeCampaignId) ids.add(homeCampaignId);
  try {
    const { data } = await supabaseAdmin.from('dnd_campaign_characters').select('campaign_id').eq('character_id', id);
    for (const r of (data ?? []) as { campaign_id: string }[]) ids.add(r.campaign_id);
  } catch {
    /* join table not present yet — fall back to the home campaign only */
  }
  return Array.from(ids);
}

/** Every character id in a campaign: join-table members ∪ any legacy home-campaign rows
 *  (Phase S). A character can now live in several campaigns, so the roster is the union —
 *  the join table is the source of truth once migrated, with the legacy `campaign_id`
 *  column folded in so nothing disappears before/after the backfill. */
export async function characterIdsInCampaign(campaignId: string): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data } = await supabaseAdmin.from('dnd_campaign_characters').select('character_id').eq('campaign_id', campaignId);
    for (const r of (data ?? []) as { character_id: string }[]) ids.add(r.character_id);
  } catch {
    /* join table not present yet — fall back to the home-campaign column only */
  }
  const { data: legacy } = await supabaseAdmin.from('dnd_characters').select('id').eq('campaign_id', campaignId);
  for (const r of (legacy ?? []) as { id: string }[]) ids.add(r.id);
  return Array.from(ids);
}

// Resolve the current user's access to a character. `status` is 200 on success;
// 401 (not signed in) / 404 (no such character) / 403 (no access) otherwise.
export async function getCharacterAccess(id: string): Promise<AccessResult> {
  const session = getDndSession();
  if (!session) return { status: 401, error: 'Not signed in.' };

  const { data: character } = await supabaseAdmin
    .from('dnd_characters')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!character) return { status: 404, error: 'Character not found.' };

  const row = character as DndCharacterRow;
  // The character may be in several campaigns now; the caller is a DM/member if they hold
  // that role in ANY of them.
  const campaignIds = await campaignsForCharacter(id, row.campaign_id);
  let isDM = false;
  let isMember = false;
  for (const cid of campaignIds) {
    const r = await getCampaignRole(cid);
    if (r !== null) isMember = true;
    if (r === 'dm') isDM = true;
  }
  const isOwner = row.owner_user_id != null && row.owner_user_id === session.userId;
  const isPlayer = row.played_by_user_id != null && row.played_by_user_id === session.userId;

  // Write: the owner, the assigned player, or a DM of a campaign it's in. Read: also a
  // `public` character (any signed-in user) or a `campaign`-visible one a member can see.
  const canWrite = isOwner || isPlayer || isDM;
  const canRead =
    canWrite || row.visibility === 'public' || (row.visibility === 'campaign' && isMember);
  if (!canRead) return { status: 403, error: 'You do not have access to this character.' };

  return { status: 200, access: { character: row, isOwner, isPlayer, isDM, canWrite } };
}

/** The single write chokepoint for every AI-driven mutation (Slice 8b permission
 *  boundary). Resolves access and requires `canWrite` — so every AI write is keyed to a
 *  specific character id AND the caller's owner/assigned-player/DM authorization. On
 *  failure `.access` is absent and the caller returns `{ status, error }`; on success
 *  `.access` is present and guaranteed writable. There is no path that lets an AI route
 *  write to a character the caller doesn't own/play/DM, or to any non-character resource. */
export async function requireCharacterWrite(id: string): Promise<AccessResult> {
  const res = await getCharacterAccess(id);
  if (!res.access) return res;
  if (!res.access.canWrite) return { status: 403, error: 'You cannot edit this character.' };
  return res;
}
