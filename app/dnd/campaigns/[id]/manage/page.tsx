// app/dnd/campaigns/[id]/manage/page.tsx — the DM control panel (campaign management).
// Reached only by entering as the DM from the campaign lobby. If the current identity
// isn't this campaign's DM, bounce back to the lobby (open-access) or login.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';

export const dynamic = 'force-dynamic';

export default async function CampaignManagePage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  const role = user ? await getCampaignRole(params.id) : null;
  if (role !== 'dm') {
    redirect(isDndOpenAccess() ? `/dnd/campaigns/${params.id}` : `/dnd/login?next=/dnd/campaigns/${params.id}/manage`);
  }
  return <CampaignPageClient campaignId={params.id} />;
}
