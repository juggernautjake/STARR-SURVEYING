import { describe, it, expect } from 'vitest';
import { planAfterUpload, classifyUploadOutcome } from '../../mobile/lib/uploadOutcome';

// workmode — the pure post-upload plan (notification + retention + advance) composed from the upload
// engines. The counterpart to nextDrainStep; together they are the drain loop's whole logic.

describe('classifyUploadOutcome — the delete-safety branch (a transient error must NEVER read as uploaded)', () => {
  it('no error is a clean success', () => {
    expect(classifyUploadOutcome(null)).toBe('uploaded');
    expect(classifyUploadOutcome(undefined)).toBe('uploaded');
    expect(classifyUploadOutcome('')).toBe('uploaded');
  });

  it('a duplicate / already-exists error is uploaded (the server has it; do not retry forever)', () => {
    expect(classifyUploadOutcome('Duplicate')).toBe('uploaded');
    expect(classifyUploadOutcome('The resource already exists')).toBe('uploaded');
    expect(classifyUploadOutcome('DUPLICATE key value')).toBe('uploaded'); // case-insensitive
  });

  it('ANY other error is a retry — the file MUST be preserved (this is the data-loss guard)', () => {
    for (const e of ['Network request failed', 'timeout', '500 Internal Server Error', 'aborted', 'ENOENT']) {
      expect(classifyUploadOutcome(e), `"${e}" must be a retry, not a delete-safe success`).toBe('retry');
    }
  });
});

describe('planAfterUpload — success', () => {
  it('per-file done: notifies with the remaining count, offers retention (confirmed), advances in automatic', () => {
    const p = planAfterUpload({ ok: true, name: 'a.jpg', remaining: 2 }, { mode: 'automatic', retentionPref: 'ask', savedToCameraRoll: true });
    expect(p.notification?.body).toMatch(/2 files still uploading/);
    expect(p.retention).toMatchObject({ prompt: true, offerCameraRollDelete: true }); // confirmed → may act
    expect(p.advance).toBe(true);
    expect(p.queueComplete).toBe(false);
  });

  it('last file: completion notification, no advance, queueComplete', () => {
    const p = planAfterUpload({ ok: true, name: 'z.jpg', remaining: 0 }, { mode: 'automatic', retentionPref: 'delete' });
    expect(p.notification?.title).toBe('Uploads complete');
    expect(p.advance).toBe(false);
    expect(p.queueComplete).toBe(true);
    expect(p.retention?.deleteWorkingCopy).toBe(true); // delete pref + confirmed
  });

  it('manual mode never auto-advances even with more queued', () => {
    expect(planAfterUpload({ ok: true, name: 'a', remaining: 3 }, { mode: 'manual' }).advance).toBe(false);
  });

  it('summary verbosity suppresses the per-file ping but still plans retention/advance', () => {
    const p = planAfterUpload({ ok: true, name: 'a', remaining: 1 }, { mode: 'automatic', notifyLevel: 'summary' });
    expect(p.notification).toBeNull();
    expect(p.advance).toBe(true);
  });
});

describe('planAfterUpload — failure', () => {
  it('notifies (even in summary), plans NO retention, and does not advance past the failure', () => {
    const p = planAfterUpload({ ok: false, name: 'big.mov', canRetry: true }, { mode: 'automatic', notifyLevel: 'summary' });
    expect(p.notification?.title).toBe('Upload failed');
    expect(p.notification?.body).toMatch(/Tap to retry/);
    expect(p.retention).toBeNull(); // nothing uploaded → never delete
    expect(p.advance).toBe(false);
  });
});
