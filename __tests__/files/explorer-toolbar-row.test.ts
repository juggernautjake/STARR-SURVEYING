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
    expect(src).not.toContain('<header className="fe__head">');
  });

  it('is two rows: where you are + adding, then how you look at the list', () => {
    const rows = bar.split('<div className="fe__bar-row">');
    expect(rows.length).toBe(3);
    expect(rows[1]).toContain('data-testid="fe-upload"');
    expect(rows[1]).toContain('data-testid="fe-new-folder"');
    expect(rows[1]).toContain('data-testid="fe-open-in-files"');
    expect(rows[2]).toContain('<SelectAllCheckbox');
    expect(rows[2]).toContain('aria-label="Sort by"');
    expect(rows[2]).toContain('aria-label="Preview size"');
    expect(rows[2]).toContain('<DownloadAllButton');
  });

  it('Photos | Videos: both on by default, never both off', () => {
    expect(src).toContain("useState<{ image: boolean; video: boolean }>({ image: true, video: true })");
    expect(src).toContain('return next.image || next.video ? next : prev;');
    expect(bar).toContain('data-testid={`fe-kind-${k}`}');
  });

  it('Photos & videos folders: made by people, nested, hidden when they hold none of the shown kinds', () => {
    expect(src).toContain('isNamed(f.id) && mediaParentOf(f) === current.id');
    expect(src).toContain('.filter(({ count, total }) => count > 0 || (!q && kinds.image && kinds.video && total === 0))');
    expect(src).toContain('data-testid="fe-media-folder"');
  });

  it('styles the row', () => {
    for (const cls of ['.fe__bar {', '.fe__bar-row', '.fe__bar-group', '.fe__bar-add', '.fe__kinds']) expect(css).toContain(cls);
  });
});
