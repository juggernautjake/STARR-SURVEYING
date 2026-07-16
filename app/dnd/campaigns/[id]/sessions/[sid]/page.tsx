// app/dnd/campaigns/[id]/sessions/[sid]/page.tsx — session console (Phase E4). Auth-gated.
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import SessionConsole from '@/app/dnd/_ui/SessionConsole';

export const dynamic = 'force-dynamic';

export default async function SessionConsolePage({ params }: { params: { id: string; sid: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');
  return <SessionConsole campaignId={params.id} sessionId={params.sid} selfId={user.id} />;
}
