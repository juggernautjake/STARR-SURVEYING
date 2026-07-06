// app/admin/components/learn/FlashcardsPanel.tsx
//
// Per-module flashcards for the FS module page. Lists this module's built-in +
// user cards, studies them through the shared <FlashcardViewer/>, and lets the
// student create their own — all via the existing flashcards API
// (/api/admin/learn/flashcards). No new backend.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Layers, Plus, Trash2, GraduationCap } from 'lucide-react';
import FlashcardViewer from '@/app/admin/components/FlashcardViewer';

interface ApiCard {
  id: string; term: string; definition: string;
  hint_1?: string | null; hint_2?: string | null; hint_3?: string | null;
  keywords?: string[] | null; module_id?: string | null; lesson_id?: string | null;
  source: 'builtin' | 'user';
}

export default function FlashcardsPanel({ moduleId, moduleNumber }: { moduleId: string; moduleNumber?: number }) {
  const [cards, setCards] = useState<ApiCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studying, setStudying] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [hint, setHint] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // discovered=false → show ALL of this module's built-in cards (the student
      // is actively studying the module), alongside their own cards.
      // FS built-in cards are scoped by category (module_id FKs a different course).
      const res = await fetch(`/api/admin/learn/flashcards?category=fs:${moduleId}&discovered=false`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not load flashcards.'); }
      else setCards(data.cards || []);
    } catch { setError('Network error — please try again.'); }
    setLoading(false);
  }, [moduleId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!term.trim() || !definition.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/learn/flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'user', category: `fs:${moduleId}`, term, definition, hint_1: hint || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Could not save the card.');
      else { setTerm(''); setDefinition(''); setHint(''); setShowCreate(false); load(); }
    } catch { setError('Network error — please try again.'); }
    setSaving(false);
  }

  async function remove(id: string) {
    try {
      await fetch(`/api/admin/learn/flashcards?id=${id}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  }

  const viewerCards = cards.map((c) => ({
    id: c.id, term: c.term, definition: c.definition,
    hints: [c.hint_1, c.hint_2, c.hint_3].filter(Boolean) as string[],
    linked_keywords: c.keywords || [],
    linked_module_id: c.module_id || undefined, linked_lesson_id: c.lesson_id || undefined,
  }));
  const userCards = cards.filter((c) => c.source === 'user');
  const builtinCount = cards.length - userCards.length;

  if (studying && viewerCards.length > 0) {
    return (
      <div className="fs-module__flashcards">
        <FlashcardViewer cards={viewerCards} deckName={`Module ${moduleNumber ?? ''} Flashcards`.trim()} onBack={() => setStudying(false)} />
      </div>
    );
  }

  return (
    <div className="fs-module__flashcards">
      <div className="fs-flash__head">
        <div className="fs-flash__intro">
          <h3><Layers size={17} style={{ verticalAlign: '-3px', marginRight: '.4rem' }} />Flashcards</h3>
          <p>Review the key terms for this module, then make your own cards for anything you want to drill.</p>
        </div>
        <div className="fs-flash__actions">
          {viewerCards.length > 0 && (
            <button className="admin-btn admin-btn--primary" onClick={() => setStudying(true)}>
              <GraduationCap size={15} /> Study {viewerCards.length} card{viewerCards.length === 1 ? '' : 's'}
            </button>
          )}
          <button className="admin-btn admin-btn--secondary" onClick={() => setShowCreate((s) => !s)}>
            <Plus size={15} /> New card
          </button>
        </div>
      </div>

      {error && <div className="ai-tutor__error" style={{ marginBottom: '.75rem' }}>{error}</div>}

      {showCreate && (
        <div className="fs-flash__create">
          <input className="fs-flash__input" placeholder="Term (front)" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={200} />
          <textarea className="fs-flash__input" placeholder="Definition (back)" rows={3} value={definition} onChange={(e) => setDefinition(e.target.value)} maxLength={1000} />
          <input className="fs-flash__input" placeholder="Hint (optional)" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={200} />
          <div className="fs-flash__create-actions">
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={create} disabled={saving || !term.trim() || !definition.trim()}>
              {saving ? 'Saving…' : 'Save card'}
            </button>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="fs-practice__loading"><Loader2 size={20} className="spin" /> Loading flashcards…</div>
      ) : cards.length === 0 ? (
        <div className="admin-empty" style={{ padding: '2rem' }}>
          <div className="admin-empty__icon"><Layers size={30} strokeWidth={1.5} /></div>
          <div className="admin-empty__title">No flashcards yet for this module</div>
          <div className="admin-empty__desc">Built-in cards are on the way — in the meantime, create your own with <b>New card</b> above.</div>
        </div>
      ) : (
        <div className="fs-flash__list">
          <div className="fs-flash__list-meta">{builtinCount} built-in · {userCards.length} your card{userCards.length === 1 ? '' : 's'}</div>
          {cards.map((c) => (
            <div key={c.id} className="fs-flash__row">
              <span className={`fs-flash__src fs-flash__src--${c.source}`}>{c.source === 'user' ? 'Yours' : 'Built-in'}</span>
              <span className="fs-flash__term">{c.term}</span>
              <span className="fs-flash__def">{c.definition}</span>
              {c.source === 'user' && (
                <button className="fs-flash__del" title="Delete card" aria-label="Delete card" onClick={() => remove(c.id)}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
