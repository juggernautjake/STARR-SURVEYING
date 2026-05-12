'use client';
// app/admin/cad/components/AIAutoRunner.tsx
//
// Phase 6 §32 Slice 8 — AUTO escalation runner. Headless
// component (returns null) that watches the proposal queue and
// auto-accepts every head proposal whose confidence is ≥
// autoApproveThreshold, but ONLY when the active mode is AUTO.
//
// Decisions below the threshold stay queued so the CopilotCard
// can surface them to the surveyor — that's the escalation
// path described in §32.4. The component is "loop-free" by
// construction: a single useEffect fires on each new head, and
// accepting the head pushes a new state-set which re-fires the
// effect against the new head.

import { useEffect } from 'react';
import { useAIStore } from '@/lib/cad/store';

export default function AIAutoRunner() {
  const mode = useAIStore((s) => s.mode);
  const threshold = useAIStore((s) => s.autoApproveThreshold);
  const headId = useAIStore((s) => s.proposalQueue[0]?.id ?? null);
  const headConfidence = useAIStore(
    (s) => s.proposalQueue[0]?.confidence ?? null,
  );

  useEffect(() => {
    if (mode !== 'AUTO') return;
    if (headId === null || headConfidence === null) return;
    if (headConfidence < threshold) return; // escalation — surveyor decides
    // Defer the accept to the next macrotask so any animation
    // (e.g. the CopilotCard mount transition) lands first. When
    // accept fires the queue re-renders and we re-evaluate.
    const id = setTimeout(() => {
      const ai = useAIStore.getState();
      // Re-check inside the timeout in case the mode flipped
      // (Ctrl+Shift+M) or the surveyor manually skipped the
      // head between scheduling + firing.
      if (ai.mode !== 'AUTO') return;
      const stillHead = ai.proposalQueue[0];
      if (!stillHead || stillHead.id !== headId) return;
      if (stillHead.confidence < ai.autoApproveThreshold) return;
      ai.acceptHeadProposal();
    }, 0);
    return () => clearTimeout(id);
  }, [mode, threshold, headId, headConfidence]);

  return null;
}
