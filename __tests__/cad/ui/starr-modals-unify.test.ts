// __tests__/cad/ui/starr-modals-unify.test.ts
//
// cad-trv-fidelity Slice 13 — all CAD messaging uses the Starr-styled
// modal, not native window.confirm/alert. Locks the alertAction +
// hideCancel infra and that MenuBar no longer calls native popups.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');

describe('ConfirmDialog — alertAction + hideCancel', () => {
  const SRC = read('app/admin/cad/components/ConfirmDialog.tsx');
  it('exports alertAction (single-button info modal)', () => {
    expect(SRC).toMatch(/export function alertAction\(/);
    expect(SRC).toMatch(/hideCancel: true/);
  });
  it('hides the Cancel button when hideCancel is set', () => {
    expect(SRC).toMatch(/!state\.hideCancel && \(/);
  });
  it('the ConfirmOpts type declares hideCancel', () => {
    expect(SRC).toMatch(/hideCancel\?:\s*boolean/);
  });
});

describe('MenuBar — no native window.confirm / alert remain', () => {
  const SRC = read('app/admin/cad/components/MenuBar.tsx');
  it('uses the Starr modal helpers', () => {
    expect(SRC).toMatch(/import \{ confirmAction, alertAction \} from '\.\/ConfirmDialog';/);
    expect(SRC).toMatch(/void alertAction\(\{/);
  });
  it('has no native window.confirm( or alert( calls left', () => {
    // Allow `.alert(` only as a property (none expected); native global
    // alert(/window.confirm( must be gone.
    expect(/(^|[^.\w])alert\(/.test(SRC)).toBe(false);
    expect(SRC.includes('window.confirm(')).toBe(false);
  });
  it('the Exit button confirms via the Starr modal (danger Leave/Stay)', () => {
    expect(SRC).toMatch(/title: 'Leave the CAD editor\?'/);
    expect(SRC).toMatch(/confirmLabel: 'Leave'/);
  });
});

describe('CAD dialog components — no native window.confirm / alert', () => {
  const FILES = [
    'app/admin/cad/components/FileManagerDialog.tsx',
    'app/admin/cad/components/SaveToDBDialog.tsx',
    'app/admin/cad/components/SealImageUploader.tsx',
    'app/admin/cad/components/ExportLayersDialog.tsx',
    'app/admin/cad/components/LineTypePicker.tsx',
  ];
  it.each(FILES)('%s uses the Starr modal helpers, not native popups', (file) => {
    const src = read(file);
    expect(/(^|[^.\w])alert\(/.test(src)).toBe(false);
    expect(src.includes('window.confirm(')).toBe(false);
    expect(src).toMatch(/from '\.\/ConfirmDialog'/);
  });
});
