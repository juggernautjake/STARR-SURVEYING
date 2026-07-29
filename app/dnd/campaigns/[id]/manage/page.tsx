// app/dnd/campaigns/[id]/manage/page.tsx — the DM control panel (campaign management).
// Reached only by entering as the DM from the campaign lobby. If the current identity
// isn't this campaign's DM, bounce back to the lobby (open-access) or login.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';
import CampaignPageClient from '@/app/dnd/_ui/CampaignPageClient';
import CampaignVisibilityControl from '@/app/dnd/_ui/CampaignVisibilityControl';
import CampaignCustomPolicyToggle from '@/app/dnd/_ui/CampaignCustomPolicyToggle';
import DiscordWebhookControl from '@/app/dnd/_ui/DiscordWebhookControl';
import { maskWebhookUrl } from '@/lib/dnd/discord';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function CampaignManagePage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  const role = user ? await getCampaignRole(params.id) : null;
  if (role !== 'dm') {
    redirect(`/dnd/campaigns/${params.id}`);
  }
  // Visibility + archive/delete (P2-5). Read the stored value here rather than in the client control, so
  // the DM sees the state that is ACTUALLY saved on first paint instead of a default that might be wrong.
  //
  // Read in TWO queries, not one. `discord_webhook_url` arrives with seed 461; asking for it in the same
  // select means that until the seed is applied PostgREST rejects the whole statement, `camp` is null, and
  // the visibility and custom-content controls both silently fall back to their defaults — a new column
  // breaking two unrelated, already-shipped controls. The second query is allowed to fail on its own.
  const { data: camp } = await supabaseAdmin
    .from('dnd_campaigns')
    .select('visibility, allow_custom')
    .eq('id', params.id)
    .maybeSingle();

  let webhook: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('dnd_campaigns').select('discord_webhook_url').eq('id', params.id).maybeSingle();
    webhook = (data as { discord_webhook_url?: string | null } | null)?.discord_webhook_url ?? null;
  } catch {
    /* seed 461 not applied — the control renders as "not configured", which is true */
  }

  return (
    <>
      <CampaignPageClient campaignId={params.id} />
      <div style={{ maxWidth: 960, margin: '16px auto 40px', padding: '0 12px', display: 'grid', gap: 16 }}>
        {/* The vanilla-only switch (P4-6). It has existed since the IG builder work and was mounted
            NOWHERE — so `allow_custom` gated content submission on every campaign while no DM could set it.
            Exactly the defect the orphan guard added in this slice exists to catch. */}
        <CampaignCustomPolicyToggle
          campaignId={params.id}
          initialAllow={(camp as { allow_custom?: boolean } | null)?.allow_custom !== false}
        />
        <CampaignVisibilityControl
          campaignId={params.id}
          current={(camp as { visibility?: string } | null)?.visibility ?? null}
        />
        {/* Discord (P10-4). The MASKED value is computed here, server-side — the raw webhook never enters a
            client component's props, where it would end up in the page's serialised RSC payload and be
            readable in view-source by anyone who could reach this page. */}
        <DiscordWebhookControl
          campaignId={params.id}
          current={maskWebhookUrl(webhook)}
        />
      </div>
    </>
  );
}
