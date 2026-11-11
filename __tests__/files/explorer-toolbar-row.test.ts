// The FolderExplorer's one toolbar row (owner, 2026-11-11): "move the viewing options and the
// download button and the open files and the upload files and the new folder buttons down on the
// same row as the select all button."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'app/admin/components/files/FolderExplorer.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/admin/components/files/FolderExplorer.css'), 'utf8');

describe('FolderExplorer toolbar', () => {
  const start = src.indexOf('data-testid="fe-toolbar"');
  const end = src.indexOf('{error && <div className="fe__error"', start);
  const bar = src.slice(start, end);

  it('holds Select all, the view options, download, Open in Files, New folder and Upload in one row', () => {
    expect(start).toBeGreaterThan(0);
    for (const needle of ['<SelectAllCheckbox', 'aria-label="Sort by"', 'aria-label="Preview size"', '<DownloadAllButton', 'data-testid="fe-open-in-files"', 'data-testid="fe-new-folder"', 'data-testid="fe-upload"', 'data-testid="fe-scan"']) {
      expect(bar, needle).toContain(needle);
    }
  });

  it('has no separate upload card and no second Select all', () => {
    expect(src).not.toContain('fe__cta');
    expect(src.match(/<SelectAllCheckbox/g)?.length).toBe(1);
  });

  it('Photos & videos does not repeat its title — the hub already shows it', () => {
    expect(src).not.toContain('fe__media-title');
    expect(src).toMatch(/\{!media && \(\s*<header className="fe__head">/);
  });

  it('styles the row', () => {
    for (const cls of ['.fe__bar {', '.fe__bar-group', '.fe__bar-add']) expect(css).toContain(cls);
  });
});
