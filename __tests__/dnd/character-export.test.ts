// __tests__/dnd/character-export.test.ts — the full character export (JSON + self-contained HTML).
import { describe, it, expect } from 'vitest';
import { characterToJson, characterToHtml, renderValue, humanizeKey, exportFileBase, type CharacterExport } from '@/lib/dnd/export/character-export';

const sample: CharacterExport = {
  name: 'Lazzuh Gun',
  system: 'dnd5e-2024',
  sheet_type: 'lazzuh',
  bio: { backstory: 'Born under a neon sky.', ideals: '' },
  data: {
    meta: { level: 5, class: 'Gunslinger' },
    abilities: { str: 10, dex: 18, con: 14 },
    inventory: [{ name: 'Neon Pistol', qty: 2 }, { name: 'Med-kit', qty: 1 }],
    feats: ['Sharpshooter', 'Alert'],
    notes: '',
    empties: { blank: '', arr: [] },
  },
  updatedAt: '2026-07-18',
};

describe('humanizeKey', () => {
  it('turns camel/snake keys into headings', () => {
    expect(humanizeKey('currentHp')).toBe('Current Hp');
    expect(humanizeKey('save_dc')).toBe('Save Dc');
  });
});

describe('characterToJson', () => {
  it('is loss-less pretty JSON with the whole record', () => {
    const json = JSON.parse(characterToJson(sample));
    expect(json.name).toBe('Lazzuh Gun');
    expect(json.data.abilities.dex).toBe(18);
    expect(json.bio.backstory).toContain('neon');
  });
});

describe('renderValue', () => {
  it('renders an array of objects as a table with the union of keys', () => {
    const html = renderValue([{ name: 'A', qty: 1 }, { name: 'B', note: 'x' }]);
    expect(html).toContain('<table');
    expect(html).toContain('Name');
    expect(html).toContain('Qty');
    expect(html).toContain('Note');
  });
  it('renders a primitive array as a comma list and an object as a definition list', () => {
    expect(renderValue(['a', 'b', 'c'])).toBe('a, b, c');
    expect(renderValue({ x: 1 })).toContain('<dl>');
  });
  it('escapes HTML so injected markup cannot break the document', () => {
    expect(renderValue('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('characterToHtml', () => {
  const html = characterToHtml(sample);
  it('is a self-contained document with inline styles and a print stylesheet', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<style>');
    expect(html).toContain('@media print');
  });
  it('renders EVERY non-empty top-level data section (nothing hand-picked)', () => {
    expect(html).toContain('>Meta<');
    expect(html).toContain('>Abilities<');
    expect(html).toContain('>Inventory<');
    expect(html).toContain('>Feats<');
    expect(html).toContain('Neon Pistol');
    expect(html).toContain('Sharpshooter');
  });
  it('includes the name, system, and bio', () => {
    expect(html).toContain('Lazzuh Gun');
    expect(html).toMatch(/Dnd5e 2024|dnd5e/i);
    expect(html).toContain('neon sky');
  });
  it('skips empty values so the export is not littered with blanks', () => {
    expect(html).not.toContain('>Empties<'); // an all-empty object is dropped
    expect(html).not.toContain('>Notes<');   // empty string dropped
  });
});

describe('exportFileBase', () => {
  it('slugs the name for a safe filename', () => {
    expect(exportFileBase('Lazzuh Gun!!')).toBe('lazzuh-gun');
    expect(exportFileBase('')).toBe('character');
  });
});
