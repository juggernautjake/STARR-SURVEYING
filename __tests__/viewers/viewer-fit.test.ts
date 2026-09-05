// __tests__/viewers/viewer-fit.test.ts
//
// ── THE DEFAULT WAS 100% OF NATURAL SIZE, AND THE WIDTH HID IT ──────────────────────────────────
//
// Owner: *"the default is to have the zoom too far in on a lot of documents … the default view
// should show the full image/page each time the user opens a image/file or clicks between pages."*
//
// `SourceDocumentViewer` reset `zoom` to `1` on open and on every page change. `1` means 100% of
// the image's own pixels, not "fits the window". The image element carries `maxWidth: 100%`, so the
// WIDTH always fitted — which is exactly why this survived: on a landscape image the page looked
// correct, and only portrait scans, which is most recorded documents, overflowed vertically and
// showed their top third.
//
// The numbers below are the shapes a county clerk actually returns: a 2550×3300 letter scan at
// 300 dpi, a 1700×2200 at 200, and the wide plats.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  fitScale, isAtFit, shouldRefitOnPageChange, clampZoom, MIN_ZOOM, MAX_ZOOM,
  nextRotation, rotationFit, viewerIntent, isTypingTarget, VIEWER_SHORTCUTS, ZOOM_STEP, WHEEL_STEP,
  type Rotation, type ViewerIntent,
} from '@/lib/viewers/viewer-fit';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/**
 * Source with its comments blanked out, for the assertions that say something is ABSENT.
 *
 * Every file this slice touched now explains at length what it used to do wrong, and a raw scan
 * reads that explanation as the offence: the assertion that `fitForRotation` does not call
 * `getBoundingClientRect` failed against the comment saying *why it does not*. Twelfth instance in
 * this repository of a check matching its own prose.
 *
 * Length-preserving, so a slice taken by index still lands where it did — a stripper that collapses
 * a block comment to one character moves everything after it.
 */
const stripJs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
const VIEWER = 'app/admin/research/components/SourceDocumentViewer.tsx';
const GALLERY = 'app/admin/research/components/ArtifactGallery.tsx';
const FILE_VIEWER = 'app/admin/components/jobs/FileViewer.tsx';
const MEDIA_VIEWER = 'app/admin/components/MediaViewer.tsx';

/** A typical viewer panel inside the modal. */
const PANEL = { containerW: 900, containerH: 620 };

describe('a portrait scan fits, which is the whole bug', () => {
  it('a 2550×3300 letter page at 300 dpi', () => {
    const scale = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300 });
    expect(scale).not.toBeNull();

    // Laid out at maxWidth:100% the page is 900 wide and 1164.7 tall. To fit 620 of height it has
    // to come down to about 0.53 — and the old default of 1 showed 620 of 1165, just over half.
    expect(scale!).toBeCloseTo(620 / (900 * (3300 / 2550)), 4);
    expect(scale!).toBeLessThan(0.6);
  });

  it('and the whole page really is inside the container afterwards', () => {
    // The property that matters, asserted rather than inferred from the ratio.
    const naturalW = 2550, naturalH = 3300;
    const scale = fitScale({ ...PANEL, naturalW, naturalH })!;
    const laidOutW = Math.min(PANEL.containerW, naturalW);
    const laidOutH = laidOutW * (naturalH / naturalW);
    expect(laidOutW * scale).toBeLessThanOrEqual(PANEL.containerW + 0.001);
    expect(laidOutH * scale).toBeLessThanOrEqual(PANEL.containerH + 0.001);
  });

  it('control: the old behaviour genuinely overflowed', () => {
    // Without this the test above could pass against a formula that was never broken.
    const laidOutH = 900 * (3300 / 2550);
    expect(laidOutH * 1).toBeGreaterThan(PANEL.containerH);
    expect(laidOutH).toBeGreaterThan(1100);
  });

  it('a 1700×2200 scan at 200 dpi fits too', () => {
    const scale = fitScale({ ...PANEL, naturalW: 1700, naturalH: 2200 })!;
    const laidOutH = 900 * (2200 / 1700);
    expect(laidOutH * scale).toBeLessThanOrEqual(PANEL.containerH + 0.001);
  });
});

describe('landscape and wide plats', () => {
  it('a wide plat fits on width and is not shrunk further than it needs', () => {
    // 3300×2550 laid out at 900 wide is 695 tall, which still exceeds 620, so it scales a little.
    const scale = fitScale({ ...PANEL, naturalW: 3300, naturalH: 2550 })!;
    expect(scale).toBeGreaterThan(0.8);
    expect(scale).toBeLessThan(1);
  });

  it('a short wide image needs no scaling at all', () => {
    // 1800×600 laid out at 900 wide is 300 tall — already inside 620.
    expect(fitScale({ ...PANEL, naturalW: 1800, naturalH: 600 })).toBe(1);
  });
});

describe('small images are not blown up', () => {
  it('a 300×200 thumbnail stays at its own size', () => {
    // "Fit" means the whole page is visible, and it already is. Upscaling would only add blur.
    expect(fitScale({ ...PANEL, naturalW: 300, naturalH: 200 })).toBe(1);
  });

  it('and a tall narrow image smaller than the panel does too', () => {
    expect(fitScale({ ...PANEL, naturalW: 200, naturalH: 500 })).toBe(1);
  });

  it('but a tall narrow image LARGER than the panel is scaled', () => {
    const scale = fitScale({ ...PANEL, naturalW: 200, naturalH: 2000 })!;
    expect(scale).toBeLessThan(1);
    expect(200 * scale).toBeLessThanOrEqual(PANEL.containerW);
    expect(2000 * scale).toBeLessThanOrEqual(PANEL.containerH + 0.001);
  });
});

describe('the maxWidth:100% interaction, which is the subtle part', () => {
  it('uses the LAID OUT width, not the natural width', () => {
    // The naive formula is `containerW / naturalW`. For a 2550-wide scan in a 900 panel that is
    // 0.35, and combined with the already-applied maxWidth it would render the page at a third of
    // the size it should be — a different wrong answer from the one being fixed, and one that looks
    // deliberate enough to survive review.
    const naive = PANEL.containerW / 2550;
    const scale = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300 })!;
    expect(scale).toBeGreaterThan(naive);
    expect(naive).toBeLessThan(0.4);
  });
});

describe('un-measurable inputs return null rather than a plausible number', () => {
  it('a container that has not been laid out', () => {
    expect(fitScale({ containerW: 0, containerH: 0, naturalW: 2550, naturalH: 3300 })).toBeNull();
    expect(fitScale({ containerW: 1, containerH: 620, naturalW: 2550, naturalH: 3300 })).toBeNull();
  });

  it('an image whose dimensions the browser has not resolved', () => {
    expect(fitScale({ ...PANEL, naturalW: 0, naturalH: 0 })).toBeNull();
  });

  it('NaN anywhere', () => {
    expect(fitScale({ ...PANEL, naturalW: NaN, naturalH: 3300 })).toBeNull();
    expect(fitScale({ containerW: NaN, containerH: 620, naturalW: 2550, naturalH: 3300 })).toBeNull();
  });

  it('null and not 1, because 1 is the bug', () => {
    // A fallback of 1 here would put the viewer back in the over-zoomed state on exactly the frames
    // where the measurement was not ready — which is every first paint.
    expect(fitScale({ containerW: 0, containerH: 0, naturalW: 100, naturalH: 100 })).not.toBe(1);
  });
});

describe('zoom controls', () => {
  it('clamp to the shared bounds', () => {
    expect(clampZoom(50)).toBe(MAX_ZOOM);
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('isAtFit tolerates floating point', () => {
    expect(isAtFit(0.5320000001, 0.532)).toBe(true);
    expect(isAtFit(1, 0.532)).toBe(false);
  });
});

describe('the viewer uses it', () => {
  const src = read(VIEWER);

  it('fits on load rather than resetting to 1', () => {
    expect(src, 'the viewer no longer calls the fit helper').toContain('fitScale({');
    expect(src).toContain('if (needsFit.current) fitToContainer()');
  });

  it('a page change re-fits ONLY when at fit, so a manual zoom persists across pages', () => {
    // Owner's refinement: full-size on open, but once zoomed in, next/previous page keeps that
    // zoom. So the page-change effect no longer forces a re-fit — it asks the shared rule.
    const at = src.indexOf('needsFit.current = shouldRefitOnPageChange(zoom, fitZoom)');
    expect(at, 'the page-change effect no longer defers to the persist-zoom rule').toBeGreaterThan(-1);
    // It must be in the effect keyed on currentPage, or it fires at the wrong time.
    expect(src.slice(at, at + 200)).toContain('[currentPage]');
  });

  it('and does NOT set a zoom on page change, which would flash the wrong scale', () => {
    // The old code did `setZoom(1)` here. The new image's dimensions are unknown at that moment, so
    // any value set is a guess that gets corrected one frame later — visibly. onLoad measures.
    const at = src.indexOf('needsFit.current = shouldRefitOnPageChange(zoom, fitZoom)');
    const effect = src.slice(at, src.indexOf('}, [currentPage]);', at));
    expect(effect, 'the page-change effect sets a zoom again').not.toMatch(/setZoom\(/);
  });

  it('Reset returns to fit, not to 100%', () => {
    // Reset used to mean 100% of natural size — which on most scans is the over-zoomed state
    // somebody presses Reset to escape.
    const at = src.indexOf('function resetView()');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 240);
    expect(body).toContain('fitToContainer()');
    expect(body, 'resetView still snaps to 1').not.toMatch(/setZoom\(1\)/);
  });

  it('re-fits on resize only for somebody still at fit', () => {
    // Snapping a person back to fit while they are reading a detail at 400% would be worse than the
    // bug being fixed.
    expect(src).toContain('if (isAtFit(zoom, fitZoom)) fitToContainer()');
    expect(src).toContain('ResizeObserver');
  });

  it('and guards ResizeObserver for environments without it', () => {
    expect(src).toContain("typeof ResizeObserver === 'undefined'");
  });

  it('the zoom readout tells you when you are at fit', () => {
    expect(src).toContain("isAtFit(zoom, fitZoom) ? ' · fit' : ''");
  });

  it('control: the viewer file is the one being read', () => {
    expect(src).toContain('SourceDocumentViewer');
    expect(src.length).toBeGreaterThan(5000);
  });
});

// ── ROTATION ────────────────────────────────────────────────────────────────────────────────────
//
// A county scan arriving sideways is the normal case for a plat, and this viewer could not turn
// one. Rotation interacts with the fit in a way that is invisible to every test above, because they
// all pass rotation 0: `rotate()` is a transform, so the LAYOUT is unchanged and only the bounding
// box turns. Fitting a quarter-turned page against the un-swapped terms leaves it running off both
// sides — the same class of bug as the original, with a different symptom.

describe('rotation changes the box the container has to hold', () => {
  it('rotation 0 is exactly what it was, so nothing already shipped moves', () => {
    const before = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300 });
    const after = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 0 });
    expect(after).toBe(before);
  });

  it('180 is the same fit as 0 — the box is the same box, upside down', () => {
    const up = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 0 })!;
    const down = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 180 })!;
    expect(down).toBeCloseTo(up, 10);
  });

  it('a quarter turn swaps which side fits which', () => {
    // The portrait letter scan turned on its side becomes 1164.7 wide × 900 tall before scaling.
    const scale = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 90 })!;
    const laidOutW = Math.min(PANEL.containerW, 2550);          // 900
    const laidOutH = laidOutW * (3300 / 2550);                  // 1164.7
    // After the turn the container must hold laidOutH across and laidOutW down.
    expect(laidOutH * scale).toBeLessThanOrEqual(PANEL.containerW + 0.001);
    expect(laidOutW * scale).toBeLessThanOrEqual(PANEL.containerH + 0.001);
  });

  it('270 fits the same as 90', () => {
    const a = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 90 })!;
    const b = fitScale({ ...PANEL, naturalW: 2550, naturalH: 3300, rotation: 270 })!;
    expect(b).toBeCloseTo(a, 10);
  });

  it('control: the un-swapped formula genuinely overflows a turned page', () => {
    // Without this the assertions above could pass against a formula that ignores rotation
    // entirely — the exact mistake being guarded.
    //
    // The example has to be chosen, not assumed. A PORTRAIT scan turned sideways in this landscape
    // panel still fits at the unrotated scale, purely by luck of these numbers — the first version
    // of this control asserted that it did not, and was wrong. The case that genuinely breaks is a
    // WIDE plat stood upright: 3300×2550 lays out 900 × 695.5, fits flat at 0.891, and turned
    // occupies 620 across by 802 down in a container 620 tall.
    const naturalW = 3300, naturalH = 2550;
    const unrotatedFit = fitScale({ ...PANEL, naturalW, naturalH, rotation: 0 })!;
    const laidOutW = Math.min(PANEL.containerW, naturalW);
    const laidOutH = laidOutW * (naturalH / naturalW);

    // Turned, at the flat scale, the page is taller than the container.
    expect(laidOutW * unrotatedFit).toBeGreaterThan(PANEL.containerH);

    // And the rotation-aware answer does not have that problem.
    const turnedFit = fitScale({ ...PANEL, naturalW, naturalH, rotation: 90 })!;
    expect(laidOutW * turnedFit).toBeLessThanOrEqual(PANEL.containerH + 0.001);
    expect(laidOutH * turnedFit).toBeLessThanOrEqual(PANEL.containerW + 0.001);
  });

  it('and a wide plat turned upright is scaled down, where flat it barely was', () => {
    const flat = fitScale({ ...PANEL, naturalW: 3300, naturalH: 2550, rotation: 0 })!;
    const turned = fitScale({ ...PANEL, naturalW: 3300, naturalH: 2550, rotation: 90 })!;
    expect(turned).toBeLessThan(flat);
  });

  it('an un-measurable input is still null at every rotation', () => {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      expect(fitScale({ containerW: 0, containerH: 0, naturalW: 100, naturalH: 100, rotation })).toBeNull();
    }
  });
});

describe('nextRotation wraps', () => {
  it('goes round clockwise and lands back on 0', () => {
    let r: Rotation = 0;
    const seen: Rotation[] = [];
    for (let i = 0; i < 4; i++) { r = nextRotation(r, 'cw'); seen.push(r); }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it('and anticlockwise', () => {
    let r: Rotation = 0;
    const seen: Rotation[] = [];
    for (let i = 0; i < 4; i++) { r = nextRotation(r, 'ccw'); seen.push(r); }
    expect(seen).toEqual([270, 180, 90, 0]);
  });

  it('defaults to clockwise', () => {
    expect(nextRotation(0)).toBe(90);
  });

  it('the wrap is the case worth checking — 270 + 90 is 0, not 360', () => {
    // A lookup table is where somebody forgets this row, and 360 is not a `Rotation`.
    expect(nextRotation(270, 'cw')).toBe(0);
    expect(nextRotation(0, 'ccw')).toBe(270);
  });
});

// ── THE KEYBOARD MAP ────────────────────────────────────────────────────────────────────────────
//
// Before this the viewer handled Escape, ← and →, and printed a hint naming two of them. The map
// and the hint are now one list, so they cannot drift — this repository has shipped four defects
// this week of exactly the "label says one thing, code does another" shape.

describe('the keyboard map', () => {
  const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    viewerIntent({ key, ...mods });

  it('every shortcut in the list resolves to its own intent', () => {
    // The list IS the map, so this is the assertion that the map is reachable at all.
    for (const s of VIEWER_SHORTCUTS) {
      for (const key of s.keys) {
        expect(press(key), `key "${key}" should mean ${s.intent}`).toBe(s.intent);
      }
    }
  });

  it('control: the list is not empty and covers the controls the toolbar has', () => {
    // Without this the loop above passes vacuously on an empty list — the failure mode that has hit
    // this repository more than a dozen times.
    expect(VIEWER_SHORTCUTS.length).toBeGreaterThanOrEqual(12);
    const intents = new Set<ViewerIntent>(VIEWER_SHORTCUTS.map((s) => s.intent));
    for (const required of ['close', 'prev-page', 'next-page', 'zoom-in', 'zoom-out', 'fit',
      'rotate-cw', 'rotate-ccw', 'fullscreen', 'download'] as ViewerIntent[]) {
      expect(intents.has(required), `no shortcut for ${required}`).toBe(true);
    }
  });

  it('no key means two things', () => {
    const seen = new Map<string, ViewerIntent>();
    for (const s of VIEWER_SHORTCUTS) {
      for (const key of s.keys) {
        expect(seen.has(key), `"${key}" is bound to both ${seen.get(key)} and ${s.intent}`).toBe(false);
        seen.set(key, s.intent);
      }
    }
  });

  it('an unbound key means nothing', () => {
    expect(press('q')).toBeNull();
    expect(press('Tab')).toBeNull();
    expect(press(' ')).toBeNull();
  });

  // ── The line that matters most in the whole module ────────────────────────────────────────
  it('Ctrl, Meta and Alt hand the key back to the browser', () => {
    // Ctrl+D bookmarks. Cmd+F opens find. Ctrl+- and Ctrl+0 are the browser's own zoom. A viewer
    // that swallows those has broken the browser to add a feature, and it does it silently:
    // preventDefault on a shortcut somebody expected raises no error anywhere.
    expect(press('d', { ctrlKey: true })).toBeNull();
    expect(press('f', { metaKey: true })).toBeNull();
    expect(press('-', { ctrlKey: true })).toBeNull();
    expect(press('0', { ctrlKey: true })).toBeNull();
    expect(press('ArrowLeft', { altKey: true })).toBeNull();   // back, in most browsers
  });

  it('control: those same keys DO resolve without a modifier', () => {
    // Otherwise the assertions above would pass on a map that had no bindings for them at all.
    expect(press('d')).toBe('download');
    expect(press('f')).toBe('fullscreen');
    expect(press('-')).toBe('zoom-out');
    expect(press('0')).toBe('fit');
  });

  it('Shift is NOT a modifier here, because it is how ⇧R and + are typed', () => {
    expect(press('R')).toBe('rotate-ccw');
    expect(press('r')).toBe('rotate-cw');
    expect(press('+')).toBe('zoom-in');
  });

  it('every entry has something printable to show and something to call it', () => {
    for (const s of VIEWER_SHORTCUTS) {
      expect(s.shown.length, `${s.intent} has nothing to print`).toBeGreaterThan(0);
      expect(s.label.length, `${s.intent} has no label`).toBeGreaterThan(2);
      expect(s.keys.length, `${s.intent} is bound to nothing`).toBeGreaterThan(0);
    }
  });
});

describe('typing beats shortcuts', () => {
  it('an input, a textarea and a select swallow the key', () => {
    // The toolbar carries a `<select>` for line width, and `d` typed in a caption must write a `d`.
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea']) {
      expect(isTypingTarget({ tagName }), `${tagName} should be a typing target`).toBe(true);
    }
  });

  it('and contenteditable does too', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('control: an ordinary element does not', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe('the zoom steps are shared, so the buttons and the wheel agree', () => {
  it('both are real, positive, and smaller than the whole range', () => {
    expect(ZOOM_STEP).toBeGreaterThan(0);
    expect(WHEEL_STEP).toBeGreaterThan(0);
    expect(ZOOM_STEP).toBeLessThan(MAX_ZOOM - MIN_ZOOM);
  });

  it('the viewer uses the constants rather than re-typing the numbers', () => {
    const src = read(VIEWER);
    expect(src, 'the wheel handler still has a literal step').not.toMatch(/deltaY > 0 \? -0\.15/);
    expect(src).toContain('-WHEEL_STEP : WHEEL_STEP');
    expect(src).toContain('clampZoom(z + ZOOM_STEP)');
  });
});

// ── THE VIEWER ACTUALLY USES ALL OF IT ──────────────────────────────────────────────────────────
//
// The repository's most common defect is a component that is written, tested and mounted by
// nothing — or, here, a control that exists in the module and is never wired to a button. These
// assert the CALLER.

describe('the viewer wires the new controls', () => {
  const src = read(VIEWER);
  const css = read('app/admin/styles/AdminResearch.css');

  it('rotates, and re-fits for the rotation it is APPLYING', () => {
    // `setRotation` is async, so reading `rotation` inside the same handler fits the PREVIOUS
    // orientation — a turned portrait scan then runs off both sides. `rotateBy` passes the new
    // value explicitly, which is the whole reason `fitToContainer` takes an argument.
    expect(src).toContain('nextRotation(rotation, direction)');
    expect(src).toContain('fitToContainer(next)');
    expect(src, 'the transform does not apply the rotation').toContain('rotate(${rotation}deg)');
  });

  it('and the fit reads the rotation rather than assuming zero', () => {
    const at = src.indexOf('const scale = fitScale({');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 320)).toContain('rotation: forRotation ?? rotation');
  });

  it('offers full screen, and follows the browser rather than guessing', () => {
    // Escape leaves full screen without calling anything of ours; an optimistic flag would then
    // label the button "Exit full screen" on a window that is not.
    expect(src).toContain("addEventListener('fullscreenchange'");
    expect(src).toContain('setIsFullscreen(!!document.fullscreenElement)');
    expect(src).toContain('requestFullscreen()');
    expect(src).toContain('exitFullscreen()');
  });

  it('full-screens the PANEL, not the translucent backdrop', () => {
    const at = src.indexOf('const toggleFullscreen');
    expect(src.slice(at, at + 200)).toContain('panelRef.current');
  });

  it('offers a download, and the key clicks the same link the button is', () => {
    // Two implementations is how the key and the button end up saving different things.
    expect(src, 'no download control at all').toMatch(/download=\{downloadName\(/);
    expect(src).toContain("case 'download':    downloadRef.current?.click()");
  });

  it('the download name is derived from the document and page, and is safe as a filename', () => {
    const at = src.indexOf('const downloadName');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf('}, [doc.document_label', at));
    expect(body, 'the filename is not sanitised').toContain('[^\\w.-]');
    expect(body, 'a multi-page document does not say which page').toContain('p${pageIndex + 1}');
  });

  it('resolves every key through the shared map rather than a second switch of literals', () => {
    const at = src.indexOf('const handleKeyDown');
    const handler = src.slice(at, src.indexOf('[requestClose, drawMode', at));
    expect(handler).toContain('viewerIntent(e)');
    expect(handler).toContain('isTypingTarget(e.target)');
    // The old hand-rolled comparisons are gone.
    expect(handler, 'the handler still compares raw key strings').not.toMatch(/e\.key === 'Arrow/);
  });

  it('and Escape does not close out from under full screen', () => {
    const at = src.indexOf("if (intent === 'close')");
    const branch = src.slice(at, at + 420);
    expect(branch).toContain('document.fullscreenElement');
    expect(branch).toContain('setDrawMode(false)');
  });

  it('the on-screen hint is DERIVED from the same list', () => {
    // The previous hint was hand-typed and named two of the three keys that worked.
    expect(src).toContain('VIEWER_SHORTCUTS');
    const at = src.indexOf('research-viewer__key-hint');
    expect(at, 'the hint is gone entirely').toBeGreaterThan(-1);
    expect(src.slice(at - 900, at + 900)).toContain('.filter((s) => !s.paged || pageImageUrls.length > 1)');
  });

  it('every class the new controls render has a CSS rule', () => {
    // Route-scoped: AdminResearch.css loads LAST on these routes, which has swallowed three fixes
    // made elsewhere. A class styled in a shared sheet would not survive here.
    for (const cls of [
      'research-viewer__img-download',
      'research-viewer--fullscreen',
      'research-viewer__key-toggle',
      'research-viewer__key-hint-item',
      'research-viewer__img-caption-text',
    ]) {
      expect(css, `.${cls} is rendered and has no rule`).toContain(`.${cls}`);
    }
  });

  it('control: a class that does not exist is not found in the stylesheet', () => {
    expect(css).not.toContain('.research-viewer__invented-for-this-control');
  });
});

// ── THE OTHER VIEWER, WHICH DID NOT HAVE THE BUG ────────────────────────────────────────────────
//
// The obvious move after fixing `SourceDocumentViewer` was to copy the fix into `ArtifactGallery`.
// Checking first is what stopped that: `.artifact-lightbox__image` is `max-width: 90vw;
// max-height: 80vh; object-fit: contain`, so its image is constrained on BOTH axes and already fits
// the window at scale 1. That CSS is the reason the owner's complaint named the document viewer and
// not the gallery, and copying `fitScale` in would have replaced a working default with a
// calculation whose assumptions do not hold there.
//
// What a both-constrained viewer still gets wrong is ROTATION, because a transform is not layout.

describe('rotationFit — for a viewer the CSS already fits', () => {
  const BOX = { containerW: 1200, containerH: 800 };

  it('an upright page needs no extra scaling', () => {
    expect(rotationFit({ ...BOX, laidOutW: 600, laidOutH: 780, rotation: 0 })).toBe(1);
    expect(rotationFit({ ...BOX, laidOutW: 600, laidOutH: 780, rotation: 180 })).toBe(1);
  });

  it('a tall page turned sideways is scaled to survive the turn', () => {
    // 600×780 turned is 780 across and 600 down. 780 fits 1200, but the check is the pair.
    const s = rotationFit({ ...BOX, laidOutW: 600, laidOutH: 780, rotation: 90 });
    expect(780 * s).toBeLessThanOrEqual(BOX.containerW + 0.001);
    expect(600 * s).toBeLessThanOrEqual(BOX.containerH + 0.001);
  });

  it('the case that genuinely bites: a page as tall as the container', () => {
    // 500 wide × 800 tall in an 800-tall container fits upright exactly. Turned, it needs 800
    // across — fine — and 500 down — fine. So widen it: 500 × 1100 does not fit upright either,
    // but the lightbox CSS would have capped it, so the realistic turned case is a WIDE artifact.
    const s = rotationFit({ ...BOX, laidOutW: 1200, laidOutH: 500, rotation: 90 });
    // Turned, it needs 500 across and 1200 down in an 800-tall container: it must shrink.
    expect(s).toBeLessThan(1);
    expect(1200 * s).toBeLessThanOrEqual(BOX.containerH + 0.001);
  });

  it('control: without the swap that same artifact overflows', () => {
    // The mistake being guarded, stated as arithmetic: at scale 1 the turned box is 1200 tall in
    // an 800-tall container.
    expect(1200 * 1).toBeGreaterThan(BOX.containerH);
  });

  it('90 and 270 agree', () => {
    const a = rotationFit({ ...BOX, laidOutW: 1200, laidOutH: 500, rotation: 90 });
    const b = rotationFit({ ...BOX, laidOutW: 1200, laidOutH: 500, rotation: 270 });
    expect(b).toBe(a);
  });

  it('never upscales', () => {
    expect(rotationFit({ ...BOX, laidOutW: 100, laidOutH: 80, rotation: 90 })).toBe(1);
  });

  it('an unmeasured box returns 1, not null — the safe answer, unlike fitScale', () => {
    // Different from `fitScale` on purpose: there a wrong answer left the viewer over-zoomed, so
    // "I do not know" had to be distinguishable. Here the caller is already fitted by CSS, so "no
    // extra scaling" is both the correct answer for an upright page and the safe one for an
    // unmeasurable box.
    expect(rotationFit({ containerW: 0, containerH: 0, laidOutW: 0, laidOutH: 0, rotation: 90 })).toBe(1);
    expect(rotationFit({ containerW: NaN, containerH: 800, laidOutW: 600, laidOutH: 900, rotation: 90 })).toBe(1);
  });
});

describe('the gallery lightbox wires the same controls', () => {
  const src = read(GALLERY);
  const css = read('app/admin/styles/AdminResearch.css');

  it('control: the gallery file is the one being read', () => {
    expect(src).toContain('ArtifactGallery');
    expect(src.length).toBeGreaterThan(5000);
  });

  it('reads the shared module rather than a second copy of the rules', () => {
    expect(src).toContain("from '@/lib/viewers/viewer-fit'");
    expect(src).toContain('rotationFit({');
    expect(src).toContain('nextRotation(rotation, direction)');
  });

  it('the wheel and the buttons use the shared step and clamp', () => {
    expect(src, 'the wheel still has a literal step').not.toMatch(/deltaY > 0 \? -0\.15/);
    expect(src, 'a zoom button still clamps by hand').not.toMatch(/Math\.min\(z \+ 0\.25, 10\)/);
    expect(src).toContain('clampZoom(z + ZOOM_STEP)');
  });

  it('measures the LAID OUT size, not the transformed one', () => {
    // `getBoundingClientRect` here would measure the box after the rotation and scale already
    // applied, and feed the result back into itself.
    //
    // Read from the COMMENT-STRIPPED source. The first version of this assertion failed against
    // the comment in the component explaining why it does not call `getBoundingClientRect`.
    const code = stripJs(src);
    const at = code.indexOf('const fitForRotation');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, code.indexOf('}, []);', at));
    expect(body).toContain('img.clientWidth');
    expect(body, 'reads a post-transform measurement').not.toContain('getBoundingClientRect');
  });

  it('control: stripJs removes a comment and keeps the code beside it', () => {
    // Without this the assertion above passes on a stripper that blanks everything.
    const sample = 'const a = 1; // getBoundingClientRect is wrong here\nconst b = 2;';
    expect(stripJs(sample)).not.toContain('getBoundingClientRect');
    expect(stripJs(sample)).toContain('const a = 1;');
    expect(stripJs(sample)).toContain('const b = 2;');
    // And it does not eat a URL's double slash.
    expect(stripJs("const u = 'https://x';")).toContain('https://x');
  });

  it('rotates the image, and re-fits for the turn it is applying', () => {
    expect(src).toContain('rotate(${rotation}deg)');
    expect(src).toContain('setZoom(fitForRotation(next))');
  });

  it('offers full screen, following the browser rather than a flag', () => {
    expect(src).toContain("addEventListener('fullscreenchange'");
    expect(src).toContain('requestFullscreen()');
  });

  it('offers a real download AND the open-in-a-tab link, which are two different acts', () => {
    // Before this only `↗` existed. It opens the file; it does not save it.
    expect(src).toMatch(/download=\{downloadName\}/);
    expect(src).toContain('Open in a new tab');
  });

  it('the keyboard moved into the lightbox and nothing left behind fires twice', () => {
    // Two handlers on `window` would advance the gallery by two artifacts per arrow press.
    expect(src).toContain('viewerIntent(e)');
    expect(src, 'the parent still has its own key handler')
      .not.toMatch(/if \(e\.key === 'ArrowRight'\) goNext\(\);/);
  });

  it('and a modifier is still handed back to the browser, through the shared resolver', () => {
    // Asserted in the module's own tests; asserted here that this component goes through it rather
    // than comparing `e.key` itself.
    const at = src.indexOf('function handleKey(e: KeyboardEvent)');
    expect(at).toBeGreaterThan(-1);
    const handler = src.slice(at, at + 1800);
    expect(handler).toContain('isTypingTarget(e.target)');
    expect(handler, 'the handler compares raw keys again').not.toMatch(/e\.key === '/);
  });

  it('every class the new gallery controls render has a rule', () => {
    for (const cls of ['artifact-lightbox__keys', 'artifact-lightbox__keys-item']) {
      expect(css, `.${cls} is rendered and has no rule`).toContain(`.${cls}`);
    }
  });
});

describe('the two viewers agree about what a key means', () => {
  // The point of the shared module. Two components, one map — so "what does R do" cannot have two
  // answers, which is exactly what it had before: the gallery had no R at all.
  const viewer = read(VIEWER);
  const gallery = read(GALLERY);

  it('both resolve through viewerIntent', () => {
    expect(viewer).toContain('viewerIntent(');
    expect(gallery).toContain('viewerIntent(');
  });

  it('neither re-implements the clamp', () => {
    for (const [name, src] of [['viewer', viewer], ['gallery', gallery]] as const) {
      expect(src, `${name} clamps zoom by hand`).not.toMatch(/Math\.min\(Math\.max\([^)]*0\.1\)/);
    }
  });

  it('control: both files were actually read', () => {
    expect(viewer.length).toBeGreaterThan(5000);
    expect(gallery.length).toBeGreaterThan(5000);
  });
});

// ── THE OTHER TWO VIEWERS, AND A DEFECT FOUND BY LOOKING AT THEM ────────────────────────────────
//
// There are five image viewers in this admin. Giving the research ones a rotate control they had
// never had meant reading the two that already had one — and both turned the page without
// re-fitting it.
//
// `FileViewer` (jobs, projects, photo gallery — three callers) has had a rotate button since it was
// written. `.file-viewer__image` is `max-width: 100%; max-height: 85vh`, so an upright photo fits
// exactly, and a transform is not layout: turning a portrait phone photo a quarter laid the 85vh
// side across a stage nowhere near that wide, and it ran off both edges at scale 1. Nothing failed.
// The photo was still there; you could not see the ends of it.
//
// `MediaViewer` (messaging, CAD, learn) had no rotate at all, and a hard `MIN_SCALE = 1` that would
// have made adding one produce the same crop.

describe('the jobs file viewer re-fits when it turns a page', () => {
  const src = read(FILE_VIEWER);
  const code = stripJs(src);

  it('control: the file being read is the one that has the rotate button', () => {
    expect(src).toContain('FileViewer');
    expect(src).toContain('RotateCw');
    expect(src.length).toBeGreaterThan(5000);
  });

  it('reads the shared module rather than a fourth copy of the arithmetic', () => {
    expect(src).toContain("from '@/lib/viewers/viewer-fit'");
    expect(code).toContain('rotationFit({');
  });

  it('no call site still turns the page without re-fitting', () => {
    // Both the R key and the toolbar button used to do `setRotation((d) => (d + 90) % 360)`
    // directly. Either one left behind is the bug, in half the cases.
    expect(code, 'a call site still rotates without re-fitting')
      .not.toMatch(/setRotation\(\(d\) => \(d \+ 90\) % 360\)/);
    expect(code).toContain('rotate()');
    expect(code).toContain('onClick={rotate}');
  });

  it('measures the laid-out image, not the transformed box', () => {
    const at = code.indexOf('const rotate = useCallback');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, at + 900);
    expect(body).toContain('img.clientWidth');
    expect(body).not.toContain('getBoundingClientRect');
  });

  it('and the rotate handler is in the key effect deps, or R turns from 0 every time', () => {
    // `rotate` closes over `rotation` now. A stale closure would rotate 0 → 90 on every press.
    const at = code.indexOf("case 'r': case 'R'");
    expect(at).toBeGreaterThan(-1);
    const deps = code.slice(at, code.indexOf('}, [', at) + 200);
    expect(deps).toMatch(/\}, \[[^\]]*rotate[^\]]*\]/);
  });
});

describe('the shared media viewer can turn a page at all now', () => {
  const src = read(MEDIA_VIEWER);
  const code = stripJs(src);

  it('control: the file being read is the shared viewer', () => {
    expect(src).toContain('MediaViewer');
    expect(src).toContain('media-viewer__stage');
  });

  it('has rotate controls, in both directions', () => {
    expect(code).toContain("rotate('cw')");
    expect(code).toContain("rotate('ccw')");
    expect(code).toContain('rotate(${rotation}deg)');
  });

  it('the zoom floor moved from a constant 1 to the rotation fit', () => {
    // `MIN_SCALE = 1` would have clamped a turned image straight back to the size that crops it,
    // so the rotate button would have been a control that visibly does the wrong thing.
    expect(code, 'the hard floor is still there').not.toMatch(/const MIN_SCALE = 1;/);
    expect(code).toContain('baseScale, MAX_SCALE');
    expect(code).toContain('setBaseScale(fit)');
  });

  it('every comparison against the old floor moved with it', () => {
    // Six sites compared `scale` to the literal 1 — pan gating, the double-click, the wheel snap,
    // the touch handlers and the cursor. One left behind means panning is disabled on a rotated
    // image that IS zoomed, which reads as a frozen viewer.
    expect(code, 'a scale comparison still uses the literal floor').not.toMatch(/scale [<>]=? 1\b/);
    expect(code).toMatch(/scale > baseScale/);
    expect(code).toMatch(/scale <= baseScale/);
  });

  it('"fit to screen" keeps the rotation; only a new item clears it', () => {
    // Pressing fit after turning a photo means "show me all of it", not "undo my rotation".
    expect(code).toContain('const fitCurrent');
    expect(code).toContain('onClick={fitCurrent}');
    const at = code.indexOf('const reset = useCallback');
    expect(code.slice(at, at + 200)).toContain('setRotation(0)');
  });
});

describe('all four viewers now share one rotation model', () => {
  const files = [
    ['SourceDocumentViewer', read(VIEWER)],
    ['ArtifactGallery', read(GALLERY)],
    ['FileViewer', read(FILE_VIEWER)],
    ['MediaViewer', read(MEDIA_VIEWER)],
  ] as const;

  it('control: all four were read and are real components', () => {
    for (const [name, src] of files) {
      expect(src.length, `${name} came back empty`).toBeGreaterThan(4000);
    }
  });

  it('each imports the shared module', () => {
    for (const [name, src] of files) {
      expect(src, `${name} does not read the shared viewer module`)
        .toContain("from '@/lib/viewers/viewer-fit'");
    }
  });

  it('keeps the users zoom across a page change, re-fitting only when at fit', () => {
    // Owner: full-size on open, but once zoomed in, next/previous page keeps that zoom; zoom only
    // changes on a manual zoom. So the page-change handler re-fits ONLY when currently at fit.
    const fit = 0.4;
    expect(shouldRefitOnPageChange(fit, fit)).toBe(true);   // viewing the whole page → re-fit next page
    expect(shouldRefitOnPageChange(2, fit)).toBe(false);    // zoomed in → keep the zoom
    expect(shouldRefitOnPageChange(1, fit)).toBe(false);    // 100% while fit is 0.4 → still a manual zoom
    expect(shouldRefitOnPageChange(fit + 0.0005, fit)).toBe(true); // within tolerance → still at fit
  });

  it('SourceDocumentViewer uses the shared rule for page-change zoom persistence', () => {
    const src = read('app/admin/research/components/SourceDocumentViewer.tsx');
    expect(src).toContain('shouldRefitOnPageChange(zoom, fitZoom)');
  });

  it('none of them re-derives a quarter turn by hand', () => {
    // `(d + 90) % 360` was the whole rotation model in two of these, and it is the half that is
    // easy — the half that is wrong is what the page then has to be scaled to.
    for (const [name, src] of files) {
      expect(stripJs(src), `${name} still computes its own quarter turn`)
        .not.toMatch(/\+ 90\) % 360/);
    }
  });
});
