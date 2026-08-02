'use client';
// app/AndrewAsh/studio/pages/[id]/AddBlockPalette.tsx — choosing a block to add.
//
// Grouped by what Andrew is trying to DO ("say something", "show something", "ask for the job",
// "keep it live") rather than by implementation. A flat list of thirty widget types is a wall, and
// the person reading it does not know what a "specList" is — they know they want to list their
// studio specs.
//
// Search is here because thirty is past the number a person scans. It matches the label AND the hint,
// so typing "price" finds "Coaching rates" even though the word "price" is not in its name.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { WIDGET_CATALOG, WIDGET_GROUPS, type WidgetType } from '@/lib/voice/widgets';

export default function AddBlockPalette({
  onPick,
  onClose,
}: {
  onPick: (type: WidgetType) => void;
  onClose: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WIDGET_CATALOG;
    return WIDGET_CATALOG.filter(
      (w) => w.label.toLowerCase().includes(q) || w.hint.toLowerCase().includes(q) || w.type.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="vaPaletteBackdrop" role="dialog" aria-label="Add a block" onClick={onClose}>
      <div className="vaPalette" onClick={(e) => e.stopPropagation()}>
        <div className="vaPaletteHead">
          <Search size={15} aria-hidden style={{ color: 'var(--va-text-muted)', flex: 'none' }} />
          <input
            ref={inputRef}
            className="vaPaletteSearch"
            placeholder="What do you want to add?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="vaPaletteBody">
          {WIDGET_GROUPS.map((group) => {
            const items = filtered.filter((w) => w.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="vaPaletteGroup">
                  {group}
                  {group === 'Live' && (
                    <span className="vaMuted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                      {' '}
                      — these update themselves
                    </span>
                  )}
                </p>
                <div className="vaPaletteGrid">
                  {items.map((item) => (
                    <button key={item.type} type="button" className="vaPaletteItem" onClick={() => onPick(item.type)}>
                      <span className="vaPaletteItemLabel">{item.label}</span>
                      <span className="vaPaletteItemHint">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="vaMuted" style={{ padding: '30px 0', textAlign: 'center', fontSize: '0.875rem' }}>
              Nothing matches “{query}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
