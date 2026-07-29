// __tests__/dnd/map-studio-pointer.test.ts — the map studio on a touchscreen (P10-1, audit G-1).
//
// 18 mouse handlers, zero touch or pointer handlers, zero media queries across 2,800 lines — so the DM's
// only map tool was unusable on the tablet a DM is most likely to have at the table, while the player
// console it embeds *does* handle touch.
//
// It is a static vanilla HTML file, so there is no component to render and these are source assertions.
// They are worth having anyway: the failure mode of a half-done Pointer Events conversion is a page that
// works perfectly on the desktop it was written on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
/** Comments quote the old handler names while explaining them; assertions about CODE must not see those. */
const code = html.replace(/\/\*[\s\S]*?\*\//g, '');

const count = (needle: string) => (code.match(new RegExp(needle, 'g')) ?? []).length;

describe('the conversion is COMPLETE, which is the only way it works', () => {
  it('no mouse drag handler survives', () => {
    // A partial conversion is worse than none: browsers fire compatibility mouse events after touch ones,
    // so a leftover mousedown beside a pointerdown double-fires every tap on a touchscreen.
    expect(count('addEventListener\\("mousedown"')).toBe(0);
    expect(count('addEventListener\\("mousemove"')).toBe(0);
    expect(count('addEventListener\\("mouseup"')).toBe(0);
    expect(count('removeEventListener\\("mousemove"')).toBe(0);
  });

  it('and they all came back as pointer handlers', () => {
    expect(count('addEventListener\\("pointerdown"')).toBe(13);
    expect(count('addEventListener\\("pointermove"')).toBeGreaterThanOrEqual(2);
    expect(count('addEventListener\\("pointerup"')).toBeGreaterThanOrEqual(2);
  });

  it('POINTERCANCEL IS HANDLED — the bug the conversion would otherwise introduce', () => {
    // It has no mouse equivalent, and it fires INSTEAD OF pointerup when the system takes the gesture
    // (an incoming call, a swipe-back, palm rejection). Without it `drag` stays set forever and the next
    // finger anywhere on the page keeps dragging whatever was last grabbed — a bug that cannot happen
    // with a mouse and so cannot be found on the machine this was written on.
    expect(count('addEventListener\\("pointercancel"')).toBeGreaterThanOrEqual(2);
    // Both the shape drag and the canvas pan need it — they are separate state.
    expect(code).toContain('window.addEventListener("pointercancel",endDrag)');
    expect(code).toContain('window.addEventListener("pointercancel",endPan)');
  });

  it('hover-only handlers are left alone, because hover is not a drag', () => {
    // `onmouseenter`/`onmouseleave` for a button's border colour are correct as they are; converting them
    // would be churn, and on touch they simply never fire, which is the right behaviour.
    expect(html).toContain('onmouseenter');
  });
});

describe('touch-action is what makes any of it work', () => {
  it('the canvas hands its gestures to the page', () => {
    // Without this the browser claims a one-finger drag for scrolling BEFORE the page sees a pointermove,
    // so panning the map scrolls the page instead. It has to be CSS: the browser decides at hit-test
    // time, before any listener runs.
    expect(code).toMatch(/#canvas\{[^}]*touch-action:\s*none/);
  });

  it('and so do the draggable things on it', () => {
    expect(code).toMatch(/\.inst,\.asset,\.hit,\.ihandle\{touch-action:\s*none/);
  });
});

describe('it fits on a screen someone actually brings to a table', () => {
  it('has media queries at all — it had ZERO', () => {
    expect(count('@media')).toBeGreaterThanOrEqual(2);
    expect(code).toContain('@media (max-width: 900px)');
    expect(code).toContain('@media (max-width: 560px)');
  });

  it('the tab rail goes horizontal and the library becomes an overlay', () => {
    // 76px of rail plus 304px of library out of a 768px tablet left the map — the entire point of the
    // page — with what was left.
    expect(code).toMatch(/@media \(max-width: 900px\)[\s\S]{0,1200}\.tabrail \{[^}]*flex-direction: row/);
    expect(code).toMatch(/@media \(max-width: 900px\)[\s\S]{0,1600}\.library \{[^}]*position: absolute/);
  });

  it('and .main is positioned, or the overlay would anchor to the viewport', () => {
    // Load-bearing and easy to lose: without a positioned ancestor the absolute library sits over the
    // toolbar instead of over the canvas.
    expect(code).toMatch(/@media \(max-width: 900px\)[\s\S]{0,300}\.main \{[^}]*position: relative/);
  });

  it('the rail keeps its own scrolling gesture', () => {
    // `touch-action: none` on the rail would make it unscrollable — the one place a touch gesture SHOULD
    // belong to the browser.
    expect(code).toMatch(/\.tabrail \{[\s\S]{0,400}touch-action: pan-x/);
  });

  it('and the viewport meta is present, or none of the breakpoints apply', () => {
    expect(html).toMatch(/<meta name="viewport"[^>]*width=device-width/);
  });
});

describe('what this slice did NOT do, recorded rather than implied', () => {
  it('pinch-zoom is still not implemented — zoom is the buttons', () => {
    // `wheel` is mouse and trackpad only, so a touch user zooms with the on-screen controls. Two-pointer
    // pinch tracking is a real feature, not a mechanical conversion, and half-building it would leave a
    // gesture that fights the pan handler. The buttons exist, so zoom is reachable.
    expect(code).toContain('"#zIn"');
    expect(code).toContain('"#zOut"');
    expect(code).toContain('"#zFit"');
    expect(count('touchstart')).toBe(0);
  });
});
