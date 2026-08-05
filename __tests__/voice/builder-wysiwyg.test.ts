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

// AA-2 — the mobile editing tools are usable with a thumb. The desktop panes assume a mouse
// (hover-only affordances, sub-tap-target buttons, 13px inputs); this guards the phone-scoped fixes.
describe('AA-2 — mobile editing tools are touch-robust', () => {
  const CSS = read('app', 'AndrewAsh', 'studio', '_ui', 'builder.css');

  // Everything below lives inside the <1100px media query — the same seam where the three panes
  // collapse into tabs. Grab that block so a desktop rule can't accidentally satisfy the assertions.
  const mobileBlock = (() => {
    const at = CSS.indexOf('@media (max-width: 1099px)', CSS.indexOf('MOBILE EDITING TOOLS'));
    return at === -1 ? '' : CSS.slice(at);
  })();

  it('scopes the touch fixes to the phone/tablet breakpoint, not the desktop layout', () => {
    expect(mobileBlock).not.toBe('');
  });

  it('makes the insert-between affordance visible on touch (no hover to reveal)', () => {
    // On desktop `.vaBlockInsert` is `color: transparent` until :hover — invisible on a phone.
    expect(mobileBlock).toMatch(/\.vaBlockInsert\s*\{[^}]*color:\s*var\(--va-text-muted\)/);
  });

  it('gives the block reorder/hide/delete tools real 44px targets', () => {
    expect(mobileBlock).toMatch(/\.vaBlockTools button\s*\{[^}]*min-height:\s*44px/);
  });

  it('bumps inspector inputs to 16px so iOS Safari does not auto-zoom on focus', () => {
    expect(mobileBlock).toMatch(/\.vaInspector \.vaInput[\s\S]*?font-size:\s*1rem/);
  });

  it('pins the pane tabs so switching panes survives scrolling a long block list', () => {
    expect(mobileBlock).toMatch(/\.vaBuilderTabs\s*\{[^}]*position:\s*sticky/);
  });
});

// The phone preview must render the phone LAYOUT, not the desktop layout at a phone width. The site's
// layout breakpoints are viewport @media queries, which cannot see the editor's scaled-down canvas —
// so the same breakpoints are re-stated as @container queries scoped to `.vaPageCanvas`.
describe('the page-canvas responds to the canvas width, not the viewport', () => {
  const CSS = read('app', 'AndrewAsh', '_ui', 'voice.css');

  // Grab only the canvas-scoped layer so a stray viewport @media can't satisfy these.
  const canvasLayer = (() => {
    const at = CSS.indexOf('PAGE-CANVAS RESPONSIVENESS');
    return at === -1 ? '' : CSS.slice(at);
  })();

  it('adds a canvas-scoped container-query layer', () => {
    expect(canvasLayer).not.toBe('');
    expect(canvasLayer).toMatch(/@container vaPage \(/);
  });

  it('two-column sections stack in a narrow canvas and split only when the CANVAS is wide', () => {
    // Base (mobile-first) single column, scoped to the canvas so it out-specifies the @media rule.
    expect(canvasLayer).toMatch(/\.vaPageCanvas \.vaSplit\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(canvasLayer).toMatch(
      /@container vaPage \(min-width: 900px\)\s*\{[\s\S]*?\.vaPageCanvas \.vaSplit\s*\{[^}]*1\.05fr/,
    );
  });

  it('the hero portrait shows only when the canvas is desktop-wide', () => {
    expect(canvasLayer).toMatch(/\.vaPageCanvas \.vaHeroPortrait\s*\{[^}]*display:\s*none/);
    expect(canvasLayer).toMatch(
      /@container vaPage \(min-width: 1080px\)\s*\{[\s\S]*?\.vaPageCanvas \.vaHeroPortrait\s*\{[^}]*display:\s*block/,
    );
  });

  it('the media/text block stacks by canvas width, overriding its inline desktop columns', () => {
    expect(canvasLayer).toMatch(
      /@container vaPage \(max-width: 760px\)\s*\{[\s\S]*?\.vaPageCanvas \.vaMediaText\s*\{[^}]*1fr\s*!important/,
    );
  });

  it('scopes every rule under .vaPageCanvas so studio forms sharing these classes are untouched', () => {
    // No bare `.vaSplit {` / `.vaFieldRow2 {` inside the canvas layer — each must be `.vaPageCanvas …`.
    expect(canvasLayer).not.toMatch(/(?<!\.vaPageCanvas )\.vaSplit\s*\{/);
    expect(canvasLayer).not.toMatch(/(?<!\.vaPageCanvas )\.vaFieldRow2\s*\{/);
  });
});
