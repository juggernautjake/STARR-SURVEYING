import { describe, it, expect } from 'vitest';
import { retentionAfterUpload, normalizeRetentionPref, retentionPrefLabel } from '../../mobile/lib/uploadRetention';

// workmode Area C5/C — the pure "delete from phone after a CONFIRMED upload" decision. The owner wants the
// OPTION to delete once uploaded (the queue currently auto-deletes). Never deletes before confirmation.

describe('retentionAfterUpload — the confirmation guard', () => {
  it('does NOTHING until the upload is confirmed server-side (bytes are never risked)', () => {
    for (const pref of ['ask', 'keep', 'delete'] as const) {
      expect(retentionAfterUpload(pref, { uploadConfirmed: false })).toEqual({
        deleteWorkingCopy: false, prompt: false, offerCameraRollDelete: false,
      });
    }
  });
});

describe('retentionAfterUpload — post-confirmation choices', () => {
  it('delete → removes the working copy automatically', () => {
    expect(retentionAfterUpload('delete', { uploadConfirmed: true })).toMatchObject({ deleteWorkingCopy: true, prompt: false });
  });
  it('keep → leaves everything', () => {
    expect(retentionAfterUpload('keep', { uploadConfirmed: true })).toEqual({ deleteWorkingCopy: false, prompt: false, offerCameraRollDelete: false });
  });
  it('ask → prompts, deletes nothing yet', () => {
    expect(retentionAfterUpload('ask', { uploadConfirmed: true })).toMatchObject({ deleteWorkingCopy: false, prompt: true });
  });
  it('only offers camera-roll deletion when the media was saved to the camera roll', () => {
    expect(retentionAfterUpload('delete', { uploadConfirmed: true, savedToCameraRoll: true }).offerCameraRollDelete).toBe(true);
    expect(retentionAfterUpload('delete', { uploadConfirmed: true, savedToCameraRoll: false }).offerCameraRollDelete).toBe(false);
  });

  it('the ASK prompt can offer camera-roll deletion too (it prompts, never auto-deletes)', () => {
    const r = retentionAfterUpload('ask', { uploadConfirmed: true, savedToCameraRoll: true });
    expect(r.prompt).toBe(true);
    expect(r.deleteWorkingCopy).toBe(false);   // still nothing auto-deleted — the user decides in the prompt
    expect(r.offerCameraRollDelete).toBe(true);
  });

  it('KEEP never offers camera-roll deletion, even when a camera-roll copy exists (keep = keep EVERYTHING)', () => {
    // The safety property: a "keep on phone" preference must not surface a delete-the-camera-roll affordance,
    // or the standing choice quietly becomes a delete path for the user's own photo library.
    const r = retentionAfterUpload('keep', { uploadConfirmed: true, savedToCameraRoll: true });
    expect(r).toEqual({ deleteWorkingCopy: false, prompt: false, offerCameraRollDelete: false });
  });
});

describe('normalizeRetentionPref + labels', () => {
  it('passes valid prefs, defaults anything else to ask (never auto-delete on a bad value)', () => {
    expect(normalizeRetentionPref('delete')).toBe('delete');
    expect(normalizeRetentionPref('keep')).toBe('keep');
    expect(normalizeRetentionPref(undefined)).toBe('ask');
    expect(normalizeRetentionPref('garbage')).toBe('ask');
  });
  it('has a label for each pref', () => {
    for (const p of ['ask', 'keep', 'delete'] as const) expect(retentionPrefLabel(p)).toBeTruthy();
  });
});
