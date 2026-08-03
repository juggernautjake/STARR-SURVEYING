// lib/dnd/campaign-summary.ts — server-side loaders for the public campaigns hub
// (a card per campaign) and the per-campaign lobby (pick who to enter as). Uses the
// service-role client; these summaries are public in the open-access model (the /dnd
// hub is reachable by direct link only), so no membership check.
import { supabaseAdmin } from '@/lib/supabase';
import { DEMO_CAMPAIGN_ID, DEMO_GUEST_USER_ID, DEMO_STREAMER, DEMO_DONATA } from '@/lib/dnd/constants';
import { streamerCharacter } from '@/app/dnd/_sheet/data/streamer';
import { donataDime } from '@/app/dnd/_sheet/data/donata';
import { characterIdsInCampaign } from '@/lib/dnd/characters';
import { rosterRoleOf } from '@/lib/dnd/roster';

/**
 * THE DEMO SELF-HEAL IS THROTTLED, and it was the campaign page's real cost. Measured warm: 1.81s to
 * return 44KB — a tiny payload, so nearly all of it was waiting on the database.
 *
 * `ensureDemoStreamer` and `ensureDonata` issue **13 sequential round trips between them** — upserts for
 * the user, the membership, the character, the stream state — and they ran on EVERY view of the demo
 * campaign, from two different loaders, almost always finding nothing to repair. At ~100ms a trip that was
 * most of the page's time, spent proving that rows which already exist still exist.
 *
 * They remain idempotent and best-effort; they simply no longer run per request. A five-minute window
 * means a deliberately deleted demo row heals within five minutes rather than instantly — the right trade
 * for a self-heal, which exists so the demo survives neglect, not so anything can rely on it as a write
 * path. Module scope, so it is per server process; a restart heals immediately, which is when you want it.
 */
const DEMO_HEAL_INTERVAL_MS = 5 * 60 * 1000;
let lastDemoHeal = 0;

// Self-heal for the Neon Odyssey demo: make sure the streamer (xxRainbowKittenUwU37xx)
// exists with her full statted `streamer` sheet + a live stream, owned by Susie as a
// PRIVATE player character (only Susie + the DM can open it; only her chat is DM-run).
// Idempotent + best-effort (swallows errors); only touches the fixed demo ids. Note: it
// never sets a password (that's done once by the seed / DB setup and preserved here).
async function ensureDemoStreamer(): Promise<void> {
  try {
    // Susie's account + campaign membership, so she shows as a normal playable card.
    await supabaseAdmin.from('dnd_users').upsert(
      { id: DEMO_STREAMER.playerUserId, email: DEMO_STREAMER.playerEmail, display_name: DEMO_STREAMER.playerName },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    await supabaseAdmin.from('dnd_campaign_members').upsert(
      { campaign_id: DEMO_CAMPAIGN_ID, user_id: DEMO_STREAMER.playerUserId, role: 'player' },
      { onConflict: 'campaign_id,user_id', ignoreDuplicates: true },
    );

    const { data: existing } = await supabaseAdmin
      .from('dnd_characters')
      .select('id, sheet_type, is_npc, owner_user_id, visibility')
      .eq('id', DEMO_STREAMER.characterId)
      .maybeSingle();
    const row = existing as { id: string; sheet_type: string; is_npc: boolean; owner_user_id: string | null; visibility: string } | null;
    const streamerRow = {
      campaign_id: DEMO_CAMPAIGN_ID,
      owner_user_id: DEMO_STREAMER.playerUserId,
      name: DEMO_STREAMER.characterName,
      sheet_type: DEMO_STREAMER.sheetType,
      is_npc: false,
      visibility: 'private',
      data: streamerCharacter(DEMO_STREAMER.characterName),
    };
    if (!row) {
      // Missing entirely → create her as a private player character.
      await supabaseAdmin.from('dnd_characters').insert({ id: DEMO_STREAMER.characterId, ...streamerRow });
    } else if (row.sheet_type !== DEMO_STREAMER.sheetType) {
      // A leftover row occupies this id (e.g. the old "Nova Vex") → convert it into the
      // full statted streamer. Only runs until she's on the `streamer` skin, so DM edits
      // to her sheet are preserved thereafter.
      await supabaseAdmin.from('dnd_characters').update(streamerRow).eq('id', DEMO_STREAMER.characterId);
    } else if (row.is_npc || row.owner_user_id !== DEMO_STREAMER.playerUserId || row.visibility !== 'private') {
      // She already has her streamer sheet but was still the old DM-run NPC / campaign-
      // visible → flip her to Susie's PRIVATE player character WITHOUT touching her sheet
      // `data` (preserve any DM edits).
      await supabaseAdmin
        .from('dnd_characters')
        .update({ is_npc: false, owner_user_id: DEMO_STREAMER.playerUserId, visibility: 'private' })
        .eq('id', DEMO_STREAMER.characterId);
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

// Self-heal for Donata Dime (Sarah's MLM cleric) in Neon Odyssey: ensure Sarah's account +
// membership exist and Donata's character row is present on her bespoke `donata` skin, owned
// by Sarah (so Sarah edits as owner, Andrew edits via his DM role). Idempotent + best-effort;
// only creates/converts — never overwrites an existing `donata` row, so owner/DM edits persist.
async function ensureDonata(): Promise<void> {
  try {
    await supabaseAdmin.from('dnd_users').upsert(
      { id: DEMO_DONATA.playerUserId, email: DEMO_DONATA.playerEmail, display_name: DEMO_DONATA.playerName },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    await supabaseAdmin.from('dnd_campaign_members').upsert(
      { campaign_id: DEMO_CAMPAIGN_ID, user_id: DEMO_DONATA.playerUserId, role: 'player' },
      { onConflict: 'campaign_id,user_id', ignoreDuplicates: true },
    );

    const { data: existing } = await supabaseAdmin
      .from('dnd_characters')
      .select('id, sheet_type')
      .eq('id', DEMO_DONATA.characterId)
      .maybeSingle();
    const row = existing as { id: string; sheet_type: string } | null;
    const donataRow = {
      campaign_id: DEMO_CAMPAIGN_ID,
      owner_user_id: DEMO_DONATA.playerUserId,
      name: DEMO_DONATA.characterName,
      sheet_type: DEMO_DONATA.sheetType,
      is_npc: false,
      visibility: 'private',
      data: donataDime(DEMO_DONATA.characterName),
    };
    if (!row) {
      await supabaseAdmin.from('dnd_characters').insert({ id: DEMO_DONATA.characterId, ...donataRow });
    } else if (row.sheet_type !== DEMO_DONATA.sheetType) {
      // A leftover row occupies this id → convert it to her full donata build. Runs only
      // until she's on the `donata` skin, so owner/DM edits to her sheet are preserved after.
      await supabaseAdmin.from('dnd_characters').update(donataRow).eq('id', DEMO_DONATA.characterId);
    }
    // Multi-campaign roster link (Phase S) — best-effort (join table may be unmigrated).
    try {
      await supabaseAdmin.from('dnd_campaign_characters').upsert(
        { campaign_id: DEMO_CAMPAIGN_ID, character_id: DEMO_DONATA.characterId, added_by: DEMO_DONATA.playerUserId },
        { onConflict: 'campaign_id,character_id', ignoreDuplicates: true },
      );
    } catch {
      /* join table not present yet */
    }
  } catch {
    /* best-effort demo self-heal */
  }
}

export interface CampaignCard {
  id: string;
  name: string;
  setting: string | null;
  /** The campaign's picture (P14-10), or null when the DM has not set one — which is the COMMON case, so
   *  every card surface renders `CampaignThumb`'s placeholder rather than nothing. */
  thumbnailUrl: string | null;
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
  /** Password-protected account → can't be entered passwordlessly; must sign in. */
  locked: boolean;
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
  /** P14-10 — the lobby is where a player chooses who they are; the table should be recognisable. */
  thumbnailUrl: string | null;
  dm: { userId: string; name: string; locked: boolean } | null;
  players: LobbyPlayer[];
  /** Any DM-run NPCs — shown so they can be opened from the lobby. (The streamer is a
   *  player character, so she's in `players`, not here.) */
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
export async function loadAllCampaignSummaries(opts: { viewerId?: string | null; limit?: number } = {}): Promise<CampaignCard[]> {
  // P2-5 (audit D-2). This used to select EVERY campaign, unfiltered and unpaginated, and return the DM's
  // name, every player's name and every character's name — to anyone opening /dnd in open-access mode.
  //
  // Now: public, non-archived campaigns, newest first, bounded. A viewer additionally sees their OWN
  // campaigns whatever their visibility, because "where did my table go" is a worse experience than a
  // slightly longer list — and it is their data.
  const limit = Math.max(1, Math.min(100, opts.limit ?? 24));
  const { data: camps } = await supabaseAdmin
    .from('dnd_campaigns')
    .select('id, name, blurb, dm_user_id, visibility, archived_at, thumbnail_url')
    .is('archived_at', null)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(limit);
  let campaigns = (camps ?? []) as { id: string; name: string; blurb: string | null; dm_user_id?: string; thumbnail_url?: string | null }[];

  if (opts.viewerId) {
    const { data: mine } = await supabaseAdmin
      .from('dnd_campaigns')
      .select('id, name, blurb, dm_user_id, visibility, archived_at, thumbnail_url')
      .is('archived_at', null)
      .eq('dm_user_id', opts.viewerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    const seen = new Set(campaigns.map((c) => c.id));
    campaigns = [...campaigns, ...((mine ?? []) as typeof campaigns).filter((c) => !seen.has(c.id))];
  }
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
      thumbnailUrl: c.thumbnail_url ?? null,
      dmName: dm ? names.get(dm.user_id) ?? null : null,
      playerNames: cm.filter((m) => m.role !== 'dm').map((m) => names.get(m.user_id) ?? 'Player'),
      characterNames: characters.filter((ch) => ch.campaign_id === c.id && !ch.is_npc).map((ch) => ch.name),
    };
  });
}

export interface UserCharacter {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  sheetType: string | null;
  portrait: string | null;
}

export interface UserCampaign {
  id: string;
  name: string;
  role: 'dm' | 'player';
  /** P14-10 — so the profile's "Your tables" and both MyTable lists show the same picture the cards do. */
  thumbnailUrl: string | null;
}

export interface UserProfile {
  characters: UserCharacter[];
  campaigns: UserCampaign[];
}

/** The signed-in user's own stuff: characters they own + campaigns they belong to
 *  (flagged dm/player). Powers the "My table" panel on the pseudo-login hub. */
export async function loadUserProfile(userId: string): Promise<UserProfile> {
  const [{ data: chars }, { data: mems }] = await Promise.all([
    supabaseAdmin
      .from('dnd_characters')
      .select('id, name, campaign_id, sheet_type, token_url, art_url')
      // A user's characters = the ones they OWN or are the assigned PLAYER of (owner 2026-07-18: an assigned
      // player, e.g. jgcabtx playing Jack, must see the character in their list and reach its campaign — the
      // campaign is surfaced below from each character's campaign_id). .select() must precede .or() in supabase-js.
      .or(`owner_user_id.eq.${userId},played_by_user_id.eq.${userId}`)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('dnd_campaign_members')
      .select('campaign_id, role')
      .eq('user_id', userId),
  ]);

  const characters = (chars ?? []) as {
    id: string; name: string; campaign_id: string | null; sheet_type: string | null; token_url: string | null; art_url: string | null;
  }[];
  const members = (mems ?? []) as { campaign_id: string; role: string }[];

  const campIds = Array.from(
    new Set([...members.map((m) => m.campaign_id), ...characters.map((c) => c.campaign_id).filter((v): v is string => !!v)]),
  );
  const campNames = new Map<string, string>();
  // P14-10 — the picture travels with the name. Two maps rather than one of objects because `campNames`
  // is already read in three places below and widening it there would be a bigger change than adding one.
  const campThumbs = new Map<string, string | null>();
  if (campIds.length) {
    const { data: camps } = await supabaseAdmin.from('dnd_campaigns').select('id, name, thumbnail_url').in('id', campIds);
    for (const c of (camps ?? []) as { id: string; name: string; thumbnail_url?: string | null }[]) {
      campNames.set(c.id, c.name);
      campThumbs.set(c.id, c.thumbnail_url ?? null);
    }
  }

  return {
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      campaignId: c.campaign_id,
      campaignName: c.campaign_id ? campNames.get(c.campaign_id) ?? null : null,
      sheetType: c.sheet_type,
      portrait: c.token_url ?? c.art_url ?? null,
    })),
    campaigns: members.map((m) => ({
      id: m.campaign_id,
      name: campNames.get(m.campaign_id) ?? 'Campaign',
      role: (m.role === 'dm' ? 'dm' : 'player') as 'dm' | 'player',
      thumbnailUrl: campThumbs.get(m.campaign_id) ?? null,
    })),
  };
}

export interface HubCharacter {
  id: string;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  /** Who plays this character in the campaign (null = the owner plays it). */
  playedByUserId: string | null;
  playedByName: string | null;
  isNpc: boolean;
  rosterRole: string;
  sheetType: string | null;
  portrait: string | null;
  /** The game system this character's sheet is built for (Slice 38d) — used to offer a translate
   *  when it differs from the campaign's system. `null`/`ambiguous` = no specific system. */
  system: string | null;
  /** The viewer owns OR plays this character. */
  mine: boolean;
}

export interface HubRecap {
  sessionId: string;
  sessionTitle: string;
  status: string;
  markdown: string;
}

export interface HubMedia {
  id: string;
  url: string;
  kind: string;
  label: string | null;
}

export interface CampaignHubData {
  id: string;
  name: string;
  setting: string | null;
  artUrl: string | null;
  /** Player-visible campaign notes/summary (theme.notes). */
  notes: string | null;
  dm: { userId: string; name: string } | null;
  members: { userId: string; name: string; role: 'dm' | 'player' }[];
  characters: HubCharacter[];
  recaps: HubRecap[];
  /** Player-visible campaign gallery (DM-only images excluded). */
  gallery: HubMedia[];
  /** The viewer's own character in this campaign (for the "your character" shortcut). */
  myCharacterId: string | null;
  /** The campaign's published map (latest), shown to players. Null if none / unmigrated.
   *  Kept for back-compat; prefer `publishedMaps` (this is simply the first of that list). */
  publishedMap: { id: string; name: string; kind: string; imageUrl: string | null } | null;
  /** ALL published maps in this campaign (newest first), so players can pick any of them to view. */
  publishedMaps: { id: string; name: string; kind: string; imageUrl: string | null }[];
  viewerRole: 'dm' | 'player';
  /** The game system this campaign runs (Slice 38d). A brought-in character built for a different
   *  system is offered a translate into this one. `null`/`ambiguous` = no specific system set. */
  system: string | null;
}

/** The shared campaign hub (Phase P) for a signed-in member: roster + DM, campaign art,
 *  chat is mounted client-side, and read-only session summaries. `viewerId` is the
 *  current user (used to flag their own character). */
export async function loadCampaignHub(campaignId: string, viewerId: string, viewerRole: 'dm' | 'player'): Promise<CampaignHubData | null> {
  // TWO ROUND TRIPS, NOT FIVE. Measured warm: the campaign page took **1.81s to return 44KB** — the
  // payload is tiny, so the time was almost entirely waiting on a remote database, ~450ms per trip.
  //
  // The chain was: `camp`, then `characterIdsInCampaign` (an await hidden inside a helper call, which is
  // why the sequence read as shorter than it was), then a Promise.all of four, then recaps, then maps.
  // Five trips, of which only TWO dependencies are real: `chars` needs the character ids, and `recaps`
  // needs the session list. Everything else was sequential by accident of how it was written.
  //
  // So: fire everything independent at once, then the two that genuinely wait. `camp`'s null check moves
  // AFTER the batch — a nonexistent campaign now costs a few wasted parallel reads instead of gating five
  // serial ones, which is the right trade for a case that is rare and already an error path.
  if (campaignId === DEMO_CAMPAIGN_ID && Date.now() - lastDemoHeal > DEMO_HEAL_INTERVAL_MS) {
    lastDemoHeal = Date.now();
    await Promise.all([ensureDemoStreamer(), ensureDonata()]);
  }

  const [{ data: camp }, { data: mems }, { data: sess }, { data: mediaRows }, charIds, mapsResult] = await Promise.all([
    supabaseAdmin.from('dnd_campaigns').select('id, name, blurb, theme, system').eq('id', campaignId).maybeSingle(),
    supabaseAdmin.from('dnd_campaign_members').select('user_id, role').eq('campaign_id', campaignId),
    supabaseAdmin.from('dnd_sessions').select('id, title, sort_order').eq('campaign_id', campaignId).order('sort_order', { ascending: true }),
    supabaseAdmin.from('dnd_media').select('id, url, kind, label, gallery_tags').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
    characterIdsInCampaign(campaignId),
    // `dnd_maps` may be unmigrated, so this keeps its own error handling rather than failing the batch.
    supabaseAdmin.from('dnd_maps').select('id, name, kind, image_url').eq('campaign_id', campaignId)
      .eq('published', true).order('updated_at', { ascending: false })
      .then((r: { data: unknown }) => r, () => ({ data: null })),
  ]);

  const campaign = camp as { id: string; name: string; blurb: string | null; theme: Record<string, unknown> | null; system?: string | null } | null;
  if (!campaign) return null;

  const { data: chars } = charIds.length
    ? await supabaseAdmin.from('dnd_characters').select('id, name, is_npc, roster_role, owner_user_id, played_by_user_id, token_url, art_url, sheet_type, system').in('id', charIds).order('is_npc', { ascending: true })
    : { data: [] as unknown[] };
  const members = (mems ?? []) as { user_id: string; role: string }[];
  const characters = (chars ?? []) as {
    id: string; name: string; is_npc: boolean; roster_role: string | null; owner_user_id: string | null; played_by_user_id: string | null; token_url: string | null; art_url: string | null; sheet_type: string | null; system: string | null;
  }[];
  const sessions = (sess ?? []) as { id: string; title: string; sort_order: number }[];
  const names = await nameMap(
    Array.from(new Set([
      ...members.map((m) => m.user_id),
      ...characters.map((c) => c.owner_user_id).filter((v): v is string => !!v),
      ...characters.map((c) => c.played_by_user_id).filter((v): v is string => !!v),
    ])),
  );

  // Read-only session summaries (final recap preferred, else the draft).
  let recaps: HubRecap[] = [];
  if (sessions.length) {
    const { data: recapRows } = await supabaseAdmin
      .from('dnd_recaps')
      .select('session_id, draft_markdown, final_markdown, status')
      .in('session_id', sessions.map((s) => s.id));
    const bySession = new Map(((recapRows ?? []) as { session_id: string; draft_markdown: string | null; final_markdown: string | null; status: string }[]).map((r) => [r.session_id, r]));
    recaps = sessions
      .map((s) => {
        const r = bySession.get(s.id);
        const markdown = r?.final_markdown || r?.draft_markdown || '';
        return markdown ? { sessionId: s.id, sessionTitle: s.title, status: r?.status ?? 'draft', markdown } : null;
      })
      .filter((r): r is HubRecap => r !== null);
  }

  // Player-visible gallery: campaign media not tagged `dm-only`.
  const gallery: HubMedia[] = ((mediaRows ?? []) as { id: string; url: string; kind: string; label: string | null; gallery_tags: string[] | null }[])
    .filter((m) => !(m.gallery_tags ?? []).includes('dm-only'))
    .map((m) => ({ id: m.id, url: m.url, kind: m.kind, label: m.label }));

  // ALL published maps (newest first) — best-effort (the dnd_maps table may be unmigrated). Players can pick any.
  let publishedMaps: CampaignHubData['publishedMaps'] = [];
  try {
    const { data: mapRows } = await supabaseAdmin
      .from('dnd_maps')
      .select('id, name, kind, image_url')
      .eq('campaign_id', campaignId)
      .eq('published', true)
      .order('updated_at', { ascending: false });
    publishedMaps = ((mapRows ?? []) as { id: string; name: string; kind: string; image_url: string | null }[])
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind, imageUrl: r.image_url }));
  } catch {
    /* dnd_maps not present yet */
  }
  const publishedMap = publishedMaps[0] ?? null;   // back-compat: the latest one

  const dmMem = members.find((m) => m.role === 'dm');
  return {
    id: campaign.id,
    name: campaign.name,
    setting: campaign.blurb,
    // COLUMN FIRST, jsonb key as the fallback (P14-10). Seed 571 promoted `theme.artUrl` to
    // `thumbnail_url` and backfilled it, but the key is deliberately left in place: a row written by an
    // older deploy — or restored from a pre-571 backup — still has its picture, so the banner never
    // blanks for a campaign whose art only exists in the old spot.
    artUrl: (typeof (campaign as { thumbnail_url?: unknown }).thumbnail_url === 'string'
      ? (campaign as unknown as { thumbnail_url: string }).thumbnail_url
      : typeof campaign.theme?.artUrl === 'string' ? (campaign.theme.artUrl as string) : null) || null,
    notes: typeof campaign.theme?.notes === 'string' && (campaign.theme.notes as string).trim() ? (campaign.theme.notes as string) : null,
    gallery,
    dm: dmMem ? { userId: dmMem.user_id, name: names.get(dmMem.user_id) ?? 'Dungeon Master' } : null,
    members: members.map((m) => ({ userId: m.user_id, name: names.get(m.user_id) ?? 'Player', role: (m.role === 'dm' ? 'dm' : 'player') as 'dm' | 'player' })),
    characters: characters.map((ch) => ({
      id: ch.id,
      name: ch.name,
      ownerUserId: ch.owner_user_id,
      ownerName: ch.owner_user_id ? names.get(ch.owner_user_id) ?? null : null,
      playedByUserId: ch.played_by_user_id ?? null,
      playedByName: ch.played_by_user_id ? names.get(ch.played_by_user_id) ?? null : null,
      isNpc: ch.is_npc,
      rosterRole: rosterRoleOf(ch.roster_role, ch.is_npc),
      system: ch.system ?? null,
      sheetType: ch.sheet_type,
      portrait: ch.token_url ?? ch.art_url ?? null,
      // "Mine" = the viewer owns it or plays it (either grants a sheet to open).
      mine: ch.owner_user_id === viewerId || ch.played_by_user_id === viewerId,
    })),
    recaps,
    // The viewer's character to open: one they play, else one they own (PC preferred).
    myCharacterId:
      characters.find((ch) => (ch.played_by_user_id === viewerId || ch.owner_user_id === viewerId) && !ch.is_npc)?.id ??
      characters.find((ch) => ch.played_by_user_id === viewerId || ch.owner_user_id === viewerId)?.id ??
      null,
    publishedMap,
    publishedMaps,
    viewerRole,
    system: campaign.system ?? null,
  };
}

/** The lobby for one campaign: the DM + each player's PC, for the "enter as" picker. */
export async function loadCampaignLobby(campaignId: string): Promise<CampaignLobbyData | null> {
  const { data: camp } = await supabaseAdmin.from('dnd_campaigns').select('id, name, blurb, thumbnail_url').eq('id', campaignId).maybeSingle();
  const campaign = camp as { id: string; name: string; blurb: string | null; thumbnail_url?: string | null } | null;
  if (!campaign) return null;

  // Demo self-heal: ensure the streamer NPC exists before we list the roster.
  if (campaignId === DEMO_CAMPAIGN_ID && Date.now() - lastDemoHeal > DEMO_HEAL_INTERVAL_MS) {
    lastDemoHeal = Date.now();
    await Promise.all([ensureDemoStreamer(), ensureDonata()]);
  }

  const charIds = await characterIdsInCampaign(campaignId);
  const [{ data: mems }, { data: chars }] = await Promise.all([
    supabaseAdmin.from('dnd_campaign_members').select('campaign_id, user_id, role').eq('campaign_id', campaignId),
    charIds.length
      ? supabaseAdmin.from('dnd_characters').select('id, campaign_id, name, is_npc, owner_user_id, played_by_user_id, token_url, art_url').in('id', charIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const members = (mems ?? []) as MemberRow[];
  const characters = (chars ?? []) as (CharRow & { played_by_user_id: string | null })[];
  const names = await nameMap(members.map((m) => m.user_id));

  // Which member accounts are password-protected (can't be entered passwordlessly).
  const locked = new Set<string>();
  if (members.length) {
    const { data: pw } = await supabaseAdmin
      .from('dnd_users')
      .select('id, password_hash')
      .in('id', members.map((m) => m.user_id));
    for (const u of ((pw ?? []) as { id: string; password_hash: string | null }[])) if (u.password_hash) locked.add(u.id);
  }

  const dmMem = members.find((m) => m.role === 'dm');
  const players: LobbyPlayer[] = members
    .filter((m) => m.role !== 'dm')
    .map((m) => {
      // The character this player plays (played_by) or owns — PC preferred.
      const mine = (ch: CharRow & { played_by_user_id: string | null }) => ch.played_by_user_id === m.user_id || ch.owner_user_id === m.user_id;
      const pc = characters.find((ch) => mine(ch) && !ch.is_npc) ?? characters.find((ch) => mine(ch));
      return {
        userId: m.user_id,
        playerName: names.get(m.user_id) ?? 'Player',
        characterId: pc?.id ?? null,
        characterName: pc?.name ?? null,
        portrait: pc?.token_url ?? pc?.art_url ?? null,
        locked: locked.has(m.user_id),
      };
    });

  const npcs: LobbyNpc[] = characters
    .filter((ch) => ch.is_npc)
    .map((ch) => ({ characterId: ch.id, name: ch.name, portrait: ch.token_url ?? ch.art_url ?? null }));

  return {
    id: campaign.id,
    name: campaign.name,
    setting: campaign.blurb,
    thumbnailUrl: campaign.thumbnail_url ?? null,
    dm: dmMem ? { userId: dmMem.user_id, name: names.get(dmMem.user_id) ?? 'Dungeon Master', locked: locked.has(dmMem.user_id) } : null,
    players,
    npcs,
    guestUserId: campaignId === DEMO_CAMPAIGN_ID ? DEMO_GUEST_USER_ID : null,
  };
}
