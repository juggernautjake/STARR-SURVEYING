// Page images in the packet, and what it says when there are none (plan R25).
//
// The load-bearing assertions here are the ones about ABSENCE. A document entry printed with no
// image looks identical whether the image was never fetched, could not be read, or was deliberately
// left out of a text-only print — and a crew flipping to "Source documents" expecting a plat and
// finding a paragraph needs to know which. "We never pulled it" is an errand; "the page is
// unreadable" is a trip to the courthouse; "text-only print" is neither.
//
// The truncation assertions matter for the same reason. A packet quietly showing the first twelve of
// twenty plats, with nothing saying so, is an incomplete answer wearing a complete one's clothes.

import { describe, it, expect, vi } from 'vitest';
import {
  MAX_DOCUMENTS_IMAGED,
  fetchPacketImages,
  type DocumentImageSource,
} from '@/lib/research/packet-images';

const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

function okResponse(bytes: Buffer = PNG_BYTES, contentType = 'image/png') {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

const src = (over: Partial<DocumentImageSource> = {}): DocumentImageSource => ({
  refId: 'doc-1',
  storageUrl: 'https://store.test/plat.png',
  pageCount: 1,
  readability: null,
  ...over,
});

describe('an image that is there', () => {
  it('embeds it as a data URL', async () => {
    const r = await fetchPacketImages([src()], { fetchImpl: vi.fn(async () => okResponse()) as never });
    expect(r.images['doc-1'].status).toBe('embedded');
    expect(r.images['doc-1'].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(r.warning).toBeNull();
  });

  it('keeps the JPEG mime when the store says JPEG', async () => {
    const r = await fetchPacketImages([src()], {
      fetchImpl: vi.fn(async () => okResponse(PNG_BYTES, 'image/jpeg')) as never,
    });
    expect(r.images['doc-1'].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('carries the page count, so the PDF can say how much is shown', async () => {
    const r = await fetchPacketImages([src({ pageCount: 4 })], { fetchImpl: vi.fn(async () => okResponse()) as never });
    expect(r.images['doc-1'].pageCount).toBe(4);
  });
});

describe('an image that is not there says which kind of not-there it is', () => {
  it('distinguishes a document with no stored image', async () => {
    const r = await fetchPacketImages([src({ storageUrl: null })], { fetchImpl: vi.fn() as never });
    expect(r.images['doc-1'].status).toBe('not_attached');
  });

  it('distinguishes a document the pipeline already judged unreadable', async () => {
    // Embedding it anyway would put an illegible page beside a line saying it is illegible.
    const r = await fetchPacketImages([src({ readability: 'unreadable' })], { fetchImpl: vi.fn() as never });
    expect(r.images['doc-1'].status).toBe('unreadable');
  });

  it('distinguishes a fetch that failed', async () => {
    const r = await fetchPacketImages([src()], {
      fetchImpl: vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => null } })) as never,
    });
    expect(r.images['doc-1'].status).toBe('fetch_failed');
    expect(r.images['doc-1'].detail).toContain('404');
  });

  it('distinguishes a timeout, and says how long it waited', async () => {
    const r = await fetchPacketImages([src()], {
      fetchImpl: vi.fn(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }) as never,
    });
    expect(r.images['doc-1'].status).toBe('fetch_failed');
    expect(r.images['doc-1'].detail).toMatch(/did not load within/);
  });

  it('never lets one bad image lose the others', async () => {
    let n = 0;
    const r = await fetchPacketImages([src({ refId: 'a' }), src({ refId: 'b' })], {
      fetchImpl: vi.fn(async () => { if (n++ === 0) throw new Error('socket hang up'); return okResponse(); }) as never,
    });
    expect(r.images.a.status).toBe('fetch_failed');
    expect(r.images.b.status).toBe('embedded');
  });

  it('warns on the cover when anything failed', async () => {
    const r = await fetchPacketImages([src()], {
      fetchImpl: vi.fn(async () => { throw new Error('nope'); }) as never,
    });
    expect(r.warning).toContain('could not be loaded');
    expect(r.warning).toContain('this print does not contain them');
  });
});

describe('the limits are reported, not silently applied', () => {
  it('images at most the configured number of documents', async () => {
    const sources = Array.from({ length: MAX_DOCUMENTS_IMAGED + 3 }, (_, i) => src({ refId: `d${i}` }));
    const r = await fetchPacketImages(sources, { fetchImpl: vi.fn(async () => okResponse()) as never });

    const embedded = Object.values(r.images).filter((i) => i.status === 'embedded');
    expect(embedded).toHaveLength(MAX_DOCUMENTS_IMAGED);
  });

  it('says on the cover how many were left out', async () => {
    const sources = Array.from({ length: MAX_DOCUMENTS_IMAGED + 3 }, (_, i) => src({ refId: `d${i}` }));
    const r = await fetchPacketImages(sources, { fetchImpl: vi.fn(async () => okResponse()) as never });
    expect(r.warning).toContain('3 document(s) were not imaged');
  });

  it('says it on the entry too, so a reader at item 34 is not relying on the cover', async () => {
    const sources = Array.from({ length: MAX_DOCUMENTS_IMAGED + 1 }, (_, i) => src({ refId: `d${i}` }));
    const r = await fetchPacketImages(sources, { fetchImpl: vi.fn(async () => okResponse()) as never });
    const last = r.images[`d${MAX_DOCUMENTS_IMAGED}`];
    expect(last.status).toBe('not_requested');
    expect(last.detail).toContain('is in the research record');
  });

  it('stops at the byte budget rather than producing a packet nobody can open', async () => {
    const big = Buffer.alloc(600 * 1024, 1);
    const sources = Array.from({ length: 4 }, (_, i) => src({ refId: `d${i}` }));
    const r = await fetchPacketImages(sources, {
      maxTotalBytes: 1024 * 1024,
      fetchImpl: vi.fn(async () => okResponse(big)) as never,
    });

    const embedded = Object.values(r.images).filter((i) => i.status === 'embedded');
    expect(embedded.length).toBeLessThan(4);
    expect(r.warning).toContain('image size budget');
  });

  it('is silent when nothing was truncated or failed', async () => {
    const r = await fetchPacketImages([src()], { fetchImpl: vi.fn(async () => okResponse()) as never });
    expect(r.warning).toBeNull();
  });
});
