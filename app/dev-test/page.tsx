import dynamic from 'next/dynamic';

// Dev-only test page to render CAD layout for screenshots
const CADLayout = dynamic(() => import('../admin/cad/CADLayout'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading CAD...</div>
});

export default function DevTestPage() {
  if (process.env.NODE_ENV !== 'development') {
    return <div>Not available</div>;
  }
  return <CADLayout />;
}
