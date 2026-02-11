// app/admin/learn/flashcard-bank/page.tsx — Flashcard Bank: browse all company + personal flashcards
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';
import { useToast } from '../../components/Toast';

interface Flashcard {
  id: string; term: string; definition: string;
  hint_1?: string; hint_2?: string; hint_3?: string;
  keywords?: string[]; tags?: string[];
  source: 'builtin' | 'user'; module_id?: string; lesson_id?: string;
  module_title?: string;
  times_reviewed?: number; times_correct?: number;
  created_at?: string;
}

type Section = 'company' | 'personal';

export default function FlashcardBankPage() {
  const { safeFetch } = usePageError('FlashcardBankPage');
  const { addToast } = useToast();
  const [section, setSection] = useState<Section>('company');
  const [companyCards, setCompanyCards] = useState<Flashcard[]>([]);
  const [personalCards, setPersonalCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newDef, setNewDef] = useState('');
  const [newH1, setNewH1] = useState('');
  const [newH2, setNewH2] = useState('');
  const [newH3, setNewH3] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});

  useEffect(() => { loadCards(); }, []);

  async function loadCards() {
    setLoading(true);
    const [companyData, personalData] = await Promise.all([
      safeFetch<{ cards: Flashcard[] }>('/api/admin/learn/flashcards?source=builtin&discovered=false'),
      safeFetch<{ cards: Flashcard[] }>('/api/admin/learn/flashcards?source=user'),
    ]);
    if (companyData) setCompanyCards(companyData.cards || []);
    if (personalData) setPersonalCards(personalData.cards || []);
    setLoading(false);
  }

  async function createCard() {
    if (!newTerm.trim() || !newDef.trim()) return;
    setSaving(true);
    const data = await safeFetch<{ card: Flashcard }>('/api/admin/learn/flashcards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: newTerm.trim(), definition: newDef.trim(),
        hint_1: newH1.trim() || null, hint_2: newH2.trim() || null, hint_3: newH3.trim() || null,
        tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
      }),
    });
    if (data?.card) {
      setPersonalCards(prev => [data.card, ...prev]);
      setNewTerm(''); setNewDef(''); setNewH1(''); setNewH2(''); setNewH3(''); setNewTags('');
      setShowCreate(false);
      addToast('Flashcard created!', 'success');
    }
    setSaving(false);
  }

  async function deleteCard(id: string) {
    if (!confirm('Delete this flashcard?')) return;
    const result = await safeFetch(`/api/admin/learn/flashcards?id=${id}`, { method: 'DELETE' });
    if (result !== null) {
      setPersonalCards(prev => prev.filter(c => c.id !== id));
      addToast('Flashcard deleted.', 'info');
    }
  }

  async function saveEdit(card: Flashcard) {
    setSaving(true);
    const result = await safeFetch<{ card: Flashcard }>('/api/admin/learn/flashcards', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: card.id,
        source: card.source,
        term: editData.term ?? card.term,
        definition: editData.definition ?? card.definition,
        hint_1: editData.hint_1 ?? card.hint_1 ?? null,
        hint_2: editData.hint_2 ?? card.hint_2 ?? null,
        hint_3: editData.hint_3 ?? card.hint_3 ?? null,
      }),
    });
    if (result) {
      setEditingId(null);
      setEditData({});
      loadCards();
      addToast('Flashcard updated!', 'success');
    }
    setSaving(false);
  }

  const currentCards = section === 'company' ? companyCards : personalCards;
  const filtered = search
    ? currentCards.filter(c => c.term.toLowerCase().includes(search.toLowerCase()) || c.definition.toLowerCase().includes(search.toLowerCase()))
    : currentCards;

  // Group company cards by module
  const groupedCompany = section === 'company'
    ? filtered.reduce<Record<string, Flashcard[]>>((acc, c) => {
        const key = c.module_title || 'General';
        if (!acc[key]) acc[key] = [];
        acc[key].push(c);
        return acc;
      }, {})
    : {};

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Flashcard Bank</h2>
        <p className="learn__subtitle">
          Browse all company flashcards and your personal flashcards. Company cards are unlocked as you progress through lessons.
        </p>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem' }}>
        <button
          className={`admin-btn ${section === 'company' ? 'admin-btn--secondary' : 'admin-btn--ghost'} admin-btn--sm`}
          onClick={() => setSection('company')}
        >
          Company Flashcards ({companyCards.length})
        </button>
        <button
          className={`admin-btn ${section === 'personal' ? 'admin-btn--secondary' : 'admin-btn--ghost'} admin-btn--sm`}
          onClick={() => setSection('personal')}
        >
          My Flashcards ({personalCards.length})
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <input
          type="text" placeholder="Search flashcards..." value={search} onChange={e => setSearch(e.target.value)}
          className="fc-bank__search"
          style={{ padding: '.45rem .75rem', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: '.85rem', fontFamily: 'Inter,sans-serif', width: 260, maxWidth: '100%' }}
        />
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {section === 'personal' && (
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? 'Cancel' : '+ Create Flashcard'}
            </button>
          )}
          <Link href="/admin/learn/flashcards" className="admin-btn admin-btn--ghost admin-btn--sm">
            Study Mode
          </Link>
        </div>
      </div>

      {/* Create Form (personal section only) */}
      {showCreate && section === 'personal' && (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
          <h4 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.9rem', fontWeight: 600, color: '#1D3095', marginBottom: '.75rem' }}>Create New Flashcard</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
            <input className="manage__form-input" placeholder="Term / front of card *" value={newTerm} onChange={e => setNewTerm(e.target.value)} />
            <textarea className="manage__form-textarea" placeholder="Definition / back of card *" rows={3} value={newDef} onChange={e => setNewDef(e.target.value)} />
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input className="manage__form-input" placeholder="Hint 1 (optional)" value={newH1} onChange={e => setNewH1(e.target.value)} style={{ flex: 1 }} />
              <input className="manage__form-input" placeholder="Hint 2 (optional)" value={newH2} onChange={e => setNewH2(e.target.value)} style={{ flex: 1 }} />
              <input className="manage__form-input" placeholder="Hint 3 (optional)" value={newH3} onChange={e => setNewH3(e.target.value)} style={{ flex: 1 }} />
            </div>
            <input className="manage__form-input" placeholder="Tags (comma-separated)" value={newTags} onChange={e => setNewTags(e.target.value)} />
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={createCard} disabled={saving || !newTerm.trim() || !newDef.trim()}>
              {saving ? 'Creating...' : 'Create Flashcard'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading flashcard bank...</div></div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">{section === 'company' ? '\u{1F3E2}' : '\u{270D}'}</div>
          <div className="admin-empty__title">{section === 'company' ? 'No company flashcards yet' : 'No personal flashcards yet'}</div>
          <div className="admin-empty__desc">
            {section === 'company'
              ? 'Company flashcards are created by administrators and linked to learning modules.'
              : 'Create your own flashcards to study any topic. Click "+ Create Flashcard" above.'}
          </div>
        </div>
      ) : section === 'company' ? (
        /* Company cards grouped by module */
        <div>
          {Object.entries(groupedCompany).sort(([a], [b]) => a.localeCompare(b)).map(([moduleName, cards]) => (
            <div key={moduleName} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.9rem', fontWeight: 600, color: '#1D3095', marginBottom: '.5rem', paddingBottom: '.35rem', borderBottom: '2px solid #EFF6FF' }}>
                {moduleName} <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: '.78rem' }}>({cards.length} cards)</span>
              </h3>
              <div className="fc-bank__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.75rem' }}>
                {cards.map(c => (
                  <div key={c.id} onClick={() => setExpandedCard(expandedCard === c.id ? null : c.id)} style={{
                    background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '.85rem', cursor: 'pointer', transition: 'border-color .15s',
                    borderColor: expandedCard === c.id ? '#1D3095' : '#E5E7EB',
                  }}>
                    <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '.85rem', fontWeight: 600, color: '#0F1419', marginBottom: '.25rem' }}>{c.term}</div>
                    <div style={{ fontSize: '.78rem', color: '#6B7280', lineHeight: 1.5 }}>
                      {expandedCard === c.id ? c.definition : c.definition.substring(0, 80) + (c.definition.length > 80 ? '...' : '')}
                    </div>
                    {expandedCard === c.id && c.hint_1 && (
                      <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: '#9CA3AF' }}>
                        Hint: {c.hint_1}
                      </div>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '.2rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
                        {c.tags.slice(0, 4).map(tag => (
                          <span key={tag} style={{ fontSize: '.6rem', padding: '1px 5px', background: '#F3F4F6', borderRadius: 3, color: '#6B7280' }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Personal cards — flat list with edit support */
        <div className="fc-bank__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.75rem' }}>
          {filtered.map(c => (
            <div key={c.id} style={{ background: '#FFF', border: `1px solid ${editingId === c.id ? '#1D3095' : '#E5E7EB'}`, borderRadius: 8, padding: '.85rem' }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                  <input className="manage__form-input" value={editData.term ?? c.term} onChange={e => setEditData(p => ({ ...p, term: e.target.value }))} placeholder="Term" style={{ fontSize: '.82rem' }} />
                  <textarea className="manage__form-textarea" rows={3} value={editData.definition ?? c.definition} onChange={e => setEditData(p => ({ ...p, definition: e.target.value }))} placeholder="Definition" style={{ fontSize: '.82rem' }} />
                  <input className="manage__form-input" value={editData.hint_1 ?? c.hint_1 ?? ''} onChange={e => setEditData(p => ({ ...p, hint_1: e.target.value }))} placeholder="Hint 1" style={{ fontSize: '.78rem' }} />
                  <input className="manage__form-input" value={editData.hint_2 ?? c.hint_2 ?? ''} onChange={e => setEditData(p => ({ ...p, hint_2: e.target.value }))} placeholder="Hint 2" style={{ fontSize: '.78rem' }} />
                  <input className="manage__form-input" value={editData.hint_3 ?? c.hint_3 ?? ''} onChange={e => setEditData(p => ({ ...p, hint_3: e.target.value }))} placeholder="Hint 3" style={{ fontSize: '.78rem' }} />
                  <div style={{ display: 'flex', gap: '.35rem' }}>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveEdit(c)} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      if (Object.keys(editData).length > 0 && !confirm('Discard unsaved changes?')) return;
                      setEditingId(null); setEditData({});
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.25rem' }}>
                    <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '.85rem', fontWeight: 600, color: '#0F1419' }}>{c.term}</div>
                    <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditData({}); }} style={{
                        background: 'none', border: 'none', color: '#1D3095', cursor: 'pointer', fontSize: '.72rem', fontWeight: 600, padding: '.1rem .3rem',
                      }}>Edit</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteCard(c.id); }} style={{
                        background: 'none', border: 'none', color: '#BD1218', cursor: 'pointer', fontSize: '.72rem', fontWeight: 600, padding: '.1rem .3rem',
                      }}>Delete</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#6B7280', lineHeight: 1.5 }}>{c.definition}</div>
                  {c.hint_1 && <div style={{ marginTop: '.35rem', fontSize: '.72rem', color: '#9CA3AF' }}>Hint: {c.hint_1}</div>}
                  {c.times_reviewed != null && c.times_reviewed > 0 && (
                    <div style={{ marginTop: '.35rem', fontSize: '.68rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
                      <span>Reviewed {c.times_reviewed}x &middot; {c.times_correct || 0} correct</span>
                      <span className={`quiz-avg-badge ${((c.times_correct || 0) / c.times_reviewed * 100) >= 70 ? 'quiz-avg-badge--green' : ((c.times_correct || 0) / c.times_reviewed * 100) >= 40 ? 'quiz-avg-badge--yellow' : 'quiz-avg-badge--red'}`}>
                        {Math.round(((c.times_correct || 0) / c.times_reviewed) * 100)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
