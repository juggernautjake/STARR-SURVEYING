import type { Metadata } from 'next';
import AdminLayoutClient from './components/AdminLayoutClient';
// PWA plan W2. `public/manifest.json` has promised an installable app at /admin/me with no worker
// behind it; this registers one, scoped to /admin/ and off unless NEXT_PUBLIC_ADMIN_PWA=1.
import RegisterAdminPWA from './components/RegisterAdminPWA';

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: { default: 'Admin | Starr Surveying', template: '%s | Starr Surveying Admin' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegisterAdminPWA />
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </>
  );
}
