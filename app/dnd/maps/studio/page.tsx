// app/dnd/maps/studio/page.tsx — the Map Studio, with no campaign in the way (owner request 2026-08-01).
//
// The campaign version of this page (`campaigns/[id]/map-studio`) redirects anyone who is not that
// campaign's DM. That is right there and wrong here: the owner's ask is that a person can *build and
// save a map independently of a campaign*, so the only gate is being signed in.
//
// Same iframe, same vanilla engine, one different query parameter — `?personal=1` instead of
// `?campaign=<id>`. The Studio's DB bridge reads that and points its Save button at `/api/dnd/maps`.
// Building a second embed would have meant a second copy of the de-inlining logic, which is the part
// of that file most expensive to get wrong twice.
import { redirect } from 'next/navigation';
import { getDndUser } from '@/lib/dnd/auth';

export const dynamic = 'force-dynamic';

export default async function PersonalMapStudioPage({ searchParams }: { searchParams: { map?: string } }) {
  const user = await getDndUser();
  // Sending an unauthenticated visitor to /dnd rather than a login wall matches the rest of the
  // tabletop side, which is open-access by direct link — /dnd decides whether that means "sign in".
  if (!user) redirect('/dnd');

  const q = new URLSearchParams({ personal: '1' });
  if (searchParams.map) q.set('map', searchParams.map);
  const src = `/dnd/maps/map-studio.html?${q.toString()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid #1e2d3d', background: '#0b1a2c', color: '#f0e6d2', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <a href="/dnd/maps" style={{ color: '#c8aa6e', textDecoration: 'none', fontSize: 13 }}>← My Maps</a>
        <span style={{ fontFamily: "'Cinzel', Georgia, serif", color: '#c8aa6e', letterSpacing: '0.06em', fontSize: 14 }}>✦ Map Studio</span>
        <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#a09b8c', textDecoration: 'none', fontSize: 12 }}>Open full-screen ↗</a>
      </div>
      <iframe src={src} title="Map Studio" style={{ flex: 1, width: '100%', border: 0, background: '#010a13' }} />
    </div>
  );
}
