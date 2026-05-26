'use client';
// app/admin/cad/components/FullscreenToggle.tsx
//
// In-app Fullscreen API toggle so the CAD editor behaves like a kiosk /
// standalone window. Reflects the live fullscreen state (it can change
// via the browser's Esc/F11 too).
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md

import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export default function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      title={isFullscreen ? 'Exit full screen (Esc)' : 'Enter full screen'}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      aria-pressed={isFullscreen}
      className="flex items-center justify-center w-7 h-7 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}
