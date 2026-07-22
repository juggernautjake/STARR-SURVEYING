// __tests__/dnd/mobile-table-overflow.test.ts — MOB invariant (owner-reported: "many elements don't work on
// phones"). A raw <table> is the classic cause of page-level horizontal scroll on a phone: it forces its
// natural width and drags the whole page sideways. Every table on a D&D surface must therefore sit inside an
// overflow-x scroll container so it scrolls WITHIN its card, never the page. This guard reconstructs that
// contract from source so a future edit can't reintroduce the bug (it was verified fixed across these files;
// this keeps it fixed).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// Every source that renders a <table> on a sheet/library surface.
const TABLE_FILES = [
  'app/dnd/_sheet/components/Attacks.tsx',
  'app/dnd/_sheet/components/Progression.tsx',
  'app/dnd/_sheet/components/InteractiveSheet.tsx',
  'app/dnd/library/[key]/page.tsx',
  // The IG combat attacks <table> moved into the IG panel set (useIgPanels, T-6a); the Classic shell
  // (IGSheet) is now thin and renders no table of its own.
  'app/dnd/_ui/ig/useIgPanels.tsx',
];

/** The overflow context that must appear just above a <table>: either the shared `.table-wrap` class (whose CSS
 *  sets overflow-x: auto) or an inline overflowX style. */
const WRAP_RE = /table-wrap|overflowX\s*:\s*['"]?auto|overflow-x/;

describe('mobile: every sheet/library table scrolls within its own container', () => {
  for (const file of TABLE_FILES) {
    it(`${file} wraps each <table> in an overflow-x container`, () => {
      const src = read(file);
      const lines = src.split(/\r?\n/);
      const tableLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => /<table[\s>]/.test(l));
      expect(tableLines.length).toBeGreaterThan(0); // guard the guard — the file really renders a table
      for (const { i } of tableLines) {
        // The wrapper opens on one of the few lines immediately above the <table>.
        const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
        expect(WRAP_RE.test(window), `<table> near line ${i + 1} of ${file} needs an overflow-x wrapper`).toBe(true);
      }
    });
  }

  it('the shared .table-wrap class actually sets overflow-x: auto', () => {
    const css = read('app/dnd/_sheet/styles/theme.css');
    // The rule and its overflow-x live together in the .table-wrap block.
    expect(css).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  });
});
