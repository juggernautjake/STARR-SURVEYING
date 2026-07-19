// __tests__/dnd/stream-mod.test.ts — stream moderation modes + actions (J10).
import { describe, it, expect } from 'vitest';
import {
  CHAT_MODES, allowedInMode, modeIntervalFactor, formatModAction, formatDuration,
  applyModAction, activeSilences, isSilenced, TIMEOUT_DURATIONS, DEFAULT_TIMEOUT_SEC,
} from '@/lib/dnd/stream-mod';

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

// Owner 2026-07-19: timeouts get a real duration, expire on their own, and can be
// ended early — and the streamer (not just the DM) can unban.
describe('timeout durations + silence state', () => {
  const T0 = 1_000_000;

  it('formats a duration in the system line', () => {
    expect(formatModAction('timeout', 'troll', 300)).toContain('5m');
    expect(formatModAction('untimeout', 'troll')).toMatch(/lifted/);
  });

  it('formats durations readably', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('a timeout expires on its own; a ban does not', () => {
    const timed = applyModAction([], { type: 'timeout', username: 'troll', durationSec: 60 }, T0);
    expect(isSilenced(timed, 'troll', T0 + 59_000)).toBe(true);
    expect(isSilenced(timed, 'troll', T0 + 61_000)).toBe(false);

    const banned = applyModAction([], { type: 'ban', username: 'spammer' }, T0);
    expect(isSilenced(banned, 'spammer', T0 + 999_999_999)).toBe(true);
  });

  it('untimeout lifts a timeout early', () => {
    let s = applyModAction([], { type: 'timeout', username: 'troll', durationSec: 600 }, T0);
    s = applyModAction(s, { type: 'untimeout', username: 'troll' }, T0 + 1000);
    expect(isSilenced(s, 'troll', T0 + 2000)).toBe(false);
  });

  it('untimeout will NOT quietly release a permanent ban', () => {
    let s = applyModAction([], { type: 'ban', username: 'spammer' }, T0);
    s = applyModAction(s, { type: 'untimeout', username: 'spammer' }, T0 + 1000);
    expect(isSilenced(s, 'spammer', T0 + 2000)).toBe(true);
  });

  it('unban clears both a ban and a timeout', () => {
    const banned = applyModAction([], { type: 'ban', username: 'a' }, T0);
    expect(isSilenced(applyModAction(banned, { type: 'unban', username: 'a' }, T0), 'a', T0)).toBe(false);
    const timed = applyModAction([], { type: 'timeout', username: 'b', durationSec: 600 }, T0);
    expect(isSilenced(applyModAction(timed, { type: 'unban', username: 'b' }, T0), 'b', T0)).toBe(false);
  });

  it('re-timing an already-silenced viewer replaces the old deadline', () => {
    let s = applyModAction([], { type: 'timeout', username: 'troll', durationSec: 3600 }, T0);
    s = applyModAction(s, { type: 'timeout', username: 'troll', durationSec: 30 }, T0);
    expect(s.filter((x) => x.username === 'troll')).toHaveLength(1);
    expect(isSilenced(s, 'troll', T0 + 31_000)).toBe(false);
  });

  it('activeSilences drops the expired and keeps the rest', () => {
    let s = applyModAction([], { type: 'timeout', username: 'gone', durationSec: 10 }, T0);
    s = applyModAction(s, { type: 'ban', username: 'stays' }, T0);
    expect(activeSilences(s, T0 + 20_000).map((x) => x.username)).toEqual(['stays']);
  });

  it('offers sane duration presets', () => {
    expect(TIMEOUT_DURATIONS.map((d) => d.sec)).toContain(DEFAULT_TIMEOUT_SEC);
    expect(TIMEOUT_DURATIONS.every((d) => d.sec > 0)).toBe(true);
  });
});
