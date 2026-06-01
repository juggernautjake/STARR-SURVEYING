// __tests__/cad/ui/blue-button-contrast.test.ts
//
// cad-trv-fidelity Slice 12 — solid-blue (and red danger) buttons must
// carry white text. Several CAD buttons set a blue fill but no text
// color, so the label inherited a dark color and was hard to read.
// Source-locked so they can't regress to inherited-dark text.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');

describe('solid-blue CAD buttons use white text', () => {
  it('the shared ConfirmDialog confirm button is white-on-blue AND white-on-red', () => {
    const src = read('app/admin/cad/components/ConfirmDialog.tsx');
    expect(src).toMatch(/bg-blue-700[^']*text-white/);
    expect(src).toMatch(/bg-red-700[^']*text-white/);
  });

  it.each([
    ['app/admin/cad/components/AnnotationPanel.tsx', 2],
    ['app/admin/cad/components/StandardNotesEditor.tsx', 1],
    ['app/admin/cad/components/PrintDialog.tsx', 1],
  ])('%s has no solid-blue button missing text-white', (file) => {
    const src = read(file);
    // Every bg-blue-700 button className in these files must include text-white.
    const blueButtonClasses = src.match(/className="[^"]*bg-blue-700[^"]*"/g) ?? [];
    expect(blueButtonClasses.length).toBeGreaterThan(0);
    for (const cls of blueButtonClasses) {
      expect(cls).toMatch(/text-white/);
    }
  });
});
