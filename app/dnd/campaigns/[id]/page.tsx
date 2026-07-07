// app/dnd/campaigns/[id]/page.tsx — campaign detail (Phase E3). Auth-gated.
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(`/dnd/login?next=/dnd/campaigns/${params.id}`);
  return <CampaignPageClient campaignId={params.id} />;
}
