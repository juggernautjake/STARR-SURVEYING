// app/dnd/campaigns/[id]/page.tsx — the campaign LOBBY / identity picker (Phase N).
// Open-access: this is ALWAYS the "who am I acting as?" picker — even if a session
// cookie exists — so switching characters/roles is explicit every time you open a
// campaign. Entering routes to the sheet (player) or /manage (DM). Login mode: a member
// goes straight to the management page; otherwise sign in.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';
import { loadCampaignLobby } from '@/lib/dnd/campaign-summary';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';
import CampaignLobby from '@/app/dnd/_ui/CampaignLobby';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: { id: string } }) {
  if (isDndOpenAccess()) {
    const [lobby, user] = await Promise.all([loadCampaignLobby(params.id), getDndUser()]);
    if (!lobby) redirect('/dnd');
    return <CampaignLobby data={lobby} currentName={user?.display_name ?? null} />;
  }

  // Login mode: a member sees the management page; otherwise sign in.
  const user = await getDndUser();
  if (!user) redirect(`/dnd/login?next=/dnd/campaigns/${params.id}`);
  const role = await getCampaignRole(params.id);
  if (role === null) redirect('/dnd');
  return <CampaignPageClient campaignId={params.id} />;
}
