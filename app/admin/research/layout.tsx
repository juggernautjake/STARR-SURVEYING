// Loads AdminResearch.css only for /admin/research/** routes.
// Moved out of AdminLayoutClient.tsx in PR 1 (Phase 0.5 cleanup) to avoid
// shipping route-specific CSS on every admin page.
import '../styles/AdminResearch.css';

export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
