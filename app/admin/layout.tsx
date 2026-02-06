import type { Metadata } from 'next';
import AdminLayoutClient from './components/AdminLayoutClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: { default: 'Admin | Starr Surveying', template: '%s | Starr Surveying Admin' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
