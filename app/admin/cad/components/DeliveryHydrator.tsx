'use client';
// app/admin/cad/components/DeliveryHydrator.tsx
//
// Phase 7 — invisible mounting point that keeps the in-memory
// delivery state in sync with the active drawing document.
//
// Watches the document id; whenever it changes (load,
// recovery, RECON import) the description + RPLS workflow
// record are pulled out of `doc.settings` and pushed into
// their respective stores via the `hydrateFromDocument`
// channel (which doesn't trigger the normal write-through —
// avoids a hydration loop).

import { useEffect, useRef } from 'react';

import {
  useDeliveryStore,
  useDrawingStore,
  useReviewWorkflowStore,
} from '@/lib/cad/store';

export default function DeliveryHydrator() {
  const docId = useDrawingStore((s) => s.document.id);
  const surveyDescription = useDrawingStore(
    (s) => s.document.settings.surveyDescription ?? null
  );
  const reviewRecord = useDrawingStore(
    (s) => s.document.settings.reviewRecord ?? null
  );
  const previousId = useRef<string | null>(null);

  useEffect(() => {
    if (previousId.current === docId) return;
    previousId.current = docId;
    useDeliveryStore.getState().hydrateFromDocument(surveyDescription);
    useReviewWorkflowStore.getState().hydrateFromDocument(reviewRecord);
  }, [docId, surveyDescription, reviewRecord]);

  return null;
}
