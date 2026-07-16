// __tests__/dnd/item-thumbnail.test.ts — an item's uploaded art shows in the Gear list (Slice 28).
//
// The ItemBuilder has always uploaded and stored an item `image` (Slice 2b / the item builder), but
// the Gear list never rendered it — the classic "the data was there, nothing showed it" gap. This is
// the first, honest slice of Slice 28 (art for every element): render the art an item ALREADY has.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const INVENTORY = read('app/dnd/_sheet/components/Inventory.tsx');
const BUILDER = read('app/dnd/_sheet/components/ItemBuilder.tsx');
const CSS = read('app/dnd/_sheet/styles/theme.css');

describe('the Gear list renders an item thumbnail from its stored image', () => {
  it('shows it.image when present, and nothing when unset', () => {
    expect(INVENTORY).toContain('{it.image && (');
    expect(INVENTORY).toContain('className="inv-thumb"');
  });

  it('reuses the image the ItemBuilder already uploads — no second art field', () => {
    // The builder stores `image` via the media endpoint; this render just reads it.
    expect(BUILDER).toContain("patch({ image: j.url })");
  });

  it('the thumbnail is token-driven (border), not a hardcoded colour', () => {
    const block = CSS.slice(CSS.indexOf('.inv-thumb'), CSS.indexOf('.inv-thumb') + 260);
    expect(block).toContain('var(--line)');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
