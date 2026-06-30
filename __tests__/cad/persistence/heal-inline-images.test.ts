import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isInlineImage,
  healInlineImage,
  healInlineImages,
} from '@/lib/cad/persistence/heal-inline-images';
import type { ProjectImage } from '@/lib/cad/types';

function img(over: Partial<ProjectImage> = {}): ProjectImage {
  return {
    id: 'img-1',
    name: 'plat.png',
    originalWidth: 100,
    originalHeight: 50,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('isInlineImage', () => {
  it('true for a base64-only image', () => {
    expect(isInlineImage(img({ dataUrl: 'data:image/png;base64,AAAA' }))).toBe(true);
  });
  it('false once it has a bucket url', () => {
    expect(isInlineImage(img({ dataUrl: 'data:image/png;base64,AAAA', url: 'https://b/x.png' }))).toBe(false);
  });
  it('false when there is no dataUrl at all', () => {
    expect(isInlineImage(img({ url: 'https://b/x.png' }))).toBe(false);
  });
});

describe('healInlineImage', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads the base64 and returns a bucket-backed image with dataUrl dropped', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://bucket/abc.png', storagePath: 'me/abc.png' }),
    });
    const healed = await healInlineImage(img({ dataUrl: 'data:image/png;base64,AAAA' }));
    expect(healed).not.toBeNull();
    expect(healed!.url).toBe('https://bucket/abc.png');
    expect(healed!.storagePath).toBe('me/abc.png');
    expect(healed!.dataUrl).toBeUndefined();
    // Preserves identity + metadata.
    expect(healed!.id).toBe('img-1');
    expect(healed!.originalWidth).toBe(100);
    // Posts the base64 to the upload endpoint.
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.dataUrl).toBe('data:image/png;base64,AAAA');
  });

  it('returns null (keeps the original) when the upload fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });
    expect(await healInlineImage(img({ dataUrl: 'data:image/png;base64,AAAA' }))).toBeNull();
  });

  it('returns null (keeps the original) when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect(await healInlineImage(img({ dataUrl: 'data:image/png;base64,AAAA' }))).toBeNull();
  });

  it('does nothing for an already bucket-backed image (no upload)', async () => {
    const healed = await healInlineImage(img({ url: 'https://b/x.png' }));
    expect(healed).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('healInlineImages', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('only heals inline images and reports each via onHealed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://bucket/x.png', storagePath: 'me/x.png' }),
    });
    const images = [
      img({ id: 'a', dataUrl: 'data:image/png;base64,AAAA' }),       // inline → heal
      img({ id: 'b', url: 'https://b/already.png' }),                 // skip
      img({ id: 'c', dataUrl: 'data:image/png;base64,BBBB' }),       // inline → heal
    ];
    const healed: string[] = [];
    const count = await healInlineImages(images, (h) => healed.push(h.id));
    expect(count).toBe(2);
    expect(healed.sort()).toEqual(['a', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2); // only the two inline ones
  });

  it('skips ones whose upload fails but still heals the rest', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://bucket/y.png', storagePath: 'me/y.png' }) });
    const images = [
      img({ id: 'a', dataUrl: 'data:image/png;base64,AAAA' }),
      img({ id: 'b', dataUrl: 'data:image/png;base64,BBBB' }),
    ];
    const healed: string[] = [];
    const count = await healInlineImages(images, (h) => healed.push(h.id));
    expect(count).toBe(1);
    expect(healed).toEqual(['b']);
  });
});
