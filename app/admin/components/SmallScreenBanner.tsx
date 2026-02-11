// app/admin/components/SmallScreenBanner.tsx — Dismissible small-screen disclaimer for editor pages
'use client';
import { useState, useEffect } from 'react';

interface SmallScreenBannerProps {
  /** Storage key so each page can remember dismissal independently */
  storageKey?: string;
}

export default function SmallScreenBanner({ storageKey = 'editor-banner-dismissed' }: SmallScreenBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show on screens < 768px
    const mq = window.matchMedia('(max-width: 767px)');
    const dismissed = sessionStorage.getItem(storageKey);
    if (mq.matches && !dismissed) setVisible(true);

    function onChange(e: MediaQueryListEvent) {
      if (e.matches && !sessionStorage.getItem(storageKey)) setVisible(true);
      else setVisible(false);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [storageKey]);

  if (!visible) return null;

  function dismiss() {
    sessionStorage.setItem(storageKey, '1');
    setVisible(false);
  }

  return (
    <div className="small-screen-banner" role="status">
      <div className="small-screen-banner__content">
        <span className="small-screen-banner__icon" aria-hidden="true">&#x1F4BB;</span>
        <p className="small-screen-banner__text">
          This content editor works best on a larger screen or desktop for the full experience.
        </p>
      </div>
      <button
        className="small-screen-banner__dismiss"
        onClick={dismiss}
        aria-label="Dismiss banner"
      >
        &times;
      </button>
    </div>
  );
}
