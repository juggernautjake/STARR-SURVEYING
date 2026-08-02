// app/admin/research/sites/page.tsx — Pillar A's registration screen (§8.1).
//
// The roadmap's own acceptance criterion (a): "registering a known-vendor county = pick county +
// paste URL + 1–2 params + confirm test property, < 5 min, NO CODE CHANGE."
import SitesClient from './SitesClient';
import './Sites.css';

export const metadata = { title: 'Data sources' };

export default function SitesPage() {
  return <SitesClient />;
}
