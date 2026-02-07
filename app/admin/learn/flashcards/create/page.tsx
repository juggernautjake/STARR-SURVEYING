// app/admin/learn/flashcards/create/page.tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePageError } from '../../../hooks/usePageError';

export default function CreateFlashcardsPage() {
  const { safeFetch, safeAction } = usePageError('CreateFlashcardsPage');
  const [deckName, setDeckName] = useState('My Cards');
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [hint1, setHint1] = useState('');
  const [hint2, setHint2] = useState('');
  const [hint3, setHint3] = useState('');
  const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);

  async function saveCard() {
    if (!term.trim() || !definition.trim()) return;
    setSaving(true);
    const hints = [hint1, hint2, hint3].filter(h => h.trim());
    const linked_keywords = keywords.split(',').map(k => k.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/admin/learn/flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: term.trim(), definition: definition.trim(), hints, deck_name: deckName.trim() || 'My Cards', linked_keywords }),
      });
      if (res.ok) {
        setSaved(prev => [...prev, term.trim()]);
        setTerm(''); setDefinition(''); setHint1(''); setHint2(''); setHint3(''); setKeywords('');
      }
    } catch (err) { console.error('CreateFlashcardsPage: failed to save card', err); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/flashcards" className="learn__back">← Back to Flashcards</Link>
        <h2 className="learn__title">✚ Create Your Own Flashcards</h2>
        <p className="learn__subtitle">Build your own study cards with terms, definitions, and up to 3 hints each.</p>
      </div>

      <div style={{ maxWidth: '600px' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label className="admin-label">Deck Name</label>
          <input type="text" className="admin-input" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="e.g. My Study Cards" />
        </div>

        <div className="admin-card" style={{ marginBottom: '1rem' }}>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Term *</label>
            <input type="text" className="admin-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Vara" />
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Definition *</label>
            <textarea className="admin-textarea" value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder="e.g. A Spanish unit of measurement equal to approximately 33.333 inches" />
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Hint 1 (optional)</label>
            <input type="text" className="admin-input" value={hint1} onChange={(e) => setHint1(e.target.value)} placeholder="e.g. Think Spanish ruler" />
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Hint 2 (optional)</label>
            <input type="text" className="admin-input" value={hint2} onChange={(e) => setHint2(e.target.value)} placeholder="e.g. About 2.78 feet" />
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Hint 3 (optional)</label>
            <input type="text" className="admin-input" value={hint3} onChange={(e) => setHint3(e.target.value)} placeholder="e.g. Rhymes with Sahara" />
          </div>
          <div style={{ marginBottom: '.75rem' }}>
            <label className="admin-label">Keywords (comma-separated, for &quot;Read More&quot; links)</label>
            <input type="text" className="admin-input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. vara, units, spanish, measurements" />
          </div>
          <button className="admin-btn admin-btn--primary" onClick={saveCard} disabled={saving || !term.trim() || !definition.trim()}>
            {saving ? 'Saving...' : '💾 Save Card & Add Another'}
          </button>
        </div>

        {saved.length > 0 && (
          <div className="admin-card admin-card--accent-green">
            <div className="admin-card__label">Cards Saved This Session</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#374151' }}>
              {saved.map((s, i) => <span key={i} style={{ display: 'inline-block', background: '#ECFDF5', padding: '.15rem .5rem', borderRadius: '4px', marginRight: '.35rem', marginBottom: '.25rem', fontSize: '.8rem' }}>{s}</span>)}
            </div>
            <div style={{ marginTop: '.75rem' }}>
              <Link href={`/admin/learn/flashcards/${encodeURIComponent(deckName)}?type=user`} className="admin-btn admin-btn--secondary admin-btn--sm">Study These Cards →</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
