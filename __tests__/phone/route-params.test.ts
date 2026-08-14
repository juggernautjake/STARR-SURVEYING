// __tests__/phone/route-params.test.ts — supporting the phone admin routes.
//
// Counting segments from the end of a URL is trivial and is wrong in production surprisingly often.
// The specific failure: `/calls/<id>/transcribe` with `trailing: 0` looks up the literal string
// "transcribe" as a call id. Every request 404s, the route looks fine, and the bug is one character.

import { describe, it, expect } from 'vitest';
import { idFromPath } from '@/lib/phone/route-params';

const ID = '7f3c1e2a-4b5d-4c6e-8a9f-0b1c2d3e4f50';

describe('finding the id in the path', () => {
  it('reads the last segment for a plain resource route', () => {
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}`, 0)).toBe(ID);
  });

  it('reads the second-to-last for an action route', () => {
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}/transcribe`, 1)).toBe(ID);
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}/create-job`, 1)).toBe(ID);
  });

  it('ignores the query string', () => {
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}?force=1`, 0)).toBe(ID);
  });

  it('tolerates a trailing slash', () => {
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}/`, 0)).toBe(ID);
  });

  it('returns null rather than the action name when trailing is wrong', () => {
    // The off-by-one this file exists for. Returning "transcribe" would become a database filter
    // that matches nothing, and every request would report "not found" for a call that exists.
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID}/transcribe`, 0)).toBeNull();
  });

  it('returns null for a segment that is not a UUID', () => {
    for (const bad of ['undefined', 'null', 'me', '../../etc/passwd', '12345']) {
      expect(idFromPath(`https://x.test/api/admin/phone/calls/${bad}`, 0), bad).toBeNull();
    }
  });

  it('returns null for a path with nothing in it', () => {
    expect(idFromPath('https://x.test/', 0)).toBeNull();
    expect(idFromPath('https://x.test/api', 5)).toBeNull();
  });

  it('does not throw on a malformed URL', () => {
    expect(() => idFromPath('not a url', 0)).not.toThrow();
    expect(idFromPath('not a url', 0)).toBeNull();
  });

  it('accepts an uppercase UUID', () => {
    expect(idFromPath(`https://x.test/api/admin/phone/calls/${ID.toUpperCase()}`, 0)).toBe(ID.toUpperCase());
  });
});
