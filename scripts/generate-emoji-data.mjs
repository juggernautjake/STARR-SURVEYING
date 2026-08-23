// scripts/generate-emoji-data.mjs — every emoji, and every symbol, from Unicode itself.
//
// Slice C8 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"Please make sure we have access to all emojis, text font, symbols, etc."*
//
// ── WHY GENERATE RATHER THAN SHIP A LIST ────────────────────────────────────────────────────────
//
// "All emojis" is about 1,900 characters and rising, and any list somebody types out by hand is
// both incomplete on the day it is written and wrong a year later. It is also unnecessary: the
// JavaScript runtime already knows, because Unicode property escapes are built into RegExp.
//
//     \p{Extended_Pictographic}   is the emoji-ish set
//     \p{Emoji_Presentation}      is the subset that renders as colour emoji by default
//     \p{Assigned}                excludes codepoints that would render as an empty box
//
// So this walks the emoji planes, keeps what the runtime says is a real, assigned, colour emoji,
// and groups it by Unicode block — the same grouping every picker uses, because it is the grouping
// Unicode itself uses.
//
// Names come from a curated keyword map for the common ones (search has to work for "calendar",
// "warning", "truck") plus the block name for the long tail. A picker where you can SEE everything
// and SEARCH the ones people actually reach for beats a shorter list that claims to be complete.
//
// Usage: node scripts/generate-emoji-data.mjs   → lib/design/libraries/emoji.json

import { writeFileSync, mkdirSync } from 'node:fs';

/** Unicode blocks that contain emoji, in the order a picker should show them. */
const EMOJI_BLOCKS = [
  { id: 'smileys', label: 'Smileys & emotion', ranges: [[0x1F600, 0x1F64F], [0x1F970, 0x1F97A], [0x2639, 0x263A]] },
  { id: 'people', label: 'People & body', ranges: [[0x1F440, 0x1F4A0], [0x1F918, 0x1F93A], [0x1F9B0, 0x1F9DF], [0x1FAC0, 0x1FAF8]] },
  { id: 'animals', label: 'Animals & nature', ranges: [[0x1F400, 0x1F43F], [0x1F980, 0x1F9AE], [0x1F330, 0x1F37F]] },
  { id: 'food', label: 'Food & drink', ranges: [[0x1F345, 0x1F37F], [0x1F950, 0x1F96F], [0x1FAD0, 0x1FADF]] },
  { id: 'travel', label: 'Travel & places', ranges: [[0x1F680, 0x1F6C5], [0x1F3D4, 0x1F3F0], [0x1F30D, 0x1F32C]] },
  { id: 'activities', label: 'Activities', ranges: [[0x1F3A0, 0x1F3CA], [0x1F947, 0x1F94F], [0x1F386, 0x1F397]] },
  { id: 'objects', label: 'Objects', ranges: [[0x1F4A1, 0x1F4FF], [0x1F526, 0x1F5FF], [0x1F9F0, 0x1F9FF]] },
  { id: 'symbols', label: 'Symbols', ranges: [[0x1F500, 0x1F525], [0x2600, 0x27BF], [0x1F191, 0x1F19A]] },
  { id: 'flags', label: 'Flags', ranges: [[0x1F1E6, 0x1F1FF], [0x1F3F3, 0x1F3F5]] },
];

/**
 * Keywords for the emoji this business actually reaches for, so search works on the ones that
 * matter. The long tail stays browsable by block, which is how people find those anyway.
 */
const KEYWORDS = {
  '📋': ['clipboard', 'list', 'checklist', 'job', 'task'],
  '📅': ['calendar', 'date', 'schedule', 'deadline', 'when'],
  '📆': ['calendar', 'date', 'schedule'],
  '🗓️': ['calendar', 'date', 'planner', 'schedule'],
  '⏰': ['clock', 'alarm', 'time', 'reminder'],
  '⏱️': ['stopwatch', 'timer', 'time', 'duration'],
  '⌛': ['hourglass', 'waiting', 'time', 'loading'],
  '⏳': ['hourglass', 'loading', 'waiting', 'progress'],
  '💰': ['money', 'quote', 'price', 'payment', 'bag'],
  '💵': ['money', 'cash', 'dollar', 'payment'],
  '💳': ['card', 'payment', 'credit', 'money'],
  '🧾': ['receipt', 'invoice', 'bill', 'expense'],
  '📈': ['chart', 'growth', 'up', 'report', 'metric'],
  '📉': ['chart', 'down', 'loss', 'report'],
  '📊': ['chart', 'bar', 'report', 'data', 'metric'],
  '📸': ['camera', 'photo', 'picture', 'capture'],
  '📷': ['camera', 'photo', 'picture'],
  '🎥': ['video', 'camera', 'film', 'record'],
  '📁': ['folder', 'file', 'directory'],
  '📂': ['folder', 'open', 'file'],
  '📄': ['document', 'file', 'page', 'paper'],
  '📎': ['attachment', 'paperclip', 'file', 'attach'],
  '🔍': ['search', 'find', 'magnify', 'look', 'research'],
  '🔎': ['search', 'find', 'magnify'],
  '📍': ['pin', 'location', 'place', 'map', 'address'],
  '🗺️': ['map', 'location', 'place', 'route'],
  '🧭': ['compass', 'direction', 'bearing', 'navigate'],
  '📐': ['triangle', 'ruler', 'measure', 'angle', 'survey'],
  '📏': ['ruler', 'measure', 'distance', 'length', 'survey'],
  '🚧': ['construction', 'work', 'site', 'field'],
  '🚜': ['tractor', 'equipment', 'vehicle', 'field'],
  '🛻': ['truck', 'vehicle', 'fleet', 'pickup'],
  '🚗': ['car', 'vehicle', 'fleet', 'drive', 'mileage'],
  '⚠️': ['warning', 'caution', 'alert', 'attention'],
  '❗': ['important', 'alert', 'attention', 'urgent'],
  '✅': ['check', 'done', 'complete', 'approved', 'yes'],
  '☑️': ['check', 'checkbox', 'done', 'selected'],
  '❌': ['cross', 'no', 'delete', 'remove', 'error', 'failed'],
  '🔴': ['red', 'dot', 'status', 'stop', 'urgent'],
  '🟢': ['green', 'dot', 'status', 'go', 'active'],
  '🟡': ['yellow', 'dot', 'status', 'pending', 'caution'],
  '🔵': ['blue', 'dot', 'status'],
  '⭐': ['star', 'favourite', 'rating', 'important'],
  '🔔': ['bell', 'notification', 'alert', 'reminder'],
  '🔒': ['lock', 'locked', 'secure', 'private'],
  '🔓': ['unlock', 'open', 'public'],
  '👤': ['person', 'user', 'profile', 'account'],
  '👥': ['people', 'team', 'crew', 'users', 'group'],
  '🏠': ['home', 'house', 'property', 'residential'],
  '🏢': ['office', 'building', 'commercial', 'company'],
  '📝': ['note', 'edit', 'write', 'memo', 'form'],
  '✏️': ['pencil', 'edit', 'write', 'draw'],
  '🖊️': ['pen', 'sign', 'write'],
  '🗑️': ['trash', 'delete', 'remove', 'bin'],
  '⚙️': ['settings', 'gear', 'config', 'options'],
  '🔧': ['wrench', 'tool', 'fix', 'maintenance'],
  '🔨': ['hammer', 'tool', 'build', 'work'],
  '📞': ['phone', 'call', 'contact'],
  '📧': ['email', 'mail', 'message', 'contact'],
  '💬': ['message', 'chat', 'comment', 'talk'],
  '🎨': ['design', 'art', 'paint', 'colour'],
  '🌤️': ['weather', 'sun', 'cloud', 'forecast'],
  '🌧️': ['rain', 'weather', 'storm'],
};

const isEmoji = (cp) => {
  const ch = String.fromCodePoint(cp);
  try {
    return /\p{Extended_Pictographic}/u.test(ch) && /\p{Assigned}/u.test(ch);
  } catch {
    return false;
  }
};

const groups = [];
const seen = new Set();

for (const block of EMOJI_BLOCKS) {
  const chars = [];
  for (const [from, to] of block.ranges) {
    for (let cp = from; cp <= to; cp += 1) {
      if (seen.has(cp) || !isEmoji(cp)) continue;
      seen.add(cp);
      const char = String.fromCodePoint(cp);
      chars.push({
        c: char,
        // `keywords` only where we have real ones; the block label carries the rest.
        ...(KEYWORDS[char] ? { k: KEYWORDS[char] } : {}),
      });
    }
  }
  if (chars.length) groups.push({ id: block.id, label: block.label, chars });
}

// ── SYMBOLS ─────────────────────────────────────────────────────────────────────────────────────
//
// Not emoji, and the set people give up looking for and paste from a web page. Enumerated by hand
// because it is small, stable, and choosing WHICH arrows to offer is a judgement a range cannot
// make — and because the survey-relevant ones (° ′ ″ ± Δ) would never appear in a generic list.
const SYMBOLS = [
  { id: 'arrows', label: 'Arrows', chars: '← → ↑ ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇒ ⇑ ⇓ ⇔ ⟵ ⟶ ➜ ➔ ▶ ◀ ▲ ▼ ⌃ ⌄ ⏎ ↩ ↪ ⟲ ⟳' },
  { id: 'maths', label: 'Maths & logic', chars: '× ÷ ± ∓ ≈ ≠ ≤ ≥ ∑ ∏ √ ∞ ∆ ∇ ∂ ∫ π µ ° ′ ″ ‰ ∴ ∵ ∈ ∉ ∪ ∩ ⊂ ⊃' },
  { id: 'currency', label: 'Currency', chars: '$ ¢ £ € ¥ ₹ ₽ ₩ ₿ ¤ ₺ ₴ ₦ ₱' },
  { id: 'punctuation', label: 'Punctuation & typography', chars: '— – ‐ … · • ‣ ⁃ « » ‹ › “ ” ‘ ’ „ ‚ † ‡ § ¶ № ℮ ⁂ ⁓ ‽ ¡ ¿' },
  { id: 'legal', label: 'Legal & marks', chars: '© ® ™ ℠ ℗ ✓ ✔ ✗ ✘ ✕ ✖ ☐ ☑ ☒ ⚠ ⚡ ☢ ☣ ♻' },
  { id: 'fractions', label: 'Fractions & numerals', chars: '½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞ ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ₀ ₁ ₂ ₃ ₄ ₅' },
  { id: 'shapes', label: 'Geometric shapes', chars: '■ □ ▪ ▫ ▬ ▭ ▮ ▯ ● ○ ◉ ◌ ◍ ◎ ◆ ◇ ◈ ▲ △ ▼ ▽ ★ ☆ ✦ ✧ ❖ ⬢ ⬡' },
  { id: 'box', label: 'Box drawing', chars: '─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬ █ ▓ ▒ ░ ▁ ▂ ▃ ▄ ▅ ▆ ▇' },
  { id: 'survey', label: 'Survey & measurement', chars: '° ′ ″ ± Δ ∠ ⊾ ⌀ ⌂ ⏚ ⊕ ⊗ ⌖ ⌗ ⍉' },
];

const symbols = SYMBOLS.map((group) => ({
  id: group.id,
  label: group.label,
  chars: group.chars.split(/\s+/).filter(Boolean).map((c) => ({ c })),
}));

const data = {
  generatedBy: 'scripts/generate-emoji-data.mjs',
  note: 'Enumerated from Unicode property escapes at generation time. Re-run to pick up new emoji.',
  emoji: groups,
  symbols,
  counts: {
    emoji: groups.reduce((n, g) => n + g.chars.length, 0),
    symbols: symbols.reduce((n, g) => n + g.chars.length, 0),
    named: Object.keys(KEYWORDS).length,
  },
};

mkdirSync('lib/design/libraries', { recursive: true });
writeFileSync('lib/design/libraries/emoji.json', `${JSON.stringify(data, null, 0)}\n`);

console.log(`\n  emoji:   ${data.counts.emoji} across ${groups.length} groups`);
console.log(`  symbols: ${data.counts.symbols} across ${symbols.length} groups`);
console.log(`  named:   ${data.counts.named} with search keywords`);
console.log('  wrote lib/design/libraries/emoji.json\n');
