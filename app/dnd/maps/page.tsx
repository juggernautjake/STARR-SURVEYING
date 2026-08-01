// app/dnd/maps/page.tsx — a person's own map library (owner request 2026-08-01).
//
// Until now every map lived inside a campaign, so a person with no campaign had nowhere to put one and
// the header's "＋ Map" link pointed at `/dnd?new=map` — a query string nothing has ever read. This is
// the destination that link should always have had.
//
// The list is loaded server-side rather than fetched on mount so the page is never briefly empty. An
// empty library and a library that has not loaded look identical, and this repo has paid for that
// confusion before (audit §1.1b): the client component is told which state it is in.
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';
import { supabaseAdmin } from '@/lib/supabase';
import MyMaps, { type MyMapRow, type DmCampaign } from '@/app/dnd/_ui/maps/MyMaps';

export const dynamic = 'force-dynamic';

export default async function MyMapsPage() {
  const user = await getDndUser();
  if (!user) redirect('/dnd');

  const [{ data: maps }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('dnd_maps')
      .select('id, name, kind, image_url, created_at, updated_at')
      .eq('owner_id', user.id)
      .is('campaign_id', null)
      .order('updated_at', { ascending: false }),
    // Campaigns this person DMs — the only ones a map can be copied into. Fetched here so the
    // "Add to campaign" control can say which campaigns rather than offering a box to guess into.
    supabaseAdmin
      .from('dnd_campaign_members')
      .select('campaign_id, role, dnd_campaigns(id, name)')
      .eq('user_id', user.id)
      .eq('role', 'dm'),
  ]);

  const campaigns: DmCampaign[] = ((memberships ?? []) as Array<{ dnd_campaigns: { id: string; name: string } | null }>)
    .map((m) => m.dnd_campaigns)
    .filter((c): c is { id: string; name: string } => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));

  return <MyMaps initialMaps={(maps ?? []) as MyMapRow[]} campaigns={campaigns} />;
}
