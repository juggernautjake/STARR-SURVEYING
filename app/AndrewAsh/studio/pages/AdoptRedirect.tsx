'use client';
// app/AndrewAsh/studio/pages/AdoptRedirect.tsx — "Edit this page" on a page that is still the original.
//
// The public page's edit button links to `/studio/pages?adopt=<slug>` when there is no database row
// yet. This component performs the adoption (copy the built-in blocks into `va_pages`) and forwards
// to the builder, so from Andrew's side clicking Edit just opens the editor.
//
// ── WHY A COMPONENT AND NOT A SERVER-SIDE REDIRECT ──────────────────────────────────────────────
//
// Adoption is a WRITE. Doing it during the render of a GET request means any prefetch of that URL —
// and Next prefetches links in the viewport — silently creates rows. A client effect only runs on a
// real visit.
//
// The guard ref matters for the same reason at a smaller scale: React 18 Strict Mode runs effects
// twice in development, and without it every adoption would be attempted twice.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { BASE_PATH } from '@/lib/voice/content';

export default function AdoptRedirect({ slug }: { slug: string }): React.ReactElement {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const res = await fetch('/api/voice/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adopt: slug }),
        });
        const body = await res.json();
        if (res.ok && body.page?.id) {
          router.replace(`${BASE_PATH}/studio/pages/${body.page.id}`);
          return;
        }
      } catch {
        /* fall through to the list */
      }
      // Adoption failed — most likely the tables are not set up yet. Land on the page list rather
      // than a dead end, with the query string cleared so a refresh does not retry forever.
      router.replace(`${BASE_PATH}/studio/pages`);
    })();
  }, [slug, router]);

  return (
    <div className="vaNotice" role="status" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Loader2 size={16} aria-hidden className="vaSpin" />
      Opening “{slug}” for editing…
    </div>
  );
}
