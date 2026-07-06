// lib/dnd/stream-emotes.ts — Twitch-style emote parsing for the streamer chat (Phase
// J8). Maps known emote tokens (bare words like POGGERS, or :colon: syntax) to a glyph
// the overlay renders as a styled emote. Pure + deterministic so it's unit-tested and
// client-safe. (Self-contained: emotes are emoji, not external images.)

// Keys are lowercased; matching is case-insensitive.
const EMOTES: Record<string, string> = {
  kekw: '😹', lul: '😂', omegalul: '😹', poggers: '😮', pog: '😮', pogchamp: '😲',
  monkas: '😰', pepelaugh: '😆', pepehands: '😢', sadge: '😔', copium: '🫠', hopium: '🙏',
  gigachad: '🗿', based: '😎', ez: '😎', clap: '👏', kappa: '😏', '5head': '🧠',
  weirdchamp: '😬', catjam: '🐱', peepoclap: '👏', o7: '🫡', d: '😄', ratjam: '🐀',
  gg: '🎉', f: '🇫', w: '🆙', l: '📉', modcheck: '🔎', bonk: '🔨',
};

export type Segment = { type: 'text'; value: string } | { type: 'emote'; name: string; glyph: string };

const NAMES = Object.keys(EMOTES).sort((a, b) => b.length - a.length); // longest-first so 5Head beats Head

/** Split a message into text + emote segments. Unknown `:tokens:` stay as text. */
export function parseEmotes(text: string): Segment[] {
  const re = new RegExp(`:([a-z0-9]+):|\\b(${NAMES.join('|')})\\b`, 'gi');
  const segs: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'text', value: text.slice(last, m.index) });
    const raw = m[1] ?? m[2];
    const glyph = EMOTES[raw.toLowerCase()];
    if (glyph) segs.push({ type: 'emote', name: raw, glyph });
    else segs.push({ type: 'text', value: m[0] }); // unknown :token: → literal
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'text', value: text.slice(last) });
  return segs.length ? segs : [{ type: 'text', value: text }];
}
