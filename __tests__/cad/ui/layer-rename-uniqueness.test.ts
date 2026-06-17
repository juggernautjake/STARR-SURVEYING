// __tests__/cad/ui/layer-rename-uniqueness.test.ts
//
// cad-domain-audit Slice B — LayerPanel's commitRename rejects a name
// that's already in use (case-insensitive), ignoring the layer being
// renamed itself. Mirrors the AI `createLayer` tool's collision check
// so the rule is identical no matter who creates the name.
//
// Source-locked: the panel is a React/DOM component.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel.commitRename — case-insensitive uniqueness', () => {
  it('runs a case-insensitive collision check against doc.layers', () => {
    expect(SRC).toMatch(
      /const collision = Object\.values\(doc\.layers\)\.find\(\s*\(l\) => l\.id !== renamingId && l\.name\.toLowerCase\(\) === trimmed\.toLowerCase\(\),\s*\)/,
    );
  });

  it('skips the renamed layer itself so a no-op rename commits silently', () => {
    expect(SRC).toMatch(/l\.id !== renamingId/);
  });

  it('surfaces a Starr-styled command-bar toast on collision', () => {
    expect(SRC).toMatch(
      /Layer named '\$\{trimmed\}' already exists \(id=\$\{collision\.id\}\)\. Rename cancelled\./,
    );
    expect(SRC).toMatch(/cad:commandOutput/);
  });

  it('does NOT call updateLayer when the collision check fails', () => {
    // Collision branch returns before the updateLayer call below it.
    // P6d dropped the `const store = useDrawingStore()` whole-store
    // sub, so the call now goes through
    // `useDrawingStore.getState().updateLayer(...)`. Accept either.
    expect(SRC).toMatch(
      /if \(collision\) \{[\s\S]*?setRenamingId\(null\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*(store|useDrawingStore\.getState\(\))\.updateLayer\(renamingId/,
    );
  });
});
