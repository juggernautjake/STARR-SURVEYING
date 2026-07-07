// app/dnd/page.tsx — /dnd hub with role-based routing (Phase E9). Auth-gated.
// A DM (of any campaign) lands on the dashboard; a player with exactly one
// character goes straight to their sheet; everyone else gets the dashboard.
import { redirect } from 'next/navigation';
import { getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { supabaseAdmin } from '@/lib/supabase';
import CampaignDashboard from './_ui/CampaignDashboard';
import CampaignsHome from './_ui/CampaignsHome';
import { loadAllCampaignSummaries } from '@/lib/dnd/campaign-summary';

export const dynamic = 'force-dynamic';

export default async function DndHubPage() {
  // Open-access hub (Phase N): the /dnd home lists every campaign; clicking one opens
  // that campaign's lobby (players → sheets, DM → control panel).
  if (isDndOpenAccess()) {
    return <CampaignsHome campaigns={await loadAllCampaignSummaries()} />;
  }

  const user = await getDndUser();
  if (!user) redirect('/dnd/login');

  const { data: memberships } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('role')
    .eq('user_id', user.id);
  const isDMAnywhere = ((memberships ?? []) as { role: string }[]).some((m) => m.role === 'dm');

  if (!isDMAnywhere) {
    // A player: if they own exactly one character, go straight to it.
    const { data: chars } = await supabaseAdmin
      .from('dnd_characters')
      .select('id')
      .eq('owner_user_id', user.id)
      .limit(2);
    const owned = (chars ?? []) as { id: string }[];
    if (owned.length === 1) redirect(`/dnd/characters/${owned[0].id}`);
  }

  return <CampaignDashboard displayName={user.display_name} />;
}
