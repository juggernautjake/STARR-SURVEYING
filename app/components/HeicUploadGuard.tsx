'use client';
// app/components/HeicUploadGuard.tsx
//
// Mounted once in the root layout. Installs the site-wide HEIC → JPEG upload guard
// (lib/images/heic-upload-guard.ts) and shows its state: a small "Converting photo…" pill while a
// conversion runs, then a short notice saying what happened. Also installs the `<img>` fallback
// (lib/images/heic-display.ts) that shows HEICs already in storage as JPEGs, converted on view.
//
// Self-contained on purpose — the admin Toast provider does not exist on the public site or in the
// portals, and this has to work on all of them.

import { useEffect, useState } from 'react';
import { installHeicUploadGuard } from '@/lib/images/heic-upload-guard';
import { installHeicImageFallback } from '@/lib/images/heic-display';
import { subscribeHeicStatus, type HeicNoticeLevel } from '@/lib/images/heic';
import './HeicUploadGuard.css';

interface Notice { id: number; level: HeicNoticeLevel; message: string }

const NOTICE_MS: Record<HeicNoticeLevel, number> = { info: 5000, warning: 12000, error: 20000 };

export default function HeicUploadGuard() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const uninstall = installHeicUploadGuard();
    const uninstallImages = installHeicImageFallback();
    let next = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = subscribeHeicStatus((e) => {
      if (e.type === 'progress') setProgress({ done: e.done, total: e.total });
      else if (e.type === 'idle') setProgress(null);
      else {
        const id = ++next;
        setNotices((prev) => [...prev.slice(-3), { id, level: e.level, message: e.message }]);
        const t = setTimeout(() => {
          timers.delete(t);
          setNotices((prev) => prev.filter((n) => n.id !== id));
        }, NOTICE_MS[e.level]);
        timers.add(t);
      }
    });
    return () => {
      unsubscribe();
      uninstall();
      uninstallImages();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (!progress && notices.length === 0) return null;

  return (
    <div className="heic-guard" data-testid="heic-guard">
      {progress && (
        <div className="heic-guard__pill" role="status" aria-live="polite" data-testid="heic-guard-progress">
          <span className="heic-guard__spinner" aria-hidden="true" />
          {progress.total === 1
            ? 'Converting photo…'
            : `Converting photos… ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}
        </div>
      )}
      {notices.map((n) => (
        <div
          key={n.id}
          className={`heic-guard__notice heic-guard__notice--${n.level}`}
          role={n.level === 'error' ? 'alert' : 'status'}
          data-testid="heic-guard-notice"
        >
          <span className="heic-guard__message">{n.message}</span>
          <button
            type="button"
            className="heic-guard__dismiss"
            aria-label="Dismiss"
            onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
