// Generated previews: what may have one, what one is allowed to be, and where it goes.
//
// Owner, 2026-09-16: "we need to make it so that we can see the first page thumbnail and poster
// frames for videos."
//
// The deployment has no PDF renderer and no video decoder, so the browser makes these and posts
// them. That makes this an untrusted edge — the server asked for a picture and can be handed
// anything — and most of what follows is about the answers that are not a picture.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canGenerateThumb, initialThumbState, needsThumb, thumbStoragePath, decodeThumbDataUrl,
  thumbSize, posterTime, THUMB_MAX_BYTES, THUMB_MAX_PX,
} from '@/lib/jobs/file-thumbnails';

const read = (p: string) => readFileSync(p, 'utf8');

/** A real 1×1 WebP, base64. */
const TINY_WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

describe('what can have a preview at all', () => {
  it('photographs, video and PDFs — and nothing else pretends it can', () => {
    expect(canGenerateThumb('image', 'image/jpeg')).toBe(true);
    expect(canGenerateThumb('video', 'video/mp4')).toBe(true);
    expect(canGenerateThumb('document', 'application/pdf')).toBe(true);
    expect(canGenerateThumb('document', null, 'LANCE BLDG 14.pdf'), 'a PDF with no MIME recorded').toBe(true);
    // A voice note has no frame to grab. A waveform would have to be invented, and an icon that
    // says "voice note" is more honest than a picture of one.
    expect(canGenerateThumb('audio', 'audio/webm')).toBe(false);
    expect(canGenerateThumb('document', 'application/vnd.dwg', 'boundary.dwg')).toBe(false);
    expect(canGenerateThumb('document', 'text/plain', 'notes.txt')).toBe(false);
  });

  it('parks the ones that never can, so the queue stops asking about them', () => {
    expect(initialThumbState('document', 'application/pdf')).toBe('pending');
    expect(initialThumbState('audio', 'audio/mpeg')).toBe('unsupported');
    expect(needsThumb('pending', 'document', 'application/pdf')).toBe(true);
    expect(needsThumb('pending', 'audio', 'audio/mpeg'), 'never, whatever the row says').toBe(false);
    expect(needsThumb('ok', 'image', 'image/png')).toBe(false);
    expect(needsThumb('failed', 'document', 'application/pdf'), 'tried once, do not loop').toBe(false);
    expect(needsThumb(null, 'image', 'image/png'), 'a row from before this existed').toBe(true);
  });
});

describe('the untrusted edge: what the browser sends back', () => {
  it('takes a canvas WebP', () => {
    const out = decodeThumbDataUrl(TINY_WEBP);
    expect('error' in out).toBe(false);
    if (!('error' in out)) {
      expect(out.contentType).toBe('image/webp');
      expect(out.bytes.byteLength).toBeGreaterThan(10);
    }
  });

  it('refuses SVG outright — a scriptable document wearing an image’s name', () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;
    expect(decodeThumbDataUrl(svg)).toEqual({ error: 'A thumbnail must be a WebP, JPEG or PNG image.' });
  });

  it('refuses anything that is not a small raster image', () => {
    expect(decodeThumbDataUrl('')).toHaveProperty('error');
    expect(decodeThumbDataUrl(null)).toHaveProperty('error');
    expect(decodeThumbDataUrl('https://example.test/not-a-data-url.png')).toHaveProperty('error');
    expect(decodeThumbDataUrl(`data:text/html;base64,${Buffer.from('<h1>hi</h1>').toString('base64')}`)).toHaveProperty('error');
    expect(decodeThumbDataUrl(`data:application/pdf;base64,${Buffer.from('%PDF').toString('base64')}`)).toHaveProperty('error');
  });

  it('caps the size from the base64 length, before anything is decoded into memory', () => {
    // Four base64 characters carry three bytes, so this describes ~600 KB without ever building it.
    const huge = `data:image/webp;base64,${'A'.repeat(Math.ceil((THUMB_MAX_BYTES * 1.5 * 4) / 3))}`;
    const out = decodeThumbDataUrl(huge);
    expect(out).toHaveProperty('error');
    expect((out as { error: string }).error).toMatch(/under \d+ KB/);
  });

  it('an empty image is not a preview', () => {
    expect(decodeThumbDataUrl('data:image/webp;base64,')).toHaveProperty('error');
  });
});

describe('where a preview goes', () => {
  it('is keyed by the file, under a prefix nothing else writes to', () => {
    expect(thumbStoragePath('e309df7a-21e8-4d11-bd4b-cc91596e1ca6')).toBe('thumbs/e309df7a-21e8-4d11-bd4b-cc91596e1ca6.webp');
  });
  it('cannot be talked into writing somewhere else', () => {
    expect(thumbStoragePath('../../secrets/aaaaaaaa')).toBe('thumbs/secretsaaaaaaaa.webp');
    expect(() => thumbStoragePath('x')).toThrow();
    expect(() => thumbStoragePath('')).toThrow();
  });
});

describe('making the picture', () => {
  it('fits the long edge and never scales a small scan up', () => {
    expect(thumbSize(4000, 3000)).toEqual({ width: THUMB_MAX_PX, height: 300 });
    expect(thumbSize(1000, 4000)).toEqual({ width: 100, height: THUMB_MAX_PX });
    expect(thumbSize(120, 90), 'a 120px scan blown up is blurrier for no more information').toEqual({ width: 120, height: 90 });
    expect(thumbSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('grabs a video poster a little way in, never at frame zero', () => {
    // The first frame of a phone video is very often the lens adjusting, black, or somebody's boot.
    expect(posterTime(60)).toBe(1.5);
    expect(posterTime(10)).toBe(1);
    expect(posterTime(0.6)).toBeCloseTo(0.3, 2);
    expect(posterTime(null), 'a duration the browser will not tell us').toBe(0.1);
    expect(posterTime(0)).toBe(0.1);
  });
});

describe('the route and the library agree with the module', () => {
  it('a browser that could not make one says so, and is never asked again', () => {
    const route = read('app/api/admin/jobs/[id]/property-map/thumbnail/route.ts');
    expect(route).toContain("const state = body.state === 'unsupported' ? 'unsupported' : 'failed';");
    expect(route, 'and only for this job’s files').toContain('That file does not belong to this job.');
    expect(route, 'checking lives in the tested module, not inline').toContain('decodeThumbDataUrl(body.data_url)');
  });

  it('stores the preview in the files bucket, never the video bucket', () => {
    // `starr-field-videos` allows video MIME types only, so a WebP poster posted there is refused
    // with "mime type image/webp is not supported" — which is exactly what stopped video tiles ever
    // getting a poster frame. Verified against live storage on 2026-09-17.
    const route = read('app/api/admin/jobs/[id]/property-map/thumbnail/route.ts');
    expect(route).toContain('const bucket = JOB_FILES_BUCKET;');
    expect(route, 'the file’s own bucket is the bug').not.toContain('bucketOf(file)');
  });

  it('the library hands back the generated preview, and says what still needs one', () => {
    const server = read('lib/jobs/property-map-server.ts');
    expect(server).toContain('thumbState');
    expect(server, 'an image previews from itself').toContain("thumbUrl: generated ?? (kind === 'image' ? url : null)");
    expect(server, 'signed with everything else, in bulk').toContain('if (t.thumb_path && t.thumb_bucket) toSign.push');
  });

  it('the schema stops the retry loop', () => {
    const seed = read('seeds/644_job_file_thumbnails.sql');
    expect(seed).toContain("CHECK (thumb_state IN ('pending', 'ok', 'failed', 'unsupported'))");
    expect(seed, 'and indexes the panel’s actual question').toContain('idx_job_files_thumb_pending');
  });
});
