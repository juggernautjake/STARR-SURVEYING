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
    expect(switcher).toContain("setTranspose({ system, phase: 'done' })");
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
