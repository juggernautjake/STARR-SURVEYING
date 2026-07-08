// app/dnd/stream/[id]/page.tsx — watch a streamer character's live chat (Phase R).
// Any signed-in member of the character's campaign can watch + chat, even though the
// sheet itself is private (only the owner + DM open the full sheet). Non-members are
// bounced to the hub.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole } from '@/lib/dnd/auth';
import { supabaseAdmin } from '@/lib/supabase';
import StreamWatchClient from '@/app/dnd/_ui/StreamWatchClient';

export const dynamic = 'force-dynamic';

export default async function StreamWatchPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, campaign_id, name, sheet_type')
    .eq('id', params.id)
    .maybeSingle();
  const ch = data as { id: string; campaign_id: string | null; name: string; sheet_type: string } | null;
  if (!ch || !ch.campaign_id) redirect('/dnd');

  const role = await getCampaignRole(ch.campaign_id);
  if (!role) redirect('/dnd'); // must be a campaign member to watch

  return <StreamWatchClient characterId={ch.id} campaignId={ch.campaign_id} sheetType={ch.sheet_type} name={ch.name} />;
}
