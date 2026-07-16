// __tests__/dnd/tag-tooltips.test.ts — a homebrew tag explains itself everywhere (Slice 32).
//
// Slice 27 gave the five built-in tags tooltips. Slice 32 opens the vocabulary: a table mints its
// own tags WITH a required definition, and every place that shows a tag — the editor's TagPicker AND
// the Gear list — explains a custom tag exactly the way it explains `flavor`. The Gear list was the
// last gap: it called tagInfo(t) without the character's own tags, so a homebrew tag showed no
// tooltip there while the editor did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tagInfo, availableTags, validateCustomTag, RESERVED_TAGS } from '@/app/dnd/_sheet/components/ui/tagInfo';
import type { CustomTag } from '@/app/dnd/_sheet/types';

const INVENTORY = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Inventory.tsx'), 'utf8');
const PICKER = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ui/TagPicker.tsx'), 'utf8');

const cursed: CustomTag[] = [{ name: 'cursed', description: 'Cannot be removed without a Remove Curse.' }];

describe('tagInfo resolves built-ins AND the character\'s own tags', () => {
  it('returns the built-in definition for a built-in tag', () => {
    expect(tagInfo('flavor')).toMatch(/roleplay/i);
  });

  it('returns the character\'s definition for a homebrew tag', () => {
    expect(tagInfo('cursed', cursed)).toMatch(/Remove Curse/);
    expect(tagInfo('CURSED', cursed)).toMatch(/Remove Curse/); // case-insensitive
  });

  it('returns null for a tag with no definition anywhere (never invents one)', () => {
    expect(tagInfo('mystery', cursed)).toBeNull();
  });

  it('availableTags offers the built-ins plus the character\'s own', () => {
    const tags = availableTags(cursed);
    expect(tags).toContain('flavor');
    expect(tags).toContain('cursed');
  });
});

describe('the Gear list and the editor both pass the character tags', () => {
  it('Inventory passes char.customTags to tagInfo (the last gap)', () => {
    expect(INVENTORY).toContain('tagInfo(t, char.customTags)');
  });
  it('TagPicker passes custom to tagInfo and mints with a required definition', () => {
    expect(PICKER).toContain('tagInfo(t, custom)');
    expect(PICKER).toContain('validateCustomTag(name, desc, custom)');
  });
});

describe('creating a tag: definition required, reserved names refused', () => {
  it('refuses a blank definition', () => {
    expect(validateCustomTag('cursed', '', [])?.reason).toMatch(/Describe what this tag means/);
  });
  it('refuses a reserved wiring name', () => {
    for (const r of RESERVED_TAGS) {
      expect(validateCustomTag(r, 'looks dangerous', [])).not.toBeNull();
    }
  });
  it('accepts a name + definition and is idempotent about duplicates', () => {
    expect(validateCustomTag('cursed', 'a curse', [])).toBeNull();
    expect(validateCustomTag('cursed', 'a curse', cursed)?.reason).toMatch(/already exists/);
  });
});
