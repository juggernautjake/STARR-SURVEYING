// __tests__/dnd/element-art.test.ts — art for attacks, spells and features (Slice 28).
//
// The item art path shipped first; this extends it to the other elements through ONE shared upload
// control (ImageUpload) rather than three copies of the ItemBuilder's inline uploader — the drift
// this codebase keeps paying for. Each type gained an `image` field, each editor mounts the shared
// control, and each list renders the thumbnail.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const UPLOAD = read('app/dnd/_sheet/components/ui/ImageUpload.tsx');

describe('ImageUpload is one shared control, not three copies', () => {
  it('posts to the media endpoint with a non-column kind and reports its own errors', () => {
    expect(UPLOAD).toContain('/api/dnd/characters/${characterId}/media');
    expect(UPLOAD).toContain("fd.append('kind', 'item')");
    expect(UPLOAD).toContain('Upload failed.');
  });
  it('shows the current art with change + remove affordances', () => {
    expect(UPLOAD).toContain('Change art');
    expect(UPLOAD).toContain('Remove');
    expect(UPLOAD).toContain('onChange(undefined)');
  });
});

describe('all three editors mount the shared control', () => {
  for (const f of ['AttackEditor', 'SpellEditor', 'FeatureEditor']) {
    it(`${f} imports and mounts ImageUpload bound to draft.image`, () => {
      const src = read(`app/dnd/_sheet/components/ui/${f}.tsx`);
      expect(src).toContain("import ImageUpload from './ImageUpload'");
      expect(src).toContain('<ImageUpload value={draft.image}');
      expect(src).toContain("set('image', url)");
    });
  }
});

describe('all three lists render the thumbnail from the stored image', () => {
  it('Attacks / Features / Spells show the element art', () => {
    expect(read('app/dnd/_sheet/components/Attacks.tsx')).toContain('src={a.image}');
    expect(read('app/dnd/_sheet/components/Features.tsx')).toContain('src={f.image}');
    expect(read('app/dnd/_sheet/components/SpellsPanel.tsx')).toContain('src={s.image}');
  });
});

describe('the Active Effects panel shows the source art (Slice 28)', () => {
  const AE = read('app/dnd/_sheet/components/ActiveEffects.tsx');
  it('looks the source art up from the item/feature it already is (no new ledger plumbing)', () => {
    expect(AE).toContain('imageFor');
    expect(AE).toContain('(char.inventory ?? []).find((i) => i.id === row.id)?.image');
    expect(AE).toContain('(char.features ?? []).find((f) => f.id === row.id)?.image');
    expect(AE).toContain('src={imageFor(row)}');
  });
});
