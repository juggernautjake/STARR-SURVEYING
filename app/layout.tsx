import type { Metadata } from 'next';
import './styles/globals.css';
import Header from './components/Header';
import Footer from './components/Footer';

export const metadata: Metadata = {
  title: 'Starr Surveying - Professional Land Surveying in Belton, Texas',
  description: 'Expert land surveying services including GPS, GIS, total station surveying, plats, deeds, and legal descriptions. Serving Central Texas with precision and integrity.',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Header />
        <main>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}