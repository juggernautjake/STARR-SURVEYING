// __tests__/cad/image-from-library.test.ts — a library plat under a CAD drawing.
//
// Before this route there was NO path from a research document to a drawing — not a broken one,
// none at all: `research_documents` appears nowhere under app/api/admin/cad, app/admin/cad or
// lib/cad. A drafter with 8,077 Bell plats in the library still fetched one by hand.
//
// Two things are worth pinning: it refuses what is not ours to move, and it copies rather than
// points.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.join(process.cwd(), 'app/api/admin/cad/images/from-library/route.ts'), 'utf8',
).replace(/\r\n/g, '\n');

describe('the licence gate comes before any bytes move', () => {
  it('reads `shareable` and refuses anything that is not', () => {
    // A customer's own survey and a TexasFile purchase both live in research_documents. Neither may
    // travel into a different customer's drawing, and seed 658 defaults the column to false so that
    // silence means no.
    expect(src).toContain('shareable');
    expect(src).toContain("doc.shareable !== true");
    expect(src).toContain('403');
  });

  it('checks the licence BEFORE fetching the file, not after', () => {
    const gate = src.indexOf('doc.shareable !== true');
    const fetchAt = src.indexOf('await fetch(href)');
    expect(gate).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    // Reading the bytes and then deciding you were not allowed to is not a refusal.
    expect(gate).toBeLessThan(fetchAt);
  });

  it("says plainly when it is the customer's own file", () => {
    expect(src).toContain('customer_upload');
    expect(src).toMatch(/stays on the job it was uploaded to/);
  });
});

describe('it copies, and does not point', () => {
  it('uploads into the drawing bucket rather than writing the research URL into the drawing', () => {
    // Pointing would be less work and would mean a drawing silently changing when a document is
    // superseded or re-filed. A survey drawing must not move under the drafter.
    expect(src).toContain('CAD_IMAGES_BUCKET');
    expect(src).toContain('.upload(');
  });

  it('keys the copy by document id, so placing the same plat twice reuses one object', () => {
    expect(src).toContain('`library/${doc.id}.${ext}`');
    expect(src).toContain('upsert: true');
  });

  it('records where the underlay came from', () => {
    expect(src).toContain('sourceDocumentId');
    expect(src).toContain('sourceCounty');
  });

  it('reads the source through a signed URL, so it keeps working when that bucket is made private', () => {
    // research-documents is public today and should not be. This route must not depend on that.
    expect(src).toContain('createSignedUrl');
  });
});

describe('the refusals a drafter will actually hit', () => {
  it('a library row with no stored file says so rather than 500ing', () => {
    // The URL-only import created exactly these: searchable, and nothing to place.
    expect(src).toContain('!doc.storage_path');
    expect(src).toMatch(/only a link to where it came from/);
  });

  it('a plat over the drawing bucket limit is named and measured, not just rejected', () => {
    expect(src).toContain('MAX_BYTES');
    expect(src).toContain('413');
    expect(src).toMatch(/Crop or downsample/);
  });
});

describe('the drawing can say where its underlay came from', () => {
  const types = fs.readFileSync(path.join(process.cwd(), 'lib/cad/types.ts'), 'utf8');

  it('ProjectImage carries the provenance the route returns', () => {
    expect(types).toContain('sourceDocumentId?: string;');
    expect(types).toContain('sourceCounty?: string;');
  });

  it('and says in the type that it is provenance, not a live reference', () => {
    // The distinction matters: a live reference would let the library move a drafter's underlay.
    expect(types).toMatch(/Provenance, not a live reference/);
  });
});
