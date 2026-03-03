// app/admin/cad/page.tsx — CAD editor page (server component)
import type { Metadata } from 'next';
import CADLayout from './CADLayout';

export const metadata: Metadata = {
  title: 'Starr CAD — Drawing Editor',
};

export default function CADPage() {
  return <CADLayout />;
}
