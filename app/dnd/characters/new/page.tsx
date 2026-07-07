// app/dnd/characters/new/page.tsx — New Character creation (Phase M2 / P). A signed-in
// member builds their character for a campaign: upload sheets/PDFs/art for the AI to
// build, or create one and edit it manually. `?campaignId=` targets the campaign the
// player just joined (membership-checked); defaults to the open-access demo campaign.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import NewCharacterForm from '@/app/dnd/_ui/NewCharacterForm';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';

export const dynamic = 'force-dynamic';

export default async function NewCharacterPage({ searchParams }: { searchParams: { campaignId?: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd'); // sign in / pick an identity first

  // Target the requested campaign only if the caller is a member; otherwise fall back to
  // the open-access demo campaign so the flow always has a valid home.
  let campaignId = DEMO_CAMPAIGN_ID;
  if (searchParams.campaignId && (await getCampaignRole(searchParams.campaignId)) !== null) {
    campaignId = searchParams.campaignId;
  }
  return <NewCharacterForm campaignId={campaignId} />;
}
