import { describe, it, expect } from 'vitest';
import {
  MAX_RETRIES,
  deriveUploadState,
  isActiveState,
  isBlockedState,
  uploadStateLabel,
  backoffSecondsLeft,
  summarizeQueue,
  type UploadStatusRow,
  type UploadStatusContext,
} from '../../mobile/lib/uploadStatus';

// workmode Area C3 — the pure row → display-state mapping the queue-status screen renders from.
// Off-device + deterministic (the clock/network come in via ctx), the same shape as queueOrder /
// uploadFailureChoices / mediaPath. Verifies the precedence rules the screen depends on.

const NOW = 1_700_000_000_000;
const row = (over: Partial<UploadStatusRow> = {}): UploadStatusRow => ({
  id: 'u1',
  retry_count: 0,
  ...over,
});
const ctx = (over: Partial<UploadStatusContext> = {}): UploadStatusContext => ({
  now: NOW,
  online: true,
  onWifi: true,
  ...over,
});

describe('deriveUploadState precedence', () => {
  it('a row at/over the retry cap is failed, even if it would otherwise be next', () => {
    expect(deriveUploadState(row({ retry_count: MAX_RETRIES }), ctx())).toBe('failed');
    expect(deriveUploadState(row({ retry_count: MAX_RETRIES + 3 }), ctx())).toBe('failed');
  });

  it('failed wins even if the row is somehow marked active on the wire', () => {
    const r = row({ id: 'u1', retry_count: MAX_RETRIES });
    expect(deriveUploadState(r, ctx({ activeId: 'u1' }))).toBe('failed');
  });

  it('the row on the wire is uploading', () => {
    expect(deriveUploadState(row({ id: 'u1' }), ctx({ activeId: 'u1' }))).toBe('uploading');
    expect(deriveUploadState(row({ id: 'u1' }), ctx({ activeId: 'u2' }))).toBe('queued');
  });

  it('paused (0/1 or bool) beats the waiting conditions', () => {
    expect(deriveUploadState(row({ paused: 1, require_wifi: 1 }), ctx({ onWifi: false }))).toBe('paused');
    expect(deriveUploadState(row({ paused: true }), ctx())).toBe('paused');
    expect(deriveUploadState(row({ paused: 0 }), ctx())).toBe('queued');
  });

  it('require_wifi + not on Wi-Fi is wifi-waiting; on Wi-Fi it is not', () => {
    expect(deriveUploadState(row({ require_wifi: 1 }), ctx({ onWifi: false }))).toBe('wifi-waiting');
    expect(deriveUploadState(row({ require_wifi: 1 }), ctx({ onWifi: true }))).toBe('queued');
    // require_wifi absent (column not yet present) is treated as falsy — never blocks.
    expect(deriveUploadState(row(), ctx({ onWifi: false }))).toBe('queued');
  });

  it('fully offline is offline-waiting (below wifi in precedence)', () => {
    expect(deriveUploadState(row(), ctx({ online: false }))).toBe('offline-waiting');
    // wifi-waiting is more specific than offline-waiting when require_wifi is set
    expect(deriveUploadState(row({ require_wifi: 1 }), ctx({ online: false, onWifi: false }))).toBe('wifi-waiting');
  });

  it('a future next_attempt_at is backoff; a past/absent one is not', () => {
    expect(deriveUploadState(row({ next_attempt_at: NOW + 5000 }), ctx())).toBe('backoff');
    expect(deriveUploadState(row({ next_attempt_at: NOW - 5000 }), ctx())).toBe('queued');
    expect(deriveUploadState(row({ next_attempt_at: null }), ctx())).toBe('queued');
  });

  it('a plain eligible row is queued', () => {
    expect(deriveUploadState(row(), ctx())).toBe('queued');
  });
});

describe('state predicates + labels', () => {
  it('every state except failed is active', () => {
    expect(isActiveState('uploading')).toBe(true);
    expect(isActiveState('queued')).toBe(true);
    expect(isActiveState('failed')).toBe(false);
  });
  it('blocked = paused / wifi / offline', () => {
    expect(isBlockedState('paused')).toBe(true);
    expect(isBlockedState('wifi-waiting')).toBe(true);
    expect(isBlockedState('offline-waiting')).toBe(true);
    expect(isBlockedState('queued')).toBe(false);
    expect(isBlockedState('uploading')).toBe(false);
  });
  it('has a human label for every state', () => {
    for (const s of ['uploading', 'paused', 'wifi-waiting', 'offline-waiting', 'backoff', 'queued', 'failed'] as const) {
      expect(uploadStateLabel(s)).toBeTruthy();
    }
    expect(uploadStateLabel('wifi-waiting')).toMatch(/Wi-Fi/);
  });
});

describe('backoffSecondsLeft', () => {
  it('rounds up the remaining seconds, 0 when due/absent', () => {
    expect(backoffSecondsLeft(row({ next_attempt_at: NOW + 4200 }), NOW)).toBe(5);
    expect(backoffSecondsLeft(row({ next_attempt_at: NOW - 1 }), NOW)).toBe(0);
    expect(backoffSecondsLeft(row({ next_attempt_at: null }), NOW)).toBe(0);
  });
});

describe('summarizeQueue', () => {
  it('is empty + headline-less for no rows', () => {
    const s = summarizeQueue([], ctx());
    expect(s.total).toBe(0);
    expect(s.headline).toBeNull();
  });

  it('counts states and reports failures worst-first in the headline', () => {
    const rows = [
      row({ id: 'a', retry_count: MAX_RETRIES }), // failed
      row({ id: 'b' }), // queued
      row({ id: 'c', require_wifi: 1 }), // wifi-waiting (on cellular)
    ];
    const s = summarizeQueue(rows, ctx({ onWifi: false }));
    expect(s.total).toBe(3);
    expect(s.failed).toBe(1);
    expect(s.counts['wifi-waiting']).toBe(1);
    expect(s.active).toBe(2);
    expect(s.blocked).toBe(1);
    expect(s.headline).toMatch(/1 file failed/);
  });

  it('surfaces a Wi-Fi wait when nothing has failed', () => {
    const rows = [row({ id: 'a', require_wifi: 1 }), row({ id: 'b', require_wifi: 1 })];
    const s = summarizeQueue(rows, ctx({ onWifi: false }));
    expect(s.headline).toMatch(/2 files waiting for Wi-Fi/);
  });

  it('says "paused" only when every row is paused', () => {
    const allPaused = summarizeQueue([row({ id: 'a', paused: 1 }), row({ id: 'b', paused: 1 })], ctx());
    expect(allPaused.headline).toBe('Uploads paused');
    const mixed = summarizeQueue([row({ id: 'a', paused: 1 }), row({ id: 'b' })], ctx());
    expect(mixed.headline).toMatch(/Uploading/);
  });

  it('falls back to an uploading count when clean', () => {
    const s = summarizeQueue([row({ id: 'a' }), row({ id: 'b' })], ctx({ activeId: 'a' }));
    expect(s.headline).toMatch(/Uploading 2 files/);
  });
});
