// app/admin/components/calculator/useCalculatorKeyEvents.ts
//
// Hook every calculator-model wrapper uses to receive global keyboard
// accelerator events from the provider. C-24 of EXAM_CALCULATORS.md.
//
// The provider broadcasts `calculator:key` CustomEvents on window when a
// physical key matches one of the canonical ids (`n0`..`n9`, `dot`,
// `add/sub/mul/div`, `eq`, `enter`, `del`, `lparen/rparen/comma`, etc.).
// Each model's React wrapper consumes the event and dispatches it as a
// regular keypress through its engine — so the keyboard is functionally
// indistinguishable from the on-screen keypad for that model.

'use client';

import { useEffect } from 'react';

export function useCalculatorKeyEvents(handler: (keyId: string) => void): void {
  useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent).detail as { keyId?: string } | undefined;
      if (detail?.keyId) handler(detail.keyId);
    }
    window.addEventListener('calculator:key', onEvent);
    return () => window.removeEventListener('calculator:key', onEvent);
  }, [handler]);
}
