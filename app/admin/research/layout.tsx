// Loads AdminResearch.css only for /admin/research/** routes.
// Moved out of AdminLayoutClient.tsx in PR 1 (Phase 0.5 cleanup) to avoid
// shipping route-specific CSS on every admin page.
import type { Metadata } from 'next';
import '../styles/AdminResearch.css';
import { ConfirmDialogHost } from './components/ConfirmDialog';

export const metadata: Metadata = {
  title: 'Research — Starr Surveying',
};

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Singleton confirm dialog — invoked imperatively via
          `import { confirm } from './components/ConfirmDialog'`. */}
      <ConfirmDialogHost />
    </>
  );
}
