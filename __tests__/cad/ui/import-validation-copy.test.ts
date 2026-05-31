// __tests__/cad/ui/import-validation-copy.test.ts
//
// cad-import-validation-dedup-and-copy Slice 2 — Copy buttons +
// selectable text on the field-data import wizard's Validate
// step. ImportDialog is big enough that source-text asserts are
// the pragmatic lock.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'ImportDialog.tsx'),
  'utf8',
);

describe('ImportDialog ValidationStep — Copy buttons', () => {
  it('imports the Copy icon from lucide-react', () => {
    expect(SRC).toMatch(/^\s*Copy,\s*$/m);
  });

  it('top-level "Copy all" button covers EVERY issue across severities', () => {
    expect(SRC).toMatch(/testId="import-validation-copy-all"/);
    expect(SRC).toMatch(/Copy all \(\$\{validationIssues\.length\}\)/);
    // Builds the clipboard text with severity prefix per line.
    expect(SRC).toMatch(/validationIssues\.map\(\(i\) => `\[\$\{i\.severity\}\] \$\{i\.message\}`\)/);
  });

  it('each severity group has its own Copy button with the right testId', () => {
    expect(SRC).toMatch(/testId=\{`import-validation-copy-\$\{group\.severity\}`\}/);
  });

  it('the Copy handler calls navigator.clipboard.writeText + flashes "Copied!"', () => {
    expect(SRC).toMatch(/navigator\.clipboard\.writeText\(text\)/);
    expect(SRC).toMatch(/copied \? 'Copied!' : label/);
    expect(SRC).toMatch(/setTimeout\(\(\) => setCopied\(false\), 2000\)/);
  });

  it('fallback when clipboard API is unavailable uses document.execCommand("copy")', () => {
    expect(SRC).toMatch(/document\.execCommand\('copy'\)/);
  });

  it('Copy button disables when there are zero messages', () => {
    expect(SRC).toMatch(/disabled=\{messages\.length === 0\}/);
  });
});

describe('ImportDialog ValidationStep — issue rows are user-selectable', () => {
  it('each issue row carries user-select: text styling for highlight-copy', () => {
    expect(SRC).toMatch(/select-text cursor-text/);
    expect(SRC).toMatch(/userSelect: 'text'/);
  });

  it('the "…and N more" hint tells the user to use Copy to see them all', () => {
    expect(SRC).toMatch(/use Copy to see them all/);
  });
});

describe('ImportDialog ValidationStep — Copy returns the FULL list (not just the rendered 20)', () => {
  it('the per-group Copy button maps over group.items (not the first-20 slice)', () => {
    // The CopyIssuesButton receives `group.items.map((i) => i.message)`
    // which is the full list. The render slice is .slice(0, RENDER_LIMIT)
    // and that slice is NOT what's handed to the copy handler.
    expect(SRC).toMatch(/messages=\{group\.items\.map\(\(i\) => i\.message\)\}/);
    expect(SRC).toMatch(/group\.items\.slice\(0, RENDER_LIMIT\)/);
  });
});
