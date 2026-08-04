// __tests__/calendar/p4-cheat-sheet.test.ts
//
// calendar-polish Slice P4 — keyboard shortcuts cheat sheet modal.
// Locks the page wiring (state, button, keydown extension, click-
// outside) + the CSS modal contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — P4 cheat-sheet wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('declares showCheatSheet state', () => {
    expect(SRC).toMatch(/const \[showCheatSheet, setShowCheatSheet\] = useState<boolean>\(false\)/);
  });

  it('? key toggles the cheat sheet', () => {
    expect(SRC).toMatch(/case '\?': setShowCheatSheet\(\(v\) => !v\); e\.preventDefault\(\); break;/);
  });

  it('Esc closes the cheat sheet when it is open', () => {
    expect(SRC).toMatch(/case 'Escape':[\s\S]*?if \(showCheatSheet\) \{ setShowCheatSheet\(false\)/);
  });

  it('keydown effect depends on showCheatSheet for the Esc branch to read fresh state', () => {
    expect(SRC).toMatch(/\[goPrev, goNext, goToday, toggleFullscreen, setView, showCheatSheet\]/);
  });

  it('renders a ? button in the nav row with proper ARIA', () => {
    expect(SRC).toMatch(/data-action="toggle-cheat-sheet"/);
    expect(SRC).toMatch(/aria-label="Keyboard shortcuts"/);
    expect(SRC).toMatch(/aria-haspopup="dialog"/);
    expect(SRC).toMatch(/aria-expanded=\{showCheatSheet\}/);
  });

  it('renders the dialog with role + aria-modal + aria-label when open', () => {
    expect(SRC).toMatch(/\{showCheatSheet && \(/);
    expect(SRC).toMatch(/data-testid="calendar-cheat-sheet"/);
    expect(SRC).toMatch(/role="dialog"/);
    expect(SRC).toMatch(/aria-modal="true"/);
  });

  it('click-outside closes only when the click target IS the backdrop', () => {
    expect(SRC).toMatch(/if \(e\.target === e\.currentTarget\) setShowCheatSheet\(false\);/);
  });

  it('lists every shortcut the calendar wires (← → t m w d f ? esc)', () => {
    expect(SRC).toMatch(/<kbd>←<\/kbd>/);
    expect(SRC).toMatch(/<kbd>→<\/kbd>/);
    expect(SRC).toMatch(/<kbd>T<\/kbd>/);
    expect(SRC).toMatch(/<kbd>M<\/kbd>/);
    expect(SRC).toMatch(/<kbd>W<\/kbd>/);
    expect(SRC).toMatch(/<kbd>D<\/kbd>/);
    expect(SRC).toMatch(/<kbd>F<\/kbd>/);
    expect(SRC).toMatch(/<kbd>\?<\/kbd>/);
    expect(SRC).toMatch(/<kbd>Esc<\/kbd>/);
  });

  it('the prev/next caption mirrors the active view via navLabel', () => {
    expect(SRC).toMatch(/Previous \/ next \{navLabel\}/);
  });

  it('close button uses data-action so e2e tests can target it', () => {
    expect(SRC).toMatch(/data-action="close-cheat-sheet"/);
  });

  it('foot disclaimer notes the input-field skip behaviour', () => {
    expect(SRC).toMatch(/Shortcuts are ignored while typing in a text field/);
  });
});

describe('Calendar.css — P4 modal styling', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('backdrop is fixed-inset with a tinted overlay + flex centering', () => {
    expect(CSS).toMatch(
      /\.calendar-page__cheat-sheet-backdrop \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/,
    );
  });

  it('inner panel has a card surface + max-height + brand-aware shadow', () => {
    expect(CSS).toMatch(
      /\.calendar-page__cheat-sheet \{[\s\S]*?background: var\(--color-bg-card\);[\s\S]*?max-height: 80vh;[\s\S]*?box-shadow:/,
    );
  });

  it('shortcut rows use a 2-col grid (kbd column + description column)', () => {
    expect(CSS).toMatch(
      /\.calendar-page__cheat-sheet-list \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: max-content 1fr;/,
    );
  });

  it('<kbd> chip uses mono font + subtle border for the keycap look', () => {
    expect(CSS).toMatch(
      // The border is now `var(--theme-border, #E5E7EB)` — themed, with the original literal as its
      // fallback, so the default look is byte-identical and a dark palette does not leave a
      // light-grey keycap edge glowing on a dark modal. The literal is still required to be present
      // as the fallback, which is what keeps this assertion about the *appearance* rather than
      // merely about a variable existing.
      //
      // NOTE the contrast with the print block in the same stylesheet, reverted in the same pass:
      // paper is deliberately NOT themed, because a dark palette would print a black page. "Follows
      // the theme" is right for a keycap and wrong for a printout, and the difference is not
      // something a find-and-replace can know.
      /\.calendar-page__cheat-sheet-list kbd \{[\s\S]*?font-family: var\(--font-mono\);[\s\S]*?border: 1px solid var\(--theme-border, #E5E7EB\);/,
    );
  });

  it('declares fade-in + pop-in keyframes named so DevTools introspection works', () => {
    expect(CSS).toMatch(/@keyframes calendar-cheat-fade-in \{/);
    expect(CSS).toMatch(/@keyframes calendar-cheat-pop-in \{/);
  });

  it('reduced-motion disables both modal animations', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?calendar-page__cheat-sheet-backdrop,[\s\S]*?animation: none/,
    );
  });

  it('still uses canonical tokens (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).toMatch(/var\(--color-bg-subtle\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
