// __tests__/dnd/floating-roller-mounted.test.ts — the roller stays MOUNTED when minimized.
//
// The bug: when minimized, FloatingRoller early-returned only the dice button and UNMOUNTED its children —
// so the roller's stages weren't mounted, and a roll made while minimized couldn't fire the stage's
// expand-on-roll (the roller never popped open). The fix keeps the window mounted (just hidden), so click-to-
// roll opens it on every template + system.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/FloatingRoller.tsx'), 'utf8');

describe('FloatingRoller keeps the roller mounted when minimized', () => {
  it('does not early-return only the button when minimized', () => {
    // The old code returned inside `if (dock.minimized) { return (...) }`. That branch must be gone.
    expect(src).not.toMatch(/if \(dock\.minimized\)\s*\{\s*return/);
  });

  it('renders the window always, hiding it (display:none) when minimized — children stay mounted', () => {
    expect(src).toMatch(/dock\.minimized \? \{ \.\.\.dock\.style, display: 'none' \}/);
    expect(src).toContain('<div className="fld-body">{children}</div>');
  });

  it('still shows the minimized dice FAB', () => {
    expect(src).toMatch(/dock\.minimized &&/);
    expect(src).toContain('fld-fab');
  });
});
