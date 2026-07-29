// Artwork for custom content (P6-11) — the owner's creature-with-art case.
//
// Source-level assertions on the wiring, matching the other Studio tests. What is worth pinning here is not
// "an upload works" (that is the storage client's job) but the two ORDERING decisions that are easy to get
// backwards and impossible to notice until someone loses a picture.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';

const ROUTE = 'app/api/dnd/homebrew/[id]/image/route.ts';
const src = readFileSync(join(process.cwd(), ROUTE), 'utf8');
const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/ContentBuilder.tsx'), 'utf8');

describe('the route exists and is creator-gated', () => {
  it('is mounted, with POST and DELETE', () => {
    expect(existsSync(join(process.cwd(), ROUTE))).toBe(true);
    const exports = [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(exports.sort()).toEqual(['DELETE', 'POST']);
  });

  it('gates on canWriteHomebrew — public readability is not public editability', () => {
    expect(src).toContain('canWriteHomebrew');
  });

  it('validates type and size before touching storage', () => {
    expect(src).toContain('MAX_BYTES');
    expect(src).toMatch(/image\/png/);
  });
});

describe('the two orderings that lose artwork if reversed', () => {
  it('the row is updated BEFORE the old file is deleted', () => {
    // Reversed, a failed update leaves the piece pointing at an object that no longer exists: a broken
    // image with no way back. An orphaned object merely costs storage.
    const updateAt = src.indexOf("update({ image_url, updated_at");
    const removeAt = src.indexOf('.remove([oldKey])');
    expect(updateAt).toBeGreaterThan(-1);
    expect(removeAt).toBeGreaterThan(-1);
    expect(updateAt).toBeLessThan(removeAt);
  });

  it('and the image is uploaded AFTER the piece is created, not staged before it', () => {
    // The endpoint is per-piece, so it needs an id that does not exist until the first save. Staging a file
    // that silently vanishes when the save fails is the "looks like it worked" failure the builder's
    // placeholders exist to avoid.
    const createAt = builder.indexOf("fetch('/api/dnd/homebrew'");
    const uploadAt = builder.indexOf('/image`');
    expect(createAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(uploadAt);
  });

  it('a failed image upload does not report as a failed SAVE', () => {
    // The content is already in the database at that point; telling the author it failed would have them
    // redo work that is safely stored.
    expect(builder).toMatch(/Saved, but the image did not upload/);
  });
});

describe('the builder offers the field where the registry declares it', () => {
  it('image is no longer a placeholder', () => {
    expect(builder).toMatch(/IMPLEMENTED = new Set\(\[[^\]]*'image'/);
    // And it must not ALSO be listed as owed — that contradiction is how a placeholder outlives its fix.
    const owed = builder.slice(builder.indexOf('OWED_BY'), builder.indexOf('OWED_BY') + 220);
    expect(owed).not.toContain('image:');
  });

  it('every kind can carry artwork — it is an identity field, not a per-kind extra', () => {
    for (const kind of HOMEBREW_KINDS) {
      expect(fieldsForKind(kind).map((f) => f.key), `${kind} should accept artwork`).toContain('image');
    }
  });
});

describe('the creator sees their content on the lobby', () => {
  it('the strip is mounted on the hub', () => {
    const hub = readFileSync(join(process.cwd(), 'app/dnd/page.tsx'), 'utf8');
    expect(hub).toMatch(/<MyContentStrip/);
  });

  it('and renders nothing rather than an empty state', () => {
    // The Content Builder button sits inches above it; an empty "you have no content" section would just
    // repeat the call to action and make the lobby longer.
    const strip = readFileSync(join(process.cwd(), 'app/dnd/_ui/MyContentStrip.tsx'), 'utf8');
    expect(strip).toMatch(/if \(!rows\.length\) return null;/);
  });
});
