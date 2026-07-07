// __tests__/dnd/stream-alerts.test.ts — event alert formatting (J9).
import { describe, it, expect } from 'vitest';
import { formatAlert, isAlertType } from '@/lib/dnd/stream-alerts';

describe('formatAlert', () => {
  it('formats each alert type with emoji + message', () => {
    expect(formatAlert({ type: 'sub', username: 'Bob' }).text).toBe('Bob just subscribed!');
    expect(formatAlert({ type: 'resub', username: 'Bob', detail: '12' }).text).toContain('12 months');
    expect(formatAlert({ type: 'donation', username: 'Bob', detail: '$5' }).text).toContain('$5');
    expect(formatAlert({ type: 'raid', username: 'Bob', detail: '300' }).text).toContain('300 viewers');
    expect(formatAlert({ type: 'sub', username: 'Bob' }).emoji).toBe('⭐');
  });
  it('falls back to "Someone" for a blank username', () => {
    expect(formatAlert({ type: 'sub', username: '' }).text).toBe('Someone just subscribed!');
  });
  it('validates alert types', () => {
    expect(isAlertType('raid')).toBe(true);
    expect(isAlertType('nope')).toBe(false);
  });
});
