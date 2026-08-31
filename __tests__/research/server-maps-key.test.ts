// __tests__/research/server-maps-key.test.ts
//
// The public key must never be usable as a server-side fallback.
//
// `GOOGLE_MAPS_API_KEY || NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` reads as a courtesy and is a trap: when
// the server key is unset it substitutes a referrer-restricted BROWSER key, which Google refuses
// for a server request whatever APIs are enabled. The clear, fixable "not configured" becomes an
// opaque permission error, and a billed API ends up behind a key that ships in the page source.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveServerMapsKey,
  SERVER_MAPS_KEY_VARS,
  NO_SERVER_MAPS_KEY_MESSAGE,
} from '@/lib/maps/server-key';

const ROOT = process.cwd();
const stripComments = (s: string) => s
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('resolveServerMapsKey', () => {
  it('prefers the dedicated server variable', () => {
    const r = resolveServerMapsKey({
      GOOGLE_MAPS_SERVER_KEY: 'server-one',
      GOOGLE_MAPS_API_KEY: 'server-two',
    });
    expect(r).toEqual({ key: 'server-one', source: 'GOOGLE_MAPS_SERVER_KEY' });
  });

  it('accepts the name the key actually exists under', () => {
    // An audit found a server key had been live for 115 days under GOOGLE_MAPS_API_KEY while this
    // codebase was asking for a second one under a name nobody had created. Both are honoured.
    const r = resolveServerMapsKey({ GOOGLE_MAPS_API_KEY: 'server-two' });
    expect(r).toEqual({ key: 'server-two', source: 'GOOGLE_MAPS_API_KEY' });
  });

  it('NEVER returns the public browser key — the whole point', () => {
    const r = resolveServerMapsKey({
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'browser-key-that-cannot-work-server-side',
    });
    expect(r.key).toBeNull();
    expect(r.source).toBeNull();
  });

  it('treats blank and whitespace as absent, not as configured', () => {
    // A blank value is how a half-finished deployment presents, and reporting it as a key produces
    // a request that fails for a reason nobody can act on.
    expect(resolveServerMapsKey({ GOOGLE_MAPS_API_KEY: '' }).key).toBeNull();
    expect(resolveServerMapsKey({ GOOGLE_MAPS_API_KEY: '   ' }).key).toBeNull();
  });

  it('strips the quotes a .env file leaves behind', () => {
    // A quoted key fails with the same opaque denial as a missing one.
    expect(resolveServerMapsKey({ GOOGLE_MAPS_API_KEY: '"quoted"' }).key).toBe('quoted');
    expect(resolveServerMapsKey({ GOOGLE_MAPS_API_KEY: "'quoted'" }).key).toBe('quoted');
  });

  it('falls through an empty first variable to a set second one', () => {
    const r = resolveServerMapsKey({
      GOOGLE_MAPS_SERVER_KEY: '',
      GOOGLE_MAPS_API_KEY: 'real',
    });
    expect(r.key).toBe('real');
  });

  it('names both variables and explains the public one in its failure message', () => {
    for (const v of SERVER_MAPS_KEY_VARS) expect(NO_SERVER_MAPS_KEY_MESSAGE).toContain(v);
    // Without this sentence the obvious next move is to paste the browser key in and re-create the
    // original bug under a new name.
    expect(NO_SERVER_MAPS_KEY_MESSAGE).toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    expect(NO_SERVER_MAPS_KEY_MESSAGE).toContain('referrer-restricted');
  });
});

describe('no server-side caller keeps the public fallback', () => {
  // Comments are stripped first: three of these files DISCUSS the fallback at length, and a raw
  // scan would read the explanation as the offence. That mistake was made twice today already.
  const CALLERS = [
    'lib/research/parcel-map-capture.service.ts',
    'lib/research/progressive-zoom.service.ts',
    'worker/src/counties/bell/analyzers/lot-correlator.ts',
  ];

  it('finds the files it means to guard', () => {
    for (const f of CALLERS) {
      expect(fs.existsSync(path.join(ROOT, f)), `${f} moved — update this guard`).toBe(true);
    }
  });

  it('has no `|| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` left in executable code', () => {
    const offenders = CALLERS.filter((f) =>
      /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/.test(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
    );
    expect(
      offenders,
      'These make server-side Google calls and would fall back to the referrer-restricted browser '
        + `key, which Google refuses for a server request:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
