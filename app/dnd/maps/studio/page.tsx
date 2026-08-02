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
import styles from './studio.module.css';

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
    <div className={styles.shell}>
      <div className={styles.bar}>
        <a href="/dnd/maps" className={styles.back}>← My Maps</a>
        <span className={styles.title}>✦ Map Studio</span>
        <a href={src} target="_blank" rel="noreferrer" className={styles.fullscreen}>Open full-screen ↗</a>
      </div>
      <iframe src={src} title="Map Studio" className={styles.frame} />
    </div>
  );
}
