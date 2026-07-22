// The template picker's visual previews (owner: "select the template the same way we choose the
// colour themes"). `FormatPreview` is the format axis's answer to the skin swatch — a mini layout
// diagram per format. These guard that the picker stays visual and covers every format the registry
// can offer, so a new format can never slip into the picker with no preview (falling back to the
// generic classic diagram is the intended safe default, but every SHIPPED format should be explicit).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('the picker uses the visual preview, not the raw ASCII wireframe', () => {
    const src = read('app/dnd/_ui/TemplateBrowser.tsx');
    expect(src).toContain('FormatPreview');
    // The ASCII wireframe survives ONLY as the screen-reader label, never as a rendered <pre>.
    expect(src).not.toMatch(/<pre[^>]*>\{t\.wireframe\}/);
    expect(src).toContain('aria-label'); // the wireframe rides along for a11y
  });

  it('every registry template still carries a wireframe string for the a11y label', () => {
    for (const t of SHEET_TEMPLATES) expect(t.wireframe.length).toBeGreaterThan(0);
  });
});
