// app/dnd/campaigns/[id]/page.tsx — campaign detail (Phase E3 / N).
// Open-access: the DM (a DM session in this campaign) sees the management control panel;
// everyone else sees the lobby (pick who to enter as → sheet / DM panel). Login mode:
// members see the management page; anyone else is sent to login.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';
import { loadCampaignLobby } from '@/lib/dnd/campaign-summary';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';
import CampaignLobby from '@/app/dnd/_ui/CampaignLobby';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const openAccess = isDndOpenAccess();
  const user = await getDndUser();
  const role = user ? await getCampaignRole(params.id) : null;

  // The DM of this campaign gets the management/control panel.
  if (role === 'dm') return <CampaignPageClient campaignId={params.id} />;

  // Open-access: show the "enter as" lobby for this campaign.
  if (openAccess) {
    const lobby = await loadCampaignLobby(params.id);
    if (!lobby) redirect('/dnd');
    return <CampaignLobby data={lobby} />;
  }

  // Login mode: a member sees the page; otherwise sign in.
  if (!user) redirect(`/dnd/login?next=/dnd/campaigns/${params.id}`);
  return <CampaignPageClient campaignId={params.id} />;
}
