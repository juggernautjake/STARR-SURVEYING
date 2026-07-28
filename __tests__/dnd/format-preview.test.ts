// The template picker's visual previews (owner: "select the template the same way we choose the
// colour themes"). `FormatPreview` is the format axis's answer to the skin swatch — a mini layout
// diagram per format. These guard that the picker stays visual and covers every format the registry
// can offer, so a new format can never slip into the picker with no preview (falling back to the
// generic classic diagram is the intended safe default, but every SHIPPED format should be explicit).
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHEET_TEMPLATES } from '@/lib/dnd/sheet-templates';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('template picker visual previews', () => {
  it('FormatPreview renders an explicit diagram for every non-classic format id', () => {
    const src = read('app/dnd/_ui/FormatPreview.tsx');
    // classic is the default branch (the fallthrough), so it need not be named; every OTHER format
    // must have its own `id === '<format>'` branch so it gets a bespoke skeleton, not the classic one.
    for (const t of SHEET_TEMPLATES) {
      if (t.id === 'classic') continue;
      expect(src, `FormatPreview missing a branch for '${t.id}'`).toContain(`id === '${t.id}'`);
    }
  });

  // RE-POINTED 2026-07-28 (P0-5). This asserted against `TemplateBrowser.tsx`, which `SheetChrome`
  // superseded and which was rendered by NOTHING — so the test passed for months while guarding a picker
  // no user could open, and the preview it guards had silently left the product. A test naming a file is
  // only as good as that file being reachable; assert against the component that actually ships.
  it('the LIVE picker uses the visual preview, not the raw ASCII wireframe', () => {
    const src = read('app/dnd/_ui/SheetChrome.tsx');
    expect(src).toContain('FormatPreview');
    // The ASCII wireframe survives ONLY as a label/title, never as a rendered <pre>.
    expect(src).not.toMatch(/<pre[^>]*>\{t\.wireframe\}/);
  });

  it('the superseded browsers are gone, not merely unused', () => {
    // The pair `SheetChrome` replaced. Keeping them would re-create the exact condition above: a green
    // test pointed at a file no route renders.
    for (const orphan of ['app/dnd/_ui/TemplateBrowser.tsx', 'app/dnd/_ui/SheetStyleBrowser.tsx']) {
      expect(existsSync(join(process.cwd(), orphan)), `${orphan} should have been deleted with P0-5`).toBe(false);
    }
  });

  it('every registry template still carries a wireframe string for the a11y label', () => {
    for (const t of SHEET_TEMPLATES) expect(t.wireframe.length).toBeGreaterThan(0);
  });
});
