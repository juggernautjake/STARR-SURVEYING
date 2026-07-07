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
  created_at: string;
  updated_at: string;
}

export interface CharacterAccess {
  character: DndCharacterRow;
  isOwner: boolean;
  isDM: boolean;
  canWrite: boolean;
}

export interface AccessResult {
  status: number;
  error?: string;
  access?: CharacterAccess;
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
  const role = row.campaign_id != null ? await getCampaignRole(row.campaign_id) : null;
  const isOwner = row.owner_user_id != null && row.owner_user_id === session.userId;
  const isDM = role === 'dm';
  const isMember = role !== null;

  // Write: owner or DM only. Read: also a `public` character (any signed-in user)
  // or a `campaign`-visible character the caller is a member of. `private` stays
  // owner/DM-only.
  const canWrite = isOwner || isDM;
  const canRead =
    canWrite || row.visibility === 'public' || (row.visibility === 'campaign' && isMember);
  if (!canRead) return { status: 403, error: 'You do not have access to this character.' };

  return { status: 200, access: { character: row, isOwner, isDM, canWrite } };
}
