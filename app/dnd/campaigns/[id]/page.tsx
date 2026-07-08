// app/dnd/campaigns/[id]/page.tsx — the campaign LOBBY / identity picker (Phase N).
// Open-access: this is ALWAYS the "who am I acting as?" picker — even if a session
// cookie exists — so switching characters/roles is explicit every time you open a
// campaign. Entering routes to the sheet (player) or /manage (DM). Login mode: a member
// goes straight to the management page; otherwise sign in.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';
import { loadCampaignLobby, loadCampaignHub } from '@/lib/dnd/campaign-summary';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';
import CampaignHub from '@/app/dnd/_ui/CampaignHub';
import CampaignLobby from '@/app/dnd/_ui/CampaignLobby';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const openAccess = isDndOpenAccess();
  const user = await getDndUser();
  const role = user ? await getCampaignRole(params.id) : null;

  // The DM of this campaign gets the full management/control panel — all the DM-only
  // features (roster editing, soundboard, private messaging, streamer controls via each
  // sheet in DM mode). Players never see these (Phase P).
  if (role === 'dm') return <CampaignPageClient campaignId={params.id} />;

  // A signed-in player who belongs to the campaign gets the player-facing hub:
  // roster + DM, campaign art, chat + whisper-the-DM, read-only summaries.
  if (role === 'player' && user) {
    const hub = await loadCampaignHub(params.id, user.id, 'player');
    if (!hub) redirect('/dnd');
    return <CampaignHub data={hub} selfId={user.id} />;
  }

  // Open-access, not a member: show the "enter as" lobby for this campaign.
  if (openAccess) {
    const lobby = await loadCampaignLobby(params.id);
    if (!lobby) redirect('/dnd');
    return <CampaignLobby data={lobby} currentName={user?.display_name ?? null} />;
  }

  // Login mode, not a member: sign in first.
  redirect(`/dnd/login?next=/dnd/campaigns/${params.id}`);
}
