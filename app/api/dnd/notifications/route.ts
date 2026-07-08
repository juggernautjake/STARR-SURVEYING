// app/api/dnd/notifications/route.ts — the signed-in user's in-app notifications (Phase P).
// Currently: pending campaign invites directed at them (a DM invited them by name). They
// accept/decline via /api/dnd/invites/[id]/respond. Defensive: if the directed-invite
// columns aren't migrated yet (seeds/413), this returns an empty list rather than erroring
// so the hub never breaks.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ notifications: [] });

  try {
    const { data: invites, error } = await supabaseAdmin
      .from('dnd_invites')
      .select('id, campaign_id, role, created_by, created_at, expires_at, invited_user_id, status')
      .eq('invited_user_id', session.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ notifications: [] }); // likely un-migrated DB

    const rows = (invites ?? []) as { id: string; campaign_id: string; role: string; created_by: string | null; created_at: string; expires_at: string | null }[];
    const active = rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now());
    if (active.length === 0) return NextResponse.json({ notifications: [] });

    const campIds = Array.from(new Set(active.map((r) => r.campaign_id)));
    const inviterIds = Array.from(new Set(active.map((r) => r.created_by).filter((v): v is string => !!v)));
    const [{ data: camps }, { data: users }] = await Promise.all([
      supabaseAdmin.from('dnd_campaigns').select('id, name, blurb').in('id', campIds),
      inviterIds.length ? supabaseAdmin.from('dnd_users').select('id, display_name').in('id', inviterIds) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    ]);
    const campById = new Map(((camps ?? []) as { id: string; name: string; blurb: string | null }[]).map((c) => [c.id, c]));
    const userById = new Map(((users ?? []) as { id: string; display_name: string }[]).map((u) => [u.id, u.display_name]));

    return NextResponse.json({
      notifications: active.map((r) => ({
        id: r.id,
        type: 'invite' as const,
        campaignId: r.campaign_id,
        campaignName: campById.get(r.campaign_id)?.name ?? 'a campaign',
        campaignBlurb: campById.get(r.campaign_id)?.blurb ?? null,
        role: r.role,
        inviterName: r.created_by ? userById.get(r.created_by) ?? 'The DM' : 'The DM',
        createdAt: r.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
