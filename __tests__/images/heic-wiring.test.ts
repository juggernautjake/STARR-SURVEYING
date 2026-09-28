// __tests__/images/heic-wiring.test.ts
//
// The converter is only useful where it is wired. The 2026-08-08 "no HEIC" work built a correct
// converter and wired it into ONE route; the rest were listed as "mechanical, not yet done" and were
// still taking HEIC seven weeks later. These assertions are what stop that recurring: each route that
// receives photos must call the server safety net, the site must mount the browser guard, and the
// storage script must stay non-destructive.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
/** Source with comments stripped, so an explanatory comment cannot satisfy an assertion. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

describe('the browser guard is mounted for the whole site', () => {
  it('the root layout renders <HeicUploadGuard />', () => {
    expect(code('app/layout.tsx')).toMatch(/<HeicUploadGuard\s*\/>/);
  });

  it('the guard listens in the CAPTURE phase, so it runs before any page handler', () => {
    const src = code('lib/images/heic-upload-guard.ts');
    for (const ev of ['input', 'change', 'drop', 'paste']) {
      expect(src).toMatch(new RegExp(`addEventListener\\('${ev}'[^)]*opts\\)`));
    }
    expect(src).toMatch(/capture:\s*true/);
  });

  it('the WebAssembly decoder is loaded lazily inside the worker, never in the page bundle', () => {
    expect(code('lib/images/heic.worker.ts')).toMatch(/import\('libheif-js\/libheif-wasm\/libheif-bundle\.mjs'\)/);
    expect(code('lib/images/heic.ts')).not.toMatch(/from 'libheif-js/);
    expect(code('lib/images/heic.ts')).toMatch(/new Worker\(new URL\('\.\/heic\.worker\.ts', import\.meta\.url\)\)/);
  });
});

describe('every route that receives photos converts HEIC server-side', () => {
  // Image-only destinations: convert, or refuse with the 415 instructions.
  const IMAGE_ONLY = [
    'app/api/admin/equipment/[id]/photo/route.ts',
    'app/api/admin/vehicles/[id]/photos/route.ts',
    'app/api/admin/profile/avatar/route.ts',
    'app/api/admin/profile/images/route.ts',
    'app/api/admin/cad/images/route.ts',
  ];
  // Document stores: convert, or keep the original.
  const ANY_FILE = [
    'app/api/admin/research/[projectId]/documents/route.ts',
    'app/api/admin/messages/attachments/route.ts',
    'app/api/admin/my-files/route.ts',
    'app/api/admin/leads/[id]/reply/route.ts',
    'app/api/contact/route.ts',
  ];

  it.each(IMAGE_ONLY)('%s converts or answers 415', (p) => {
    const src = code(p);
    expect(src).toMatch(/convertHeicForImageRoute\(/);
    expect(src).toMatch(/heic\.status/);
  });

  it.each(ANY_FILE)('%s converts or keeps the original', (p) => {
    expect(code(p)).toMatch(/normaliseHeicOrKeep\(/);
  });

  it('the receipts route (normaliseImage) decodes HEIC with libheif, not sharp', () => {
    expect(code('app/api/admin/receipts/upload/route.ts')).toMatch(/normaliseImage\(/);
    expect(code('lib/media/normalise-image.ts')).toMatch(/heicToJpeg\(/);
  });

  it('libheif-js is a server external, so it is not re-bundled into every route', () => {
    expect(code('next.config.js')).toMatch(/serverComponentsExternalPackages:[^\]]*'libheif-js'/);
  });
});

describe('the storage script cannot destroy anything', () => {
  const src = code('scripts/convert-heic-in-storage.mjs');

  it('is a dry run unless --apply is given', () => {
    expect(src).toMatch(/const APPLY = flag\('--apply'\)/);
    expect(src).toMatch(/const UPDATE_REFS = APPLY && flag\('--update-refs'\)/);
  });

  it('never deletes an object, and never overwrites one', () => {
    expect(src).not.toMatch(/\.remove\(/);
    expect(src).not.toMatch(/upsert:\s*true/);
  });
});
