'use client';
// CommandPalette — ⌘K / Ctrl-K to go anywhere (P4-4, audit D-6).
//
// "The library has excellent search; nothing else does." Finding a character meant remembering which
// campaign it was in; finding a campaign meant scrolling the lobby.
//
// It mounts in the /dnd layout, so it is available on every page — which is the entire point of a palette
// and also the reason it must cost nothing until summoned: no fetch, no listener beyond one keydown, and
// no DOM until it opens.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { groupPalette, PALETTE_GROUP_LABELS, type ScoredItem } from '@/lib/dnd/palette';

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ScoredItem[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against an older, slower response overwriting a newer one — the classic search race, where
  // typing "vex" fast enough leaves you looking at the results for "v".
  const seq = useRef(0);

  // ⌘K / Ctrl-K anywhere. Escape closes. Registered once, regardless of whether the palette is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      // Focus after paint, or the input is not in the DOM yet.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ('');
      setItems([]);
    }
  }, [open]);

  // Fetch on every query change, including the empty one — an empty query returns the ACTIONS, so opening
  // the palette shows what it can do rather than an empty box.
  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const t = window.setTimeout(() => {
      fetch(`/api/dnd/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (mine !== seq.current) return; // a newer keystroke already won
          setItems((j?.items ?? []) as ScoredItem[]);
          setActive(0);
        })
        .catch(() => {});
      // A short debounce: enough to skip the intermediate letters of a fast typist, short enough that the
      // list feels live.
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active].href); }
  };

  if (!open) return null;

  const groups = groupPalette(items);
  // The flat rank order drives keyboard selection; the groups are only a visual arrangement of the same
  // list, so the highlighted row and the Enter target can never disagree.
  let flatIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search and commands"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(1,10,19,0.62)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: 'var(--hx-panel, #0b1a2c)',
          border: '1px solid var(--hx-line, #1e2d3d)', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 24px 60px -20px rgba(1,10,19,0.9)',
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search characters, campaigns, content, rules…"
          aria-label="Search characters, campaigns, content and rules"
          style={{
            width: '100%', padding: '14px 16px', fontSize: 15, background: 'transparent',
            border: 'none', borderBottom: '1px solid var(--hx-line, #1e2d3d)', color: 'var(--hx-text, #e8e6f0)', outline: 'none',
          }}
        />

        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {groups.length === 0 && (
            <p style={{ margin: 0, padding: '18px 16px', fontSize: 13, color: 'var(--hx-muted)' }}>
              {q ? `Nothing matches “${q}”.` : 'Start typing to search.'}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.kind}>
              <div style={{ padding: '8px 16px 4px', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
                {PALETTE_GROUP_LABELS[g.kind]}
              </div>
              {g.items.map((it) => {
                flatIndex += 1;
                const isActive = flatIndex === active;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => go(it.href)}
                    onMouseEnter={() => setActive(items.indexOf(it))}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px',
                      background: isActive ? 'rgba(var(--hx-teal-1-rgb),0.14)' : 'transparent',
                      border: 'none', cursor: 'pointer', color: 'var(--hx-text, #e8e6f0)',
                    }}
                  >
                    <span style={{ fontSize: 13.5 }}>{it.title}</span>
                    {it.subtitle && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--hx-muted)' }}>{it.subtitle}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: '6px 16px 8px', fontSize: 10.5, color: 'var(--hx-muted)', borderTop: '1px solid var(--hx-line, #1e2d3d)' }}>
          ↑↓ to move · ↵ to open · esc to close
        </div>
      </div>
    </div>
  );
}
