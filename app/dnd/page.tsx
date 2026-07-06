// app/dnd/page.tsx — /dnd hub with role-based routing (Phase E9). Auth-gated.
// A DM (of any campaign) lands on the dashboard; a player with exactly one
// character goes straight to their sheet; everyone else gets the dashboard.
import { redirect } from 'next/navigation';
import { getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { supabaseAdmin } from '@/lib/supabase';
import CampaignDashboard from './_ui/CampaignDashboard';
import RosterHome, { type Roster } from './_ui/RosterHome';
import { DEMO_CAMPAIGN_ID, DEMO_DM_USER_ID, DEMO_GUEST_USER_ID, DEMO_PLAYERS } from '@/lib/dnd/constants';

export const dynamic = 'force-dynamic';

type CharRow = { id: string; name: string; owner_user_id: string; art_url: string | null; token_url: string | null; sheet_type: string; under_construction: boolean | null };

// Build the demo roster (portraits from the seeded rows) + any Guest-created imports.
async function loadRoster(): Promise<Roster> {
  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, name, owner_user_id, art_url, token_url, sheet_type, under_construction')
    .eq('campaign_id', DEMO_CAMPAIGN_ID)
    .order('created_at', { ascending: true });
  const rows = (data ?? []) as CharRow[];
  const byOwner = new Map(rows.map((c) => [c.owner_user_id, c]));

  const players = DEMO_PLAYERS.map((p) => {
    const c = byOwner.get(p.userId);
    return {
      userId: p.userId,
      playerName: p.name,
      characterId: c?.id ?? p.characterId,
      characterName: c?.name ?? p.characterName,
      portrait: c?.token_url ?? c?.art_url ?? null,
      sheetType: c?.sheet_type ?? p.sheetType,
      underConstruction: c?.under_construction ?? false,
    };
  });

  // Guest-created imports (each owned by the shared Guest identity).
  const created = rows
    .filter((c) => c.owner_user_id === DEMO_GUEST_USER_ID)
    .map((c) => ({ userId: DEMO_GUEST_USER_ID, playerName: 'Guest', characterId: c.id, characterName: c.name, portrait: c.token_url ?? c.art_url ?? null, sheetType: c.sheet_type, underConstruction: c.under_construction ?? false }));

  return { dm: { userId: DEMO_DM_USER_ID, name: 'Game Master' }, players: [...players, ...created], campaignId: DEMO_CAMPAIGN_ID, guestUserId: DEMO_GUEST_USER_ID };
}

export default async function DndHubPage() {
  // Open-access lobby (Phase L): the /dnd home is a public roster picker.
  if (isDndOpenAccess()) {
    return <RosterHome roster={await loadRoster()} />;
  }

  const user = await getDndUser();
  if (!user) redirect('/dnd/login');

  const { data: memberships } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('role')
    .eq('user_id', user.id);
  const isDMAnywhere = ((memberships ?? []) as { role: string }[]).some((m) => m.role === 'dm');

  if (!isDMAnywhere) {
    // A player: if they own exactly one character, go straight to it.
    const { data: chars } = await supabaseAdmin
      .from('dnd_characters')
      .select('id')
      .eq('owner_user_id', user.id)
      .limit(2);
    const owned = (chars ?? []) as { id: string }[];
    if (owned.length === 1) redirect(`/dnd/characters/${owned[0].id}`);
  }

  return <CampaignDashboard displayName={user.display_name} />;
}
