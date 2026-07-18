// __tests__/dnd/transpose-progress.test.ts — Area TR1. Transposing a character to another system shows an
// obvious progress state while the AI builds, then a clear completion notification. Source-anchors the
// lifecycle wiring + the animated progress bar CSS.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const switcher = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');

describe('transpose progress + completion UX (TR1)', () => {
  it('tracks a working → done lifecycle, only for a transpose (not an instant switch)', () => {
    expect(switcher).toMatch(/phase:\s*'working'\s*\|\s*'done'/);
    expect(switcher).toContain("setTranspose({ system, phase: 'working' })");
    expect(switcher).toMatch(/setTranspose\(\{ system, phase: 'done'/); // done + the AI summary/allowedCustom
    // an instant switch (already built) must NOT enter the transpose lifecycle
    expect(switcher).toContain('if (isTranspose) setTranspose(');
  });

  it('shows an animated progress bar + spinner while working', () => {
    expect(switcher).toContain("transpose?.phase === 'working'");
    expect(switcher).toContain('styles.transposeBar');
    expect(switcher).toContain('styles.spinner');
    // the CSS defines the indeterminate sweep
    expect(css).toContain('.transposeBar');
    expect(css).toMatch(/@keyframes transposeSweep/);
  });

  it('shows an obvious success notification with a dismiss on completion', () => {
    expect(switcher).toContain("transpose?.phase === 'done'");
    expect(switcher).toMatch(/✓ Transposed into/);
    expect(switcher).toMatch(/role="status"/);
  });
});

describe('custom-content consent before an AI transpose (TR2)', () => {
  it('asks for consent only for a transpose when custom is allowed; not for an instant switch', () => {
    // an already-built target switches immediately (no consent, no AI)
    expect(switcher).toContain('if (!isTranspose) { runChange(system, false); return; }');
    // a transpose with custom allowed opens the consent prompt first
    expect(switcher).toContain('if (allowCustom) { setConsent(system); return; }');
    // custom not allowed → best-effort vanilla-only transpose (still no invented content)
    expect(switcher).toContain('runChange(system, false); // custom not allowed');
  });

  it('the consent choice is passed to the route as allowCustom', () => {
    expect(switcher).toContain('runChange(consent, true)');   // Yes — allow custom
    expect(switcher).toContain('runChange(consent, false)');  // No — vanilla only
    expect(switcher).toContain('JSON.stringify({ system, allowCustom: useCustom })');
  });

  it('the prompt explains vanilla-first + balanced custom, with Cancel', () => {
    expect(switcher).toMatch(/allow custom content\?/i);
    expect(switcher).toMatch(/vanilla only/i);
    expect(switcher).toContain('setConsent(null)'); // Cancel
    expect(switcher).toMatch(/role="dialog"/);
  });
});
