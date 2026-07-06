// __tests__/dnd/stream-mod.test.ts — stream moderation modes + actions (J10).
import { describe, it, expect } from 'vitest';
import { CHAT_MODES, allowedInMode, modeIntervalFactor, formatModAction } from '@/lib/dnd/stream-mod';

describe('allowedInMode', () => {
  it('sub-only hides non-sub lines and keeps badged ones', () => {
    expect(allowedInMode({ badges: [], hasEmote: false }, 'sub')).toBe(false);
    expect(allowedInMode({ badges: ['vip'], hasEmote: false }, 'sub')).toBe(true);
    expect(allowedInMode({ badges: ['sub'], hasEmote: false }, 'sub')).toBe(true);
  });
  it('emote-only keeps only lines containing an emote', () => {
    expect(allowedInMode({ hasEmote: true }, 'emote')).toBe(true);
    expect(allowedInMode({ hasEmote: false }, 'emote')).toBe(false);
  });
  it('off / slow / follower do not gate visibility', () => {
    for (const mode of ['off', 'slow', 'follower'] as const) {
      expect(allowedInMode({ badges: [], hasEmote: false }, mode)).toBe(true);
    }
  });
});

describe('modeIntervalFactor', () => {
  it('slows the ambient cadence only in slow mode', () => {
    expect(modeIntervalFactor('slow')).toBe(4);
    expect(modeIntervalFactor('off')).toBe(1);
    expect(modeIntervalFactor('sub')).toBe(1);
  });
});

describe('formatModAction', () => {
  it('formats each action with the username', () => {
    expect(formatModAction('timeout', 'xX_troll')).toContain('xX_troll');
    expect(formatModAction('ban', 'spammer')).toMatch(/banned/);
    expect(formatModAction('unban', 'reformed')).toMatch(/unbanned/);
  });
});

describe('CHAT_MODES', () => {
  it('exposes the five selectable modes', () => {
    expect(CHAT_MODES.map((m) => m.id)).toEqual(['off', 'slow', 'sub', 'emote', 'follower']);
  });
});
