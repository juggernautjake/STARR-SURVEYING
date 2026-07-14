// app/dnd/campaigns/[id]/map-studio/page.tsx — the DM's galaxy Map Maker (Phase U).
// Placeholder shell (slice 1): DM-gated route so "Open Map Maker" resolves. The full
// Stardust Map Studio editor (restyled + DB-wired) lands in a later slice and replaces
// this body. Non-DM members are bounced back to the campaign.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export default async function MapStudioPage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/campaigns/${params.id}/map-studio`);
  if ((await getCampaignRole(params.id)) !== 'dm') redirect(`/dnd/campaigns/${params.id}`);

  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#f0e6d2', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>✦</div>
        <h1 style={{ fontFamily: "'Cinzel', Georgia, serif", color: '#c8aa6e', letterSpacing: '0.06em', margin: '0 0 10px' }}>Galaxy Map Maker</h1>
        <p style={{ color: '#a09b8c', lineHeight: 1.6, margin: '0 0 20px' }}>
          The interactive map builder — planets, systems, sectors, stars, nebulas, stations and points of interest — is being wired into the campaign backend.
          For now, you can upload a premade map image from <b style={{ color: '#f0e6d2' }}>Map Management</b> on the campaign page, and it&apos;ll show up for your players.
        </p>
        <a href={`/dnd/campaigns/${params.id}`} style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 6, border: '1px solid #785a28', color: '#c8aa6e', textDecoration: 'none', background: 'rgba(200,155,60,0.08)' }}>
          ← Back to campaign
        </a>
      </div>
    </div>
  );
}
