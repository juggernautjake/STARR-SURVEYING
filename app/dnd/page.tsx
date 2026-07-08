// app/dnd/page.tsx — /dnd hub with role-based routing (Phase E9). Auth-gated.
// A DM (of any campaign) lands on the dashboard; a player with exactly one
// character goes straight to their sheet; everyone else gets the dashboard.
import { redirect } from 'next/navigation';
import { getDndSession, getDndUser, isDndOpenAccess } from '@/lib/dnd/auth';
import { supabaseAdmin } from '@/lib/supabase';
import CampaignDashboard from './_ui/CampaignDashboard';
import CampaignsHome from './_ui/CampaignsHome';
import HubSignIn from './_ui/HubSignIn';
import MyTable from './_ui/MyTable';
import NotificationsPanel from './_ui/NotificationsPanel';
import styles from './_ui/hextech.module.css';
import { loadAllCampaignSummaries, loadUserProfile } from '@/lib/dnd/campaign-summary';

export const dynamic = 'force-dynamic';

export default async function DndHubPage() {
  // Open-access hub (Phase N/P): the /dnd home lists every campaign; anyone can also
  // "sign in" with the pseudo-login (name + password) to track their own characters and
  // the campaigns they're in or running.
  if (isDndOpenAccess()) {
    const session = getDndSession();
    const profile = session ? await loadUserProfile(session.userId) : null;
    return (
      <div className={styles.root}>
        <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 22, margin: '0 auto' }}>
            <div style={{ textAlign: 'center' }}>
              <p className={styles.brand}>Starr Tabletop</p>
              <h1 className={styles.title}>Campaigns</h1>
              <p className={styles.subtitle}>Sign in to track your table, or pick any campaign to open it.</p>
            </div>
            <HubSignIn displayName={session?.displayName ?? null} />
            {session && <NotificationsPanel />}
            {profile && <MyTable profile={profile} />}
            <CampaignsHome campaigns={await loadAllCampaignSummaries()} embedded />
          </div>
        </div>
      </div>
    );
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
