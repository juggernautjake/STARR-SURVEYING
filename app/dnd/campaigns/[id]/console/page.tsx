// app/dnd/campaigns/[id]/console/page.tsx — the player's Galactic Console (Phase U, slice 4).
// Embeds the restyled Stardust Console (a same-origin static tool under /public) so it runs its
// proven vanilla engine unchanged, retinted to the hextech palette. Any campaign member may view;
// the console's embedded bridge loads the campaign's published map from /api/dnd/campaigns/[id]/maps
// (either the ?map=<id> row or, failing that, whichever built map is published).
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export default async function ConsolePage({ params, searchParams }: { params: { id: string }; searchParams: { map?: string } }) {
  const user = await getDndUser();
  if (!user) redirect('/dnd');
  if ((await getCampaignRole(params.id)) === null) redirect(`/dnd/campaigns/${params.id}`);

  const q = new URLSearchParams({ campaign: params.id });
  if (searchParams.map) q.set('map', searchParams.map);
  const src = `/dnd/maps/console.html?${q.toString()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1e2d3d', background: '#0b1a2c', color: '#f0e6d2', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <a href={`/dnd/campaigns/${params.id}`} style={{ color: '#c8aa6e', textDecoration: 'none', fontSize: 13 }}>← Campaign</a>
        <span style={{ fontFamily: "'Cinzel', Georgia, serif", color: '#c8aa6e', letterSpacing: '0.06em', fontSize: 14 }}>◈ Galactic Console</span>
        <a href={`/dnd/maps/console.html?${q.toString()}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#a09b8c', textDecoration: 'none', fontSize: 12 }}>Open full-screen ↗</a>
      </div>
      <iframe
        src={src}
        title="Galactic Console"
        allow="fullscreen"
        allowFullScreen
        style={{ flex: 1, width: '100%', border: 0, background: '#010a13' }}
      />
    </div>
  );
}
