// app/dnd/campaigns/[id]/planet-forge/page.tsx — the 3D Planet Generator (Phase U, slice 5).
// Embeds the retinted WebGL planet forge (a same-origin static tool under /public). It runs its
// Three.js engine (via the tool's own CDN import-map) to sculpt real 3D worlds, then exports a
// baked spinning sprite-sheet (.planet3d). The handoff to the map is file-based: the DM imports
// that .planet3d in Map Studio's "3D" tab — no DB round-trip, so nothing to wire here. DM-gated.
import { redirect } from 'next/navigation';
import { getDndUser, getCampaignRole, isDndOpenAccess } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export default async function PlanetForgePage({ params }: { params: { id: string } }) {
  const user = await getDndUser();
  if (!user) redirect(isDndOpenAccess() ? '/dnd' : `/dnd/login?next=/dnd/campaigns/${params.id}/planet-forge`);
  if ((await getCampaignRole(params.id)) !== 'dm') redirect(`/dnd/campaigns/${params.id}`);

  const src = '/dnd/maps/planet-3d.html';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1e2d3d', background: '#0b1a2c', color: '#f0e6d2', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <a href={`/dnd/campaigns/${params.id}`} style={{ color: '#c8aa6e', textDecoration: 'none', fontSize: 13 }}>← Campaign</a>
        <a href={`/dnd/campaigns/${params.id}/map-studio`} style={{ color: '#c8aa6e', textDecoration: 'none', fontSize: 13 }}>✦ Map Maker</a>
        <span style={{ fontFamily: "'Cinzel', Georgia, serif", color: '#c8aa6e', letterSpacing: '0.06em', fontSize: 14 }}>🪐 3D Planet Forge</span>
        <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#a09b8c', textDecoration: 'none', fontSize: 12 }}>Open full-screen ↗</a>
      </div>
      <iframe
        src={src}
        title="3D Planet Forge"
        style={{ flex: 1, width: '100%', border: 0, background: '#010a13' }}
      />
    </div>
  );
}
