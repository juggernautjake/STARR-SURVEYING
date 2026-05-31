// __tests__/cad/ui/multi-error-modal.test.ts
//
// cad-multi-error-report-modal Slice 1 — global multi-entry
// error modal. Source-text asserts since the modal is rendered
// from a zustand store + clipboard APIs that jsdom can't fully
// emulate.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MultiErrorModal.tsx'),
  'utf8',
);

const CAD_LAYOUT = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'CADLayout.tsx'),
  'utf8',
);

const MENU_BAR = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MultiErrorModal — surface contract', () => {
  it('reads the store via useErrorReportStore selectors', () => {
    expect(SRC).toMatch(/useErrorReportStore\(\(s\) => s\.open\)/);
    expect(SRC).toMatch(/useErrorReportStore\(\(s\) => s\.entries\)/);
  });

  it('renders nothing when open === false (early-return null)', () => {
    expect(SRC).toMatch(/if \(!open\) return null;/);
  });

  it('has a testid that other code can target', () => {
    expect(SRC).toMatch(/data-testid="multi-error-modal"/);
  });

  it('renders a "Copy all" button + a "Clear all" button', () => {
    expect(SRC).toMatch(/data-testid="multi-error-copy-all"/);
    expect(SRC).toMatch(/data-testid="multi-error-clear-all"/);
  });

  it('Copy-all writes the formatted entry list to the clipboard', () => {
    expect(SRC).toMatch(/copyText\(formatEntries\(entries\)\)/);
    expect(SRC).toMatch(/navigator\.clipboard\.writeText\(text\)/);
  });

  it('Copy uses a document.execCommand fallback when clipboard API is unavailable', () => {
    expect(SRC).toMatch(/document\.execCommand\('copy'\)/);
  });

  it('each entry row is collapsible with a chevron toggle', () => {
    expect(SRC).toMatch(/setExpanded\(\(e\) => !e\)/);
    expect(SRC).toMatch(/<ChevronDown size=\{14\} \/>/);
    expect(SRC).toMatch(/<ChevronRight size=\{14\} \/>/);
  });

  it('per-entry Copy + Dismiss buttons carry per-id testids', () => {
    expect(SRC).toMatch(/data-testid=\{`multi-error-entry-copy-\$\{entry\.id\}`\}/);
    expect(SRC).toMatch(/data-testid=\{`multi-error-entry-dismiss-\$\{entry\.id\}`\}/);
  });

  it('expanded body renders in a readOnly <textarea> + auto-selects on focus', () => {
    expect(SRC).toMatch(/<textarea\s+readOnly[\s\S]{0,500}data-testid=\{`multi-error-entry-textarea-\$\{entry\.id\}`\}/);
    expect(SRC).toMatch(/onFocus=\{\(e\) => e\.currentTarget\.select\(\)\}/);
  });

  it('entry title is user-select: text so highlight-copy also works', () => {
    expect(SRC).toMatch(/select-text cursor-text/);
    expect(SRC).toMatch(/userSelect: 'text'/);
  });

  it('severity icon switches between ERROR / WARNING / INFO', () => {
    expect(SRC).toMatch(/case 'ERROR':[\s\S]{0,200}AlertCircle/);
    expect(SRC).toMatch(/case 'WARNING':[\s\S]{0,200}AlertTriangle/);
    expect(SRC).toMatch(/Info size=\{14\}/);
  });
});

describe('CADLayout — MultiErrorModal mounted at the root', () => {
  it('imports MultiErrorModal', () => {
    expect(CAD_LAYOUT).toMatch(/import MultiErrorModal from '\.\/components\/MultiErrorModal';/);
  });
  it('renders <MultiErrorModal />', () => {
    expect(CAD_LAYOUT).toMatch(/<MultiErrorModal \/>/);
  });
});

describe('MenuBar — file-load errors push through useErrorReportStore', () => {
  it('imports reportFileLoadError from @/lib/cad/io/error-report', () => {
    expect(MENU_BAR).toMatch(/import \{ reportFileLoadError \} from '@\/lib\/cad\/io\/error-report';/);
  });

  it('every alert / inline setLoadError call site is replaced with reportFileLoadError(diag)', () => {
    expect(MENU_BAR).not.toMatch(/setLoadError\(diag\)/);
    expect(MENU_BAR).not.toMatch(/file-load-error-modal/);
    const calls = MENU_BAR.match(/reportFileLoadError\(diag\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});
