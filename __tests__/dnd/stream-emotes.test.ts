// __tests__/dnd/stream-emotes.test.ts — emote parsing (J8).
import { describe, it, expect } from 'vitest';
import { parseEmotes } from '@/lib/dnd/stream-emotes';

describe('parseEmotes', () => {
  it('replaces known bare emote words with glyphs', () => {
    const segs = parseEmotes('POGGERS nat 20 KEKW');
    const emotes = segs.filter((s) => s.type === 'emote');
    expect(emotes.map((e) => (e as { name: string }).name)).toEqual(['POGGERS', 'KEKW']);
    expect(segs.some((s) => s.type === 'text' && /nat 20/.test(s.value))).toBe(true);
  });
  it('is case-insensitive and supports :colon: syntax', () => {
    const segs = parseEmotes('so :monkaS: much kappa');
    const glyphs = segs.filter((s) => s.type === 'emote').map((e) => (e as { glyph: string }).glyph);
    expect(glyphs).toContain('😰'); // monkaS
    expect(glyphs).toContain('😏'); // kappa
  });
  it('leaves unknown tokens and plain text alone', () => {
    const segs = parseEmotes('hello :notAnEmote: world');
    expect(segs.every((s) => s.type === 'text')).toBe(true);
    expect(segs.map((s) => (s as { value: string }).value).join('')).toBe('hello :notAnEmote: world');
  });
  it('always returns at least one segment', () => {
    expect(parseEmotes('')).toEqual([{ type: 'text', value: '' }]);
  });
});
