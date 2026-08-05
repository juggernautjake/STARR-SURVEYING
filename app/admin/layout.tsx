import type { Metadata } from 'next';
import AdminLayoutClient from './components/AdminLayoutClient';
// PWA plan W2. `public/manifest.json` has promised an installable app at /admin/me with no worker
// behind it; this registers one, scoped to /admin/ and off unless NEXT_PUBLIC_ADMIN_PWA=1.
import RegisterAdminPWA from './components/RegisterAdminPWA';
// Proactive "turn on notifications" prompt + silent re-subscribe when permission is already granted.
// Renders nothing unless there is one actionable tap to offer, so it is safe to mount app-wide.
import NotificationNudge from './components/NotificationNudge';

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: { default: 'Admin | Starr Surveying', template: '%s | Starr Surveying Admin' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterAdminPWA />
      <NotificationNudge />
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </>
  );
}
