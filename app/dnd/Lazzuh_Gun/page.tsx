// app/dnd/Lazzuh_Gun/page.tsx — the Lazzuh Gun character sheet, rendered NATIVELY
// (Phase C6). This replaces the old static-SPA iframe (public/dnd-sheet/) with the
// vendored, CSS-scoped sheet running as a real Next client component.
//
// It stays public + localStorage-backed here, preserving the hidden personal
// sheet's exact behavior (no login needed, per-browser persistence). Upgrading it
// to DB-backed + login-gated (render `<SheetRoot characterId={LAZZUH_CHARACTER_ID} />`,
// drop the middleware exemption) is the C6b follow-up — deferred pending the
// public-vs-login decision so we don't lock the owner out of their own sheet or
// silently drop anonymous edits.
import type { Metadata } from 'next';
import SheetRoot from '@/app/dnd/_sheet/SheetRoot';

export const metadata: Metadata = {
  title: 'Lazzuh Gun',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default function LazzuhGunSheetPage() {
  // sheet_type 'lazzuh' → the neon skin + the Surge/forms module (C7/C8 registry).
  return <SheetRoot sheetType="lazzuh" />;
}
