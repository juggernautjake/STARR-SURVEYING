// app/dnd/characters/new/page.tsx — New Character import page (Phase M2). Needs an
// identity (in open-access, the visitor "enters" from the lobby first) so the created
// character has an owner; the demo campaign is the target.
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import NewCharacterForm from '@/app/dnd/_ui/NewCharacterForm';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';

export const dynamic = 'force-dynamic';

export default async function NewCharacterPage() {
  const user = await getDndUser();
  if (!user) redirect('/dnd'); // pick an identity in the lobby first
  return <NewCharacterForm campaignId={DEMO_CAMPAIGN_ID} />;
}
