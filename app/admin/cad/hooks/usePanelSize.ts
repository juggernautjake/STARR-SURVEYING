'use client';
// app/admin/cad/hooks/usePanelSize.ts
//
// Stateful wrapper over lib/cad/ui/panel-size: a panel dimension (px)
// that clamps to [min,max] and persists to localStorage under `key`.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md

import { useCallback, useState } from 'react';
import { clampPanelSize, readPanelSize, writePanelSize } from '@/lib/cad/ui/panel-size';

export function usePanelSize(
  key: string,
  defaultPx: number,
  min: number,
  max: number,
): [number, (n: number) => void] {
  const [size, setSizeState] = useState<number>(() =>
    readPanelSize(key, defaultPx, min, max),
  );

  const setSize = useCallback(
    (n: number) => {
      const clamped = clampPanelSize(n, min, max);
      setSizeState(clamped);
      writePanelSize(key, clamped);
    },
    [key, min, max],
  );

  return [size, setSize];
}
