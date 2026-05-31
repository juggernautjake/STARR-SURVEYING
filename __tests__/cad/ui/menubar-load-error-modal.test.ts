// __tests__/cad/ui/menubar-load-error-modal.test.ts
//
// cad-trv-import-display Slice 2 — copyable file-load error modal.
// MenuBar is too large to mount under jsdom; source-text asserts
// lock the contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MenuBar — file-load error modal', () => {
  it('declares a loadError state slot typed as FileLoadDiagnostic | null', () => {
    expect(SRC).toMatch(/useState<FileLoadDiagnostic \| null>\(null\)/);
  });

  it('every diagnostic alert was replaced with setLoadError(diag)', () => {
    expect(SRC).not.toMatch(/alert\(formatFileLoadDiagnostic\(diag\)\);/);
    const setLoadErrorMatches = SRC.match(/setLoadError\(diag\);/g) ?? [];
    expect(setLoadErrorMatches.length).toBeGreaterThanOrEqual(4);
  });

  it('renders a modal with the diagnostic textarea + copy button when loadError is set', () => {
    expect(SRC).toMatch(/data-testid="file-load-error-modal"/);
    expect(SRC).toMatch(/data-testid="file-load-error-textarea"/);
    expect(SRC).toMatch(/data-testid="file-load-error-copy"/);
  });

  it('the textarea is readOnly + auto-selects on focus (for OS-level copy)', () => {
    // The textarea block contains both `readOnly` and the test id.
    expect(SRC).toMatch(/<textarea[\s\S]*?readOnly[\s\S]*?data-testid="file-load-error-textarea"/);
    expect(SRC).toMatch(/onFocus=\{[\s\S]*?\.select\(\)/);
  });

  it('Copy button calls navigator.clipboard.writeText with the formatted diagnostic', () => {
    expect(SRC).toMatch(/navigator\.clipboard\.writeText\(formatFileLoadDiagnostic\(loadError\)\)/);
  });

  it('shows a transient "Copied!" confirmation after a successful copy', () => {
    expect(SRC).toMatch(/loadErrorCopied \? 'Copied!' : 'Copy to clipboard'/);
  });

  it('clicking the backdrop OR the close button dismisses the modal', () => {
    // Backdrop onClick + at least one close button onClick both
    // call setLoadError(null).
    const setLoadErrorNull = (SRC.match(/setLoadError\(null\)/g) ?? []).length;
    expect(setLoadErrorNull).toBeGreaterThanOrEqual(3);
  });

  it('renders the format-specific hint as its own callout when present', () => {
    expect(SRC).toMatch(/loadError\.hint &&/);
    expect(SRC).toMatch(/font-semibold[^>]*>Hint:/);
  });
});
