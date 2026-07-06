import type { Metadata } from 'next';

// Hidden personal page — the Lazzuh Gun D&D 2024 character sheet.
// Reachable ONLY at /dnd/Lazzuh_Gun (not linked in any nav, not in the sitemap).
// The sheet is a self-contained SPA served statically from /public/dnd-sheet/ and
// mounted in a full-viewport iframe so its global CSS/JS can't collide with the
// rest of the site. Rebuild it with `node scripts/build-dnd-sheet.mjs`.
export const metadata: Metadata = {
  title: 'Lazzuh Gun',
  robots: { index: false, follow: false },
};

export default function LazzuhGunSheetPage() {
  return (
    <iframe
      src="/dnd-sheet/index.html"
      title="Lazzuh Gun — Character Sheet"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        zIndex: 100000,
        background: '#080512',
      }}
    />
  );
}
