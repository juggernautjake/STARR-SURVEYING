/**
 * Tooltips go away the moment the pointer does (owner, 2026-09-15).
 *
 * "The tool tips, especially for the projects and jobs pages, kind of tend to linger … They should
 *  disappear as soon as the user removes the cursor from the element."
 *
 * Source pins on the shared Tooltip (app/admin/research/components/Tooltip.tsx), one per cause the
 * lingering had. The component is used by the job page, the Jobs tab, New Job and Import.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(process.cwd(), 'app/admin/research/components/Tooltip.tsx'), 'utf8').replace(/\r\n/g, '\n');
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

describe('the shared Tooltip', () => {
  it('never leaves an orphaned show timer: every show clears the pending one first', () => {
    const show = code.slice(code.indexOf('const show = useCallback('), code.indexOf('const onPointerEnter'));
    expect(show.indexOf('clearTimer();')).toBeGreaterThan(-1);
    expect(show.indexOf('clearTimer();')).toBeLessThan(show.indexOf('setTimeout('));
  });

  it('a mouse click does not re-open it: focus shows it only for keyboard focus', () => {
    expect(code).toContain("keyboard = t.matches(':focus-visible')");
    expect(code, 'plain onFocus={show} is back').not.toContain('onFocus={show}');
  });

  it('touch never opens a hover tooltip that has no leave to close it', () => {
    expect(code).toContain("if (e.pointerType === 'touch') return;");
  });

  it('while open, it checks the pointer against the trigger and closes on scroll, press, Escape, blur and a hidden tab', () => {
    expect(code).toContain("window.addEventListener('pointermove', onMove");
    expect(code).toContain('if (outside(e.clientX, e.clientY)) hide();');
    for (const ev of ["'pointerdown', hide, true", "'scroll', hide, true", "'blur', hide", "'visibilitychange', onVisibility"]) {
      expect(code).toContain(ev);
    }
    expect(code).toContain("if (e.key === 'Escape') hide();");
  });

  it('leaving the trigger hides it immediately, and only one is open at a time', () => {
    expect(code).toContain('onPointerLeave={hide}');
    expect(code).toContain('onMouseLeave={hide}');
    expect(code).toContain('if (closeOpenTooltip && closeOpenTooltip !== hide) closeOpenTooltip();');
  });
});

describe('the tooltip draws once, where it belongs (owner, 2026-09-15)', () => {
  // "It rendered in one location, and then immediately shifts to the left a bit." The fade-in
  // animated `transform`, which replaced the centring translate for the length of the animation.
  const css = fs.readFileSync(path.join(process.cwd(), 'app/admin/styles/AdminLayout.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.slice(css.indexOf('.research-tip {'), css.indexOf('}', css.indexOf('.research-tip {')));

  it('is positioned by transform and animated by opacity only — never both on transform', () => {
    expect(css).toContain('.research-tip--top    { transform: translate(-50%, -100%); }');
    expect(rule).toContain('animation: ui-fade-in');
    expect(css, 'the transform-animating keyframes are back').not.toContain('@keyframes research-tip-in');
    const fade = fs.readFileSync(path.join(process.cwd(), 'app/styles/motion.css'), 'utf8');
    expect(fade).toMatch(/@keyframes ui-fade-in\s*\{\s*from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  });

  it('any edge correction happens in a layout effect, before paint', () => {
    expect(code).toContain('useLayoutEffect(() => {');
    expect(code).toContain('tip.getBoundingClientRect()');
  });
});
