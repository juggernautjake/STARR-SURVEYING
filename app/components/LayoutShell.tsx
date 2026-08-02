'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isPlatform = pathname.startsWith('/platform');
  const isAuthPage = pathname === '/register';
  // The env-gated CAD UX-audit harness renders the bare editor shell.
  const isCadHarness = pathname.startsWith('/cad-harness');
  // The env-gated admin UX-audit harness renders admin pages bare.
  const isUxHarness = pathname.startsWith('/ux-harness');
  // The hidden /dnd D&D platform owns its own chrome (Hextech DM UI +
  // full-viewport bespoke character sheets) — no marketing header/footer.
  const isDnd = pathname.startsWith('/dnd');
  // Andrew Ash's voice-over portfolio + studio. A separate business with its own brand, its own
  // theme and its own header/footer — and one that is intended to be lifted out to its own domain
  // and repository later, so it must never depend on Starr's chrome. Matched case-insensitively
  // because the path is capitalised (/AndrewAsh) and a visitor who types it lowercase should still
  // get his site rather than his site wearing a surveying company's navigation.
  const isVoice = pathname.toLowerCase().startsWith('/andrewash');

  // Marketing Header + Footer are intentionally suppressed on the
  // admin shell, the operator console, and the bare auth pages —
  // each of those owns its own chrome (AdminLayoutClient /
  // PlatformLayoutClient / etc.).
  if (isAdmin || isPlatform || isAuthPage || isCadHarness || isUxHarness || isDnd || isVoice) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}