'use client';
// app/admin/components/files/useFileSelection.ts — multi-select for a file list (owner, 2026-09-27).
// The rules (Shift-click ranges, Select all, pruning) are in lib/files/selection.ts; this is the
// React state around them. `order` is the ids in the order they are SHOWN.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EMPTY_SELECTION, toggle, toggleAll, prune, allState, type SelectionState } from '@/lib/files/selection';

export interface FileSelection {
  selected: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  /** Checkbox handler — pass the click/change event so Shift is honoured. */
  onCheck: (id: string, e?: { shiftKey?: boolean; nativeEvent?: { shiftKey?: boolean } }) => void;
  toggleAll: () => void;
  all: 'all' | 'some' | 'none';
  clear: () => void;
}

export function useFileSelection(order: readonly string[]): FileSelection {
  const [state, setState] = useState<SelectionState>(EMPTY_SELECTION);
  const key = order.join('\u0000');

  // Anything that left the screen leaves the selection.
  useEffect(() => {
    setState((s) => prune(s, order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onCheck = useCallback<FileSelection['onCheck']>((id, e) => {
    const shift = Boolean(e?.shiftKey ?? e?.nativeEvent?.shiftKey);
    setState((s) => toggle(s, id, order, shift));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const all = allState(state, order);
  return useMemo(() => ({
    selected: state.selected,
    count: state.selected.size,
    isSelected: (id: string) => state.selected.has(id),
    onCheck,
    toggleAll: () => setState((s) => toggleAll(s, order)),
    all,
    clear: () => setState(EMPTY_SELECTION),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, onCheck, all, key]);
}
