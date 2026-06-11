// __tests__/cad/hotkeys/context-narrowing.test.ts
//
// cad-domain-audit Slice I — `useHotkeyContext` pushes a hotkey
// context (`DIALOG`, `COMMAND_BAR`) while a surface owns focus,
// restoring the previous top on unmount. Wires into ModalFrame +
// CommandBar so canvas tool hotkeys (`s`, `p`, chord prefixes)
// stop firing inside dialogs / the command bar.
//
// The hook itself is React, so the runtime test exercises a
// minimal renderHook + zustand store integration. The wiring into
// the two host components is source-locked.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useHotkeysStore } from '@/lib/cad/store/hotkeys-store';
import {
  __hotkeyContextStack,
  __pushHotkeyContextForTests,
} from '@/app/admin/cad/hooks/useHotkeyContext';

afterEach(() => {
  // Drain the stack so test order doesn't leak.
  __hotkeyContextStack.length = 0;
  useHotkeysStore.getState().setActiveContext('CANVAS');
});

describe('hotkey context stack — push / pop / top-wins', () => {
  it('a push narrows the active context; the matching pop restores CANVAS', () => {
    expect(useHotkeysStore.getState().activeContext).toBe('CANVAS');
    const release = __pushHotkeyContextForTests('DIALOG');
    expect(useHotkeysStore.getState().activeContext).toBe('DIALOG');
    release();
    expect(useHotkeysStore.getState().activeContext).toBe('CANVAS');
  });

  it('top wins when nested, and popping the inner restores the outer', () => {
    const releaseOuter = __pushHotkeyContextForTests('DIALOG');
    expect(useHotkeysStore.getState().activeContext).toBe('DIALOG');
    const releaseInner = __pushHotkeyContextForTests('COMMAND_BAR');
    expect(useHotkeysStore.getState().activeContext).toBe('COMMAND_BAR');
    releaseInner();
    expect(useHotkeysStore.getState().activeContext).toBe('DIALOG');
    releaseOuter();
    expect(useHotkeysStore.getState().activeContext).toBe('CANVAS');
  });

  it('out-of-order pop still keeps the stack balanced (last-occurrence wins)', () => {
    const releaseA = __pushHotkeyContextForTests('DIALOG');
    const releaseB = __pushHotkeyContextForTests('COMMAND_BAR');
    expect(useHotkeysStore.getState().activeContext).toBe('COMMAND_BAR');
    // Pop the OUTER push first — the inner one should still be top.
    releaseA();
    expect(useHotkeysStore.getState().activeContext).toBe('COMMAND_BAR');
    releaseB();
    expect(useHotkeysStore.getState().activeContext).toBe('CANVAS');
  });
});

describe('source-lock: hosts wire useHotkeyContext correctly', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  it('ModalFrame pushes DIALOG while open', () => {
    const SRC = read('app/admin/components/ui/ModalFrame.tsx');
    expect(SRC).toMatch(/useHotkeyContext\('DIALOG', open\)/);
  });

  it('CommandBar pushes COMMAND_BAR while the input is focused', () => {
    const SRC = read('app/admin/cad/components/CommandBar.tsx');
    expect(SRC).toMatch(/useHotkeyContext\('COMMAND_BAR', uiStore\.commandBarFocused\)/);
  });
});
