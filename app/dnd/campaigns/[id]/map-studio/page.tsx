// app/dnd/campaigns/[id]/map-studio/page.tsx — the DM's galaxy Map Maker (Phase U).
// Embeds the restyled Stardust Map Studio (a same-origin static tool under /public) so it
// runs its proven vanilla engine unchanged, retinted to the hextech palette. DM-gated. The
// campaign id (+ optional map id) are passed through so a later slice can wire the tool's
// save/publish to the campaign maps API; today it persists to same-origin browser storage.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export default async function MapStudioPage({ params, searchParams }: { params: { id: string }; searchParams: { map?: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/campaigns/${params.id}/map-studio`);
  if ((await getCampaignRole(params.id)) !== 'dm') redirect(`/dnd/campaigns/${params.id}`);

  const q = new URLSearchParams({ campaign: params.id });
  if (searchParams.map) q.set('map', searchParams.map);
  const src = `/dnd/maps/map-studio.html?${q.toString()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1e2d3d', background: '#0b1a2c', color: '#f0e6d2', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <a href={`/dnd/campaigns/${params.id}`} style={{ color: '#c8aa6e', textDecoration: 'none', fontSize: 13 }}>← Campaign</a>
        <span style={{ fontFamily: "'Cinzel', Georgia, serif", color: '#c8aa6e', letterSpacing: '0.06em', fontSize: 14 }}>✦ Galaxy Map Maker</span>
        <a href={`/dnd/maps/map-studio.html?${q.toString()}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#a09b8c', textDecoration: 'none', fontSize: 12 }}>Open full-screen ↗</a>
      </div>
      <iframe
        src={src}
        title="Galaxy Map Maker"
        style={{ flex: 1, width: '100%', border: 0, background: '#010a13' }}
      />
    </div>
  );
}
