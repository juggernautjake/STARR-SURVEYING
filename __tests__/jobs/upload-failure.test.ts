// __tests__/jobs/upload-failure.test.ts — naming the failure that costs a whole transfer.
//
// A 375 MB video once uploaded every byte and was refused at 100%, and the message the person saw
// was `Upload failed (400)`. That sent the investigation to the API route, which was fine, instead
// of to the Supabase PROJECT upload ceiling, which was not.
//
// The trap is that Supabase reports "too large" as HTTP **400** with a `413` buried in the JSON
// body. Matching on the status alone misses it, which is exactly what happened.

import { describe, it, expect } from 'vitest';
import { explainPutFailure } from '@/lib/jobs/upload-client';

const file = { name: 'access-road.mp4', size: 375 * 1024 * 1024 };

describe('explainPutFailure', () => {
  it('recognises the real Supabase shape: 413 inside an HTTP 400', () => {
    const body = JSON.stringify({
      statusCode: '413',
      error: 'Payload too large',
      message: 'The object exceeded the maximum allowed size',
    });
    const message = explainPutFailure(400, body, file);
    expect(message).toContain('375 MB');
    expect(message).toContain('access-road.mp4');
    // It must point at the thing that actually has to change. Until 2026-08-22 that was the
    // dashboard's project ceiling; now the ceiling is 2 GB and the BUCKET is what binds, so a
    // message still sending somebody to Storage → Settings would waste the trip.
    expect(message).toContain('file_size_limit');
    expect(message).toContain('STORAGE_UPLOAD_CAP_BYTES');
    expect(message).toContain('check-upload-ceiling');
  });

  it('recognises a plain 413 too', () => {
    expect(explainPutFailure(413, '', file)).toContain('too large');
  });

  it('matches the message text case-insensitively', () => {
    expect(explainPutFailure(400, 'The object exceeded the maximum allowed size', file))
      .toContain('too large');
  });

  it('calls a dropped connection what it is', () => {
    // status 0 is what XHR reports when the transfer dies mid-flight — the common field failure,
    // and a different problem from the ceiling with a different answer.
    expect(explainPutFailure(0, '', file)).toContain('connection dropped');
  });

  it('explains an expired signed URL rather than saying "forbidden"', () => {
    expect(explainPutFailure(403, '', file)).toContain('expired');
    expect(explainPutFailure(401, '', file)).toContain('expired');
  });

  it('does not claim "too large" for an unrelated 400', () => {
    // The whole point is precision. A generic failure must NOT send somebody to raise a ceiling
    // that was never the problem.
    const message = explainPutFailure(400, '{"error":"InvalidKey"}', file);
    expect(message).toBe('Upload failed (400).');
  });

  it('survives an empty or missing body', () => {
    expect(explainPutFailure(500, '', file)).toBe('Upload failed (500).');
    expect(explainPutFailure(500, undefined as unknown as string, file)).toBe('Upload failed (500).');
  });
});
