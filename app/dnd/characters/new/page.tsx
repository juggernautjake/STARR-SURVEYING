// app/dnd/characters/new/page.tsx — New Character creation (Phase M2 / P). A signed-in
// user builds their character: upload sheets/PDFs/art for the AI to build, or create one
// and edit it manually. `?campaignId=` targets a campaign the caller is a MEMBER of (it
// lands there); with no valid campaign the character is PERSONAL (no campaign) — fully
// buildable on its own and attachable to a campaign later.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import NewCharacterForm from '@/app/dnd/_ui/NewCharacterForm';

export const dynamic = 'force-dynamic';

export default async function NewCharacterPage({ searchParams }: { searchParams: { campaignId?: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd'); // sign in / pick an identity first

  // Only bind to the requested campaign if the caller is actually a member; otherwise the
  // character is created with no campaign (a personal sheet).
  let campaignId = '';
  if (searchParams.campaignId && (await getCampaignRole(searchParams.campaignId)) !== null) {
    campaignId = searchParams.campaignId;
  }
  return <NewCharacterForm campaignId={campaignId} />;
}
