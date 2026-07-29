// __tests__/dnd/sheet-print-css.test.ts — Ctrl-P on a live sheet (P10-3).
//
// The HTML export has carried print CSS since it was built, so "Save as PDF" from the EXPORT works. Ctrl-P
// on the sheet you are actually looking at did not: a near-black page with the site header, the footer,
// the floating dice dock and every button on it, cut arbitrarily across panels.
//
// CSS cannot be unit-tested for appearance, so these assert the DECISIONS instead — the handful of choices
// a future edit could reverse without anyone noticing until they printed something.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const css = read('app/dnd/_sheet/styles/print.css');
/**
 * The stylesheet with its comments removed.
 *
 * Every "this must NOT be present" assertion runs against this rather than the raw file, because the
 * comments quote the very patterns they exist to argue against — `color: #000` and `header, footer {` both
 * appear in prose explaining why neither is used. Asserting against a file's own explanation of itself is
 * a mistake this repo has now made four times; the fix is to assert against the CODE.
 */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('it costs the screen nothing', () => {
  it('every rule is inside @media print', () => {
    // A stray rule outside the block would restyle the live sheet, and a print stylesheet that changes
    // what you see is the one kind of bug nobody thinks to look for here.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const openIndex = withoutComments.indexOf('@media print {');
    expect(openIndex).toBeGreaterThan(-1);
    const before = withoutComments.slice(0, openIndex);
    expect(before.trim(), 'nothing may precede the @media print block').toBe('');
    // Braces balance to zero exactly once, at the end — i.e. there is one top-level block.
    let depth = 0;
    let closedAt = -1;
    for (let i = openIndex; i < withoutComments.length; i++) {
      const ch = withoutComments[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { closedAt = i; break; }
      }
    }
    expect(withoutComments.slice(closedAt + 1).trim(), 'nothing may follow the @media print block').toBe('');
  });
});

describe('ink', () => {
  it('overrides the TOKENS, not the rules', () => {
    // The palette comes from `--void`/`--panel`/`--ink` with hundreds of consumers, including inline
    // `style={{ color: 'var(--muted)' }}` objects that no selector could reach. Overriding the variables
    // is the only thing that hits all of them.
    for (const token of ['--void:', '--panel:', '--ink:', '--muted:', '--line:']) {
      expect(css, token).toContain(token);
    }
    expect(css).toMatch(/--ink:\s*#000/);
    expect(css).toMatch(/--void:\s*#fff/i);
  });

  it('clears backgrounds without flattening every colour to black', () => {
    // `color: #000 !important` on `*` would erase deliberate emphasis — a refused pick's red, a warning's
    // amber — and those distinctions are exactly what a printed sheet is for.
    expect(css).toContain('background-color: transparent !important');
    expect(rules).not.toMatch(/\.dnd-sheet \*\s*\{[^}]*\bcolor:\s*#000/);
  });

  it('and keeps borders, which carry the structure once the fills are gone', () => {
    expect(css).toMatch(/border-color:\s*#999/);
  });
});

describe('chrome', () => {
  it('hides the site header, footer and the floating roller dock', () => {
    expect(css).toContain("header[class*='siteHeader']");
    expect(css).toContain("footer[class*='siteFooter']");
    expect(css).toContain('.fld,');
  });

  it('named individually rather than by a blanket header/footer rule', () => {
    // `header, footer { display: none }` would also eat a panel's own header — and a sheet that prints
    // its sections unlabelled is worse than one that prints the site chrome.
    expect(rules).not.toMatch(/^\s*header,\s*$/m);
    expect(rules).not.toMatch(/\bheader\s*,\s*footer\s*\{/);
  });

  it('and offers an opt-out hook for anything else', () => {
    expect(css).toContain("[data-print='hide']");
  });
});

describe('controls', () => {
  it('buttons go, inputs stay', () => {
    // An input's VALUE is the character's data. A printed sheet with blank HP is not a sheet.
    expect(css).toMatch(/\.dnd-sheet button[\s\S]{0,200}display:\s*none/);
    expect(rules).not.toMatch(/\.dnd-sheet input[\s\S]{0,80}display:\s*none/);
    expect(css).toMatch(/\.dnd-sheet input[\s\S]{0,400}color:\s*#000/);
  });

  it('and an input that scrolls is expanded, so its value is not cut off', () => {
    expect(css).toMatch(/\.dnd-sheet input[\s\S]{0,500}overflow:\s*visible/);
  });
});

describe('page breaks', () => {
  it('sets BOTH the modern and the legacy property', () => {
    // Getting this wrong costs a reprint rather than a repaint, so it is worth the duplication.
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('page-break-inside: avoid');
    expect(css).toContain('break-after: avoid');
    expect(css).toContain('page-break-after: avoid');
  });

  it('and guards orphans and widows', () => {
    expect(css).toContain('orphans: 3');
    expect(css).toContain('widows: 3');
  });
});

describe('the failures that print a page which LOOKS complete', () => {
  it('a scrolling region is expanded, not printed one screenful deep', () => {
    // The worst failure available here: `max-height` + `overflow: auto` prints exactly one screenful and
    // silently drops the rest, and the printout gives no sign anything is missing.
    expect(css).toMatch(/max-height:\s*none\s*!important/);
    expect(css).toMatch(/overflow:\s*visible\s*!important/);
  });

  it('sticky and fixed elements are made static', () => {
    // Otherwise they print on every page, or land in the middle of one.
    expect(css).toContain("position: static !important");
    expect(css).toMatch(/position:\s*sticky/);
    expect(css).toMatch(/position:\s*fixed/);
  });

  it('and animations are stopped, so nothing prints mid-transform', () => {
    expect(css).toMatch(/animation:\s*none\s*!important/);
    expect(css).toMatch(/transition:\s*none\s*!important/);
  });
});

describe('IT IS IMPORTED BY EVERY SHELL — three of them, and they do not share an entry point', () => {
  it('the main sheet App', () => {
    expect(read('app/dnd/_sheet/App.tsx')).toContain("import './styles/print.css'");
  });

  it('and both bespoke shells, which do not go through it', () => {
    // The same reason theme.css itself is imported three times. A print stylesheet that reaches only the
    // 5e sheet would be discovered by a Pathfinder player at a table, holding a black page.
    for (const f of ['app/dnd/_ui/PF2Sheet.tsx', 'app/dnd/_ui/IGSheet.tsx']) {
      expect(read(f), f).toContain("@/app/dnd/_sheet/styles/print.css");
    }
  });

  it('and every shell that imports the theme also imports the print rules', () => {
    // Derived rather than listed: if a fourth shell appears and pulls in theme.css or codex.css, it needs
    // these too, and this fails until it has them.
    const shells = [
      'app/dnd/_sheet/App.tsx',
      'app/dnd/_ui/PF2Sheet.tsx',
      'app/dnd/_ui/IGSheet.tsx',
      'app/dnd/_ui/StreamWatchClient.tsx',
    ];
    for (const f of shells) {
      const src = read(f);
      if (/styles\/(theme|codex)\.css/.test(src)) {
        // StreamWatchClient is the viewer overlay, not a printable sheet — recorded here so the
        // exception is visible rather than inferred from its absence.
        if (f.includes('StreamWatchClient')) continue;
        expect(src, `${f} imports the sheet theme but not the print rules`).toMatch(/styles\/print\.css/);
      }
    }
  });
});
