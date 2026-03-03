import type { Metadata } from 'next';
import CADLayout from './CADLayout';
import CADErrorBoundary from './components/CADErrorBoundary';

export const metadata: Metadata = {
  title: 'Starr CAD — Drawing Editor',
};

export default function CADPage() {
  return (
    <CADErrorBoundary>
      <CADLayout />
    </CADErrorBoundary>
  );
}
