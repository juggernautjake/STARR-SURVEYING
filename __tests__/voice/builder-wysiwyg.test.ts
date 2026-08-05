// __tests__/voice/builder-wysiwyg.test.ts
//
// The Andrew Ash page builder's preview must be a faithful miniature of the live site, not a
// narrower reflow no visitor ever sees (owner report, 2026-08-05).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');
const BUILDER = read('app', 'AndrewAsh', 'studio', 'pages', '[id]', 'PageBuilder.tsx');
const SCALED = read('app', 'AndrewAsh', 'studio', 'pages', '[id]', 'ScaledCanvas.tsx');

describe('the preview renders at the true site width, then scales to fit', () => {
  it('renders through ScaledCanvas rather than a raw pane-width canvas', () => {
    // The old preview filled the ~850px middle pane, which is past the 700px breakpoint but short of
    // the 1160px wide measure — so the desktop layout reflowed into an arrangement no visitor gets.
    expect(BUILDER).toContain('<ScaledCanvas');
    expect(BUILDER).toContain('device={device}');
  });

  it('still renders the real WidgetRenderer, not a lookalike', () => {
    // The fix is about width, not content — the blocks must remain the live component.
    expect(BUILDER).toMatch(/<ScaledCanvas[\s\S]*?<WidgetRenderer widgets=\{blocks\}/);
  });

  it('uses a desktop design width past the site’s 1160px wide measure', () => {
    // Below ~1160 the container queries fire the narrow layout. 1200 renders the true desktop one.
    expect(SCALED).toMatch(/desktop:\s*1200/);
    expect(SCALED).toMatch(/mobile:\s*390/);
  });

  it('scales down to fit but never blows up past 1:1', () => {
    // A 390px phone in a 900px pane should sit at real size, not be magnified into a blurry giant.
    expect(SCALED).toMatch(/Math\.min\(1,/);
  });

  it('reserves the scaled footprint so there is no dead whitespace below', () => {
    // A transform does not shrink the layout box; without a sizer the shrunk canvas leaves a tall gap.
    expect(SCALED).toContain('naturalHeight * scale');
    expect(SCALED).toContain('offsetHeight');
  });
});

describe('the device switch is on the preview, reachable without selecting a block', () => {
  it('has Computer and Phone buttons in the builder chrome', () => {
    expect(BUILDER).toContain('vaDeviceToggle');
    expect(BUILDER).toMatch(/onClick=\{\(\) => setDevice\('desktop'\)\}/);
    expect(BUILDER).toMatch(/onClick=\{\(\) => setDevice\('mobile'\)\}/);
  });

  it('shows the zoom level so the shrunk view does not read as a bug', () => {
    expect(BUILDER).toMatch(/previewScale/);
    expect(BUILDER).toContain('onScaleChange={setPreviewScale}');
  });
});
