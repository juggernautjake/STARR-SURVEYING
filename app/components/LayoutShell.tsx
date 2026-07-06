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

  // Marketing Header + Footer are intentionally suppressed on the
  // admin shell, the operator console, and the bare auth pages —
  // each of those owns its own chrome (AdminLayoutClient /
  // PlatformLayoutClient / etc.).
  if (isAdmin || isPlatform || isAuthPage || isCadHarness || isUxHarness || isDnd) {
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