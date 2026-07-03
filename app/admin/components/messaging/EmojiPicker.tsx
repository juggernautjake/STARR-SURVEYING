// app/admin/components/messaging/EmojiPicker.tsx
// Searchable, categorized emoji picker used by the message composers. Replaces
// the old hardcoded 12–16 emoji grids with the full curated set + search.
'use client';

import { useMemo, useState } from 'react';
import { EMOJI_CATEGORIES, searchEmojis } from '@/lib/messages/emojis';

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [active, setActive] = useState(EMOJI_CATEGORIES[0].key);
  const [query, setQuery] = useState('');

  const results = useMemo(() => (query ? searchEmojis(query) : null), [query]);
  const category = EMOJI_CATEGORIES.find((c) => c.key === active) ?? EMOJI_CATEGORIES[0];

  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <input
        className="emoji-picker__search"
        type="text"
        placeholder="Search emojis…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {!query && (
        <div className="emoji-picker__tabs" role="tablist">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active === c.key}
              className={`emoji-picker__tab ${active === c.key ? 'emoji-picker__tab--active' : ''}`}
              onClick={() => setActive(c.key)}
              title={c.label}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-picker__grid" role="listbox" aria-label={query ? 'Search results' : category.label}>
        {query ? (
          results && results.length > 0 ? (
            results.map((e, i) => (
              <button key={`${e}-${i}`} type="button" className="emoji-picker__emoji" onClick={() => onPick(e)}>{e}</button>
            ))
          ) : (
            <p className="emoji-picker__empty">No emojis found.</p>
          )
        ) : (
          category.emojis.map(([e], i) => (
            <button key={`${e}-${i}`} type="button" className="emoji-picker__emoji" onClick={() => onPick(e)} aria-label={category.label}>{e}</button>
          ))
        )}
      </div>
    </div>
  );
}
