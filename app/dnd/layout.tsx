// app/dnd/layout.tsx — wraps the hidden /dnd platform. The Starr marketing header/footer
// are suppressed for /dnd (LayoutShell); this gives the platform its OWN chrome — a
// self-contained mini-site ("a different site hiding underneath"). noindex + Hextech fonts.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import DndHeader from './_ui/DndHeader';
import CommandPalette from './_ui/CommandPalette';
import DndFooter from './_ui/DndFooter';
import styles from './_ui/hextech.module.css';
import './_sheet/styles/fonts.css'; // every skin's webfonts, loaded on all /dnd pages (CS-1) so PF2/IG restyle too
import './_sheet/styles/skinAccents.css'; // per-skin surface textures for the bespoke sheets (CS-2)
import { getDndSession } from '@/lib/dnd/auth';

export const metadata: Metadata = {
  title: 'Starr Tabletop',
  robots: { index: false, follow: false },
};

export default async function DndLayout({ children }: { children: ReactNode }) {
  // Cheap, DB-free read of the signed cookie so the header can show who's signed in.
  const session = getDndSession();
  // Hextech fonts (Cinzel/Inter) are @imported in _ui/hextech.module.css, matching
  // the repo's Google-Fonts convention (app/styles/globals.css). The .siteChrome class
  // re-declares the --hx-* tokens locally so wrapping the tree doesn't tint the bespoke
  // character sheets — only the header/footer take a Hextech color.
  return (
    <div className={styles.siteChrome}>
      <DndHeader userName={session?.displayName ?? null} />
      {/* ⌘K anywhere in /dnd (P4-4). Mounted for SIGNED-IN users only: every source it searches is scoped
          to the caller, so a signed-out visitor would open it to an endpoint that 401s. It renders no DOM
          and fetches nothing until summoned — one keydown listener is its whole resting cost. */}
      {session && <CommandPalette />}
      <main className={styles.siteMain}>{children}</main>
      <DndFooter />
    </div>
  );
}
