// lib/dnd/campaign-summary.ts — server-side loaders for the public campaigns hub
// (a card per campaign) and the per-campaign lobby (pick who to enter as). Uses the
// service-role client; these summaries are public in the open-access model (the /dnd
// hub is reachable by direct link only), so no membership check.
import { supabaseAdmin } from '@/lib/supabase';
import { DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, DEMO_STREAMER } from '@/lib/dnd/constants';
import { streamerCharacter } from '@/app/dnd/_sheet/data/streamer';

// Self-heal for the open-access demo: make sure the DM-run streamer NPC
// (xxRainbowKittenUwU37xx) exists with her full statted `streamer` sheet + a live
// stream, so she shows in the lobby without anyone re-running the seed script.
// Idempotent + best-effort (swallows errors); only touches the fixed demo ids.
async function ensureDemoStreamer(): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('dnd_characters')
      .select('id, sheet_type')
      .eq('id', DEMO_STREAMER.characterId)
      .maybeSingle();
    const row = existing as { id: string; sheet_type: string } | null;
    const streamerRow = {
      campaign_id: DEMO_CAMPAIGN_ID,
      owner_user_id: DEMO_DM_USER_ID,
      name: DEMO_STREAMER.characterName,
      sheet_type: DEMO_STREAMER.sheetType,
      is_npc: true,
      visibility: 'campaign',
      data: streamerCharacter(DEMO_STREAMER.characterName),
    };
    if (!row) {
      // Missing entirely → create her.
      await supabaseAdmin.from('dnd_characters').insert({ id: DEMO_STREAMER.characterId, ...streamerRow });
    } else if (row.sheet_type !== DEMO_STREAMER.sheetType) {
      // A leftover row occupies this id (e.g. the old "Nova Vex", generic + is_npc=false)
      // → convert it into the DM-run streamer NPC with her full statted sheet. Only runs
      // until she's on the `streamer` skin, so DM edits to the streamer are preserved.
      await supabaseAdmin.from('dnd_characters').update(streamerRow).eq('id', DEMO_STREAMER.characterId);
    }
    // Put her live so the chat + influence meter run when opened (don't overwrite an
    // existing state).
    await supabaseAdmin
      .from('dnd_stream_state')
      .upsert(
        { character_id: DEMO_STREAMER.characterId, is_live: true, viewer_count: 1337, chat_speed: 4, engagement: 65 },
        { onConflict: 'character_id', ignoreDuplicates: true },
      );
  } catch {
    /* best-effort demo self-heal */
  }
}

export interface CampaignCard {
  id: string;
  name: string;
  setting: string | null;
  dmName: string | null;
  playerNames: string[];
  characterNames: string[];
}

export interface LobbyPlayer {
  userId: string;
  playerName: string;
  characterId: string | null;
  characterName: string | null;
  portrait: string | null;
}

export interface LobbyNpc {
  characterId: string;
  name: string;
  portrait: string | null;
}

export interface CampaignLobbyData {
  id: string;
  name: string;
  setting: string | null;
  dm: { userId: string; name: string } | null;
  players: LobbyPlayer[];
  /** DM-run NPCs (e.g. the streamer) — shown so they can be opened from the lobby. */
  npcs: LobbyNpc[];
  guestUserId: string | null;
}

type MemberRow = { campaign_id: string; user_id: string; role: string };
type UserRow = { id: string; display_name: string };
type CharRow = { id: string; campaign_id: string; name: string; is_npc: boolean; owner_user_id: string | null; token_url: string | null; art_url: string | null };

async function nameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabaseAdmin.from('dnd_users').select('id, display_name').in('id', userIds);
  return new Map(((data ?? []) as UserRow[]).map((u) => [u.id, u.display_name]));
}

/** One card per campaign for the public hub. */
export async function loadAllCampaignSummaries(): Promise<CampaignCard[]> {
  const { data: camps } = await supabaseAdmin.from('dnd_campaigns').select('id, name, blurb').order('created_at', { ascending: true });
  const campaigns = (camps ?? []) as { id: string; name: string; blurb: string | null }[];
  if (campaigns.length === 0) return [];
  const ids = campaigns.map((c) => c.id);

  const [{ data: mems }, { data: chars }] = await Promise.all([
    supabaseAdmin.from('dnd_campaign_members').select('campaign_id, user_id, role').in('campaign_id', ids),
    supabaseAdmin.from('dnd_characters').select('id, campaign_id, name, is_npc, owner_user_id, token_url, art_url').in('campaign_id', ids),
  ]);
  const members = (mems ?? []) as MemberRow[];
  const characters = (chars ?? []) as CharRow[];
  const names = await nameMap(Array.from(new Set(members.map((m) => m.user_id))));

  return campaigns.map((c) => {
    const cm = members.filter((m) => m.campaign_id === c.id);
    const dm = cm.find((m) => m.role === 'dm');
    return {
      id: c.id,
      name: c.name,
      setting: c.blurb,
      dmName: dm ? names.get(dm.user_id) ?? null : null,
      playerNames: cm.filter((m) => m.role !== 'dm').map((m) => names.get(m.user_id) ?? 'Player'),
      characterNames: characters.filter((ch) => ch.campaign_id === c.id && !ch.is_npc).map((ch) => ch.name),
    };
  });
}

/** The lobby for one campaign: the DM + each player's PC, for the "enter as" picker. */
export async function loadCampaignLobby(campaignId: string): Promise<CampaignLobbyData | null> {
  const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('id, name, blurb').eq('id', campaignId).maybeSingle();
  const campaign = camp as { id: string; name: string; blurb: string | null } | null;
  if (!campaign) return null;

  // Demo self-heal: ensure the streamer NPC exists before we list the roster.
  if (campaignId === DEMO_CAMPAIGN_ID) await ensureDemoStreamer();

  const [{ data: mems }, { data: chars }] = await Promise.all([
    supabaseAdmin.from('dnd_campaign_members').select('campaign_id, user_id, role').eq('campaign_id', campaignId),
    supabaseAdmin.from('dnd_characters').select('id, campaign_id, name, is_npc, owner_user_id, token_url, art_url').eq('campaign_id', campaignId),
  ]);
  const members = (mems ?? []) as MemberRow[];
  const characters = (chars ?? []) as CharRow[];
  const names = await nameMap(members.map((m) => m.user_id));

  const dmMem = members.find((m) => m.role === 'dm');
  const players: LobbyPlayer[] = members
    .filter((m) => m.role !== 'dm')
    .map((m) => {
      const pc = characters.find((ch) => ch.owner_user_id === m.user_id && !ch.is_npc) ?? characters.find((ch) => ch.owner_user_id === m.user_id);
      return {
        userId: m.user_id,
        playerName: names.get(m.user_id) ?? 'Player',
        characterId: pc?.id ?? null,
        characterName: pc?.name ?? null,
        portrait: pc?.token_url ?? pc?.art_url ?? null,
      };
    });

  const npcs: LobbyNpc[] = characters
    .filter((ch) => ch.is_npc)
    .map((ch) => ({ characterId: ch.id, name: ch.name, portrait: ch.token_url ?? ch.art_url ?? null }));

  return {
    id: campaign.id,
    name: campaign.name,
    setting: campaign.blurb,
    dm: dmMem ? { userId: dmMem.user_id, name: names.get(dmMem.user_id) ?? 'Dungeon Master' } : null,
    players,
    npcs,
    guestUserId: campaignId === DEMO_CAMPAIGN_ID ? DEMO_GUEST_USER_ID : null,
  };
}
