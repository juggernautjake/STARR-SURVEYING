import { describe, it, expect } from 'vitest';
import { uploadNotification, shouldNotify } from '../../mobile/lib/uploadNotify';

// workmode Area C6 — the pure notification-content composer for the upload queue. Off-device + deterministic
// (the runtime fires these via expo-notifications), same shape as the other pure upload engines.

describe('uploadNotification — item-done', () => {
  it('pings per file in "each" mode with the remaining count', () => {
    const n = uploadNotification({ kind: 'item-done', name: 'clip.mp4', remaining: 3 });
    expect(n?.title).toBe('Uploaded');
    expect(n?.body).toMatch(/clip\.mp4 is in the job cloud/);
    expect(n?.body).toMatch(/3 files still uploading/);
  });
  it('says "last one / complete" when nothing remains', () => {
    const n = uploadNotification({ kind: 'item-done', name: 'last.jpg', remaining: 0 });
    expect(n?.title).toBe('Uploads complete');
    expect(n?.body).toMatch(/last one/);
  });
  it('is suppressed in "summary" mode (only the final ping fires)', () => {
    expect(uploadNotification({ kind: 'item-done', name: 'x', remaining: 2 }, 'summary')).toBeNull();
    expect(shouldNotify({ kind: 'item-done', name: 'x', remaining: 2 }, 'summary')).toBe(false);
  });
  it('pluralizes the remaining count', () => {
    expect(uploadNotification({ kind: 'item-done', name: 'a', remaining: 1 })?.body).toMatch(/1 file still/);
  });
});

describe('uploadNotification — all-done', () => {
  it('reports the total, always (both verbosity levels)', () => {
    expect(uploadNotification({ kind: 'all-done', count: 5 })?.body).toMatch(/5 files uploaded/);
    expect(uploadNotification({ kind: 'all-done', count: 1 }, 'summary')?.body).toMatch(/1 file uploaded/);
  });
});

describe('uploadNotification — failed', () => {
  it('names the file; offers retry only when retryable', () => {
    expect(uploadNotification({ kind: 'failed', name: 'big.mov' })?.body).toBe("big.mov couldn't upload.");
    expect(uploadNotification({ kind: 'failed', name: 'big.mov', canRetry: true })?.body).toMatch(/Tap to retry/);
    // failures always notify, even in summary mode
    expect(shouldNotify({ kind: 'failed', name: 'x' }, 'summary')).toBe(true);
  });
});
