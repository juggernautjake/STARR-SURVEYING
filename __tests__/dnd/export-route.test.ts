// __tests__/dnd/export-route.test.ts — the character export route + on-sheet button wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/export/route.ts'), 'utf8');
const button = readFileSync(join(process.cwd(), 'app/dnd/_ui/ExportSheetButton.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

describe('export route', () => {
  it('is read-gated the same as opening the sheet', () => {
    expect(route).toContain('getCharacterAccess(params.id)');
    expect(route).toContain('if (!res.access)');
  });
  it('serves JSON and HTML as downloads', () => {
    expect(route).toContain("filename=\"${base}.json\"");
    expect(route).toContain("filename=\"${base}.html\"");
    expect(route).toContain('application/json');
    expect(route).toContain('text/html');
  });
  it('inlines images so the HTML export is self-contained', () => {
    expect(route).toContain('inlineImage');
    expect(route).toContain('data:');
  });
});

describe('ExportSheetButton', () => {
  it('offers PDF (via print), HTML, and JSON', () => {
    expect(button).toContain('printPdf');
    expect(button).toContain("download('html')");
    expect(button).toContain("download('json')");
    expect(button).toContain('w.print()'); // PDF = browser print of the HTML export
  });
  it('is rendered on the sheet page', () => {
    expect(page).toContain('<ExportSheetButton characterId={character.id} />');
  });
});
