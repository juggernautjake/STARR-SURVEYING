import type { Metadata } from 'next';
import PlatformLayoutClient from './components/PlatformLayoutClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: { default: 'Operator Console | Starr Software', template: '%s | Operator Console' },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformLayoutClient>{children}</PlatformLayoutClient>;
}
