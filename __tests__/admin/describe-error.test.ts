import { describe, it, expect } from 'vitest';
import { describeError } from '@/lib/errorHandler';

describe('describeError — turns arbitrary thrown values into useful messages', () => {
  it('keeps an Error message + stack', () => {
    const e = new Error('boom');
    const out = describeError(e);
    expect(out.message).toBe('boom');
    expect(out.stack).toBe(e.stack);
  });

  it('extracts a failed-image resource Event (no more "[object Event]")', () => {
    const img = { tagName: 'IMG', src: 'https://example.com/broken.png' };
    const evt = new Event('error');
    Object.defineProperty(evt, 'target', { value: img });
    const out = describeError(evt);
    expect(out.message).toBe('Failed to load img: https://example.com/broken.png');
  });

  it('falls back to the event type for a target-less Event', () => {
    const out = describeError(new Event('error'));
    expect(out.message).toBe('Unhandled "error" event');
  });

  it('unwraps a PromiseRejectionEvent reason', () => {
    // jsdom lacks PromiseRejectionEvent constructor in some setups; guard.
    if (typeof PromiseRejectionEvent === 'undefined') return;
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject('x').catch(() => {}) as unknown as Promise<unknown>,
      reason: new Error('inner'),
    });
    expect(describeError(evt).message).toBe('inner');
  });

  it('reads an ErrorEvent message + source location', () => {
    // ErrorEvent is a browser global; skip under the node test env.
    if (typeof ErrorEvent === 'undefined') return;
    const evt = new ErrorEvent('error', { message: 'kaboom', filename: 'a.js', lineno: 12, colno: 3 });
    expect(describeError(evt).message).toBe('kaboom (a.js:12:3)');
  });

  it('handles strings, null, and plain objects', () => {
    expect(describeError('just a string').message).toBe('just a string');
    expect(describeError(null).message).toContain('Unknown error');
    expect(describeError({ code: 42 }).message).toBe('{"code":42}');
  });
});
