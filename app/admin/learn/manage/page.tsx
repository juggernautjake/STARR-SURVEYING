// app/admin/learn/manage/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

const ADMIN_EMAILS = ['hankmaddux@starr-surveying.com', 'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com'];

type Tab = 'modules' | 'lessons' | 'articles' | 'questions' | 'flashcards';

interface Module { id: string; title: string; status: string; order_index: number; description: string; difficulty: string; estimated_hours: number; lesson_count?: number; }
interface Lesson { id: string; title: string; module_id: string; order_index: number; status: string; estimated_minutes: number; module_title?: string; }
interface Article { id: string; title: string; slug: string; category: string; status: string; }
interface Question { id: string; question_text: string; question_type: string; module_id?: string; lesson_id?: string; exam_category?: string; difficulty: string; correct_answer: string; options: any; explanation?: string; }
interface Flashcard { id: string; term: string; definition: string; hint_1?: string; }

export default function ManageContentPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);
  const [tab, setTab] = useState<Tab>('modules');
  const [loading, setLoading] = useState(true);

  // Data
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);

  // Create forms
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      switch (tab) {
        case 'modules': {
          const res = await fetch('/api/admin/learn/modules');
          if (res.ok) { const d = await res.json(); setModules(d.modules || []); }
          break;
        }
        case 'lessons': {
          const [modRes, lesRes] = await Promise.all([
            fetch('/api/admin/learn/modules'),
            fetch('/api/admin/learn/lessons?all=true'),
          ]);
          if (modRes.ok) { const d = await modRes.json(); setModules(d.modules || []); }
          if (lesRes.ok) { const d = await lesRes.json(); setLessons(d.lessons || []); }
          break;
        }
        case 'articles': {
          const res = await fetch('/api/admin/learn/articles');
          if (res.ok) { const d = await res.json(); setArticles(d.articles || []); }
          break;
        }
        case 'questions': {
          const res = await fetch('/api/admin/learn/quizzes?bank=true');
          if (res.ok) { const d = await res.json(); setQuestions(d.questions || []); }
          break;
        }
        case 'flashcards': {
          const res = await fetch('/api/admin/learn/flashcards?source=builtin');
          if (res.ok) { const d = await res.json(); setFlashcards(d.cards || []); }
          break;
        }
      }
    } catch {}
    setLoading(false);
  }

  async function handleCreate() {
    if (!isAdmin) return;
    setSaving(true);
    try {
      let url = '';
      let body: any = {};

      switch (tab) {
        case 'modules':
          url = '/api/admin/learn/modules';
          body = {
            title: formData.title || 'New Module',
            description: formData.description || '',
            difficulty: formData.difficulty || 'beginner',
            estimated_hours: Number(formData.estimated_hours) || 1,
            order_index: modules.length + 1,
            status: formData.status || 'draft',
          };
          break;
        case 'lessons':
          url = '/api/admin/learn/lessons';
          body = {
            title: formData.title || 'New Lesson',
            content: formData.content || '<p>Lesson content goes here.</p>',
            module_id: formData.module_id,
            order_index: Number(formData.order_index) || 1,
            estimated_minutes: Number(formData.estimated_minutes) || 30,
            status: formData.status || 'draft',
          };
          if (!body.module_id) { alert('Please select a module.'); setSaving(false); return; }
          break;
        case 'articles':
          url = '/api/admin/learn/articles';
          body = {
            title: formData.title || 'New Article',
            content: formData.content || '<p>Article content goes here.</p>',
            slug: formData.slug || formData.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-article',
            category: formData.category || 'General',
            excerpt: formData.excerpt || '',
            status: formData.status || 'draft',
          };
          break;
        case 'questions':
          url = '/api/admin/learn/questions';
          body = {
            question_text: formData.question_text,
            question_type: formData.question_type || 'multiple_choice',
            options: formData.options ? formData.options.split('|').map((o: string) => o.trim()) : [],
            correct_answer: formData.correct_answer || '',
            explanation: formData.explanation || '',
            difficulty: formData.difficulty || 'medium',
            module_id: formData.module_id || null,
            lesson_id: formData.lesson_id || null,
            exam_category: formData.exam_category || null,
          };
          if (!body.question_text) { alert('Please enter a question.'); setSaving(false); return; }
          break;
      }

      if (url) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setShowForm(false);
          setFormData({});
          loadData();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to create');
        }
      }
    } catch (e) { alert('Error creating item'); }
    setSaving(false);
  }

  if (!isAdmin) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">🔒</div>
        <div className="admin-empty__title">Admin Access Required</div>
        <div className="admin-empty__desc">Only administrators can manage learning content.</div>
        <Link href="/admin/learn" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>&larr; Back to Learning Hub</Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'modules', label: 'Modules', icon: '📚' },
    { key: 'lessons', label: 'Lessons', icon: '📖' },
    { key: 'articles', label: 'Articles', icon: '📄' },
    { key: 'questions', label: 'Questions', icon: '❓' },
    { key: 'flashcards', label: 'Flashcards', icon: '🃏' },
  ];

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Manage Content</h2>
        <p className="learn__subtitle">Create and manage modules, lessons, articles, question bank, and flashcards. Use the Lesson Builder for rich content editing.</p>
      </div>

      {/* Tabs */}
      <div className="manage__tabs">
        {tabs.map(t => (
          <button key={t.key} className={`manage__tab ${tab === t.key ? 'manage__tab--active' : ''}`} onClick={() => { setTab(t.key); setShowForm(false); }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="manage__toolbar">
        <span style={{ fontSize: '.85rem', color: '#6B7280' }}>
          {loading ? 'Loading...' : `${tab === 'modules' ? modules.length : tab === 'lessons' ? lessons.length : tab === 'articles' ? articles.length : tab === 'questions' ? questions.length : flashcards.length} items`}
        </span>
        {['modules', 'lessons', 'articles', 'questions'].includes(tab) && (
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(!showForm); setFormData({}); }}>
            {showForm ? '✕ Cancel' : '+ Create New'}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="manage__form">
          {tab === 'modules' && (
            <>
              <input className="manage__form-input" placeholder="Module title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
              <textarea className="manage__form-textarea" placeholder="Description" rows={2} value={formData.description || ''} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <select className="manage__form-input" value={formData.difficulty || 'beginner'} onChange={e => setFormData(p => ({ ...p, difficulty: e.target.value }))}>
                  <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                </select>
                <input className="manage__form-input" type="number" placeholder="Est. hours" value={formData.estimated_hours || ''} onChange={e => setFormData(p => ({ ...p, estimated_hours: e.target.value }))} />
                <select className="manage__form-input" value={formData.status || 'draft'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
            </>
          )}
          {tab === 'lessons' && (
            <>
              <select className="manage__form-input" value={formData.module_id || ''} onChange={e => setFormData(p => ({ ...p, module_id: e.target.value }))}>
                <option value="">Select module *</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <input className="manage__form-input" placeholder="Lesson title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <input className="manage__form-input" type="number" placeholder="Order index" value={formData.order_index || ''} onChange={e => setFormData(p => ({ ...p, order_index: e.target.value }))} />
                <input className="manage__form-input" type="number" placeholder="Est. minutes" value={formData.estimated_minutes || ''} onChange={e => setFormData(p => ({ ...p, estimated_minutes: e.target.value }))} />
                <select className="manage__form-input" value={formData.status || 'draft'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
              <p style={{ fontSize: '.78rem', color: '#6B7280' }}>Use the Lesson Builder to add rich content after creating the lesson.</p>
            </>
          )}
          {tab === 'articles' && (
            <>
              <input className="manage__form-input" placeholder="Article title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
              <input className="manage__form-input" placeholder="URL slug" value={formData.slug || ''} onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} />
              <input className="manage__form-input" placeholder="Category" value={formData.category || ''} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} />
              <input className="manage__form-input" placeholder="Short excerpt" value={formData.excerpt || ''} onChange={e => setFormData(p => ({ ...p, excerpt: e.target.value }))} />
              <textarea className="manage__form-textarea" placeholder="HTML content" rows={6} value={formData.content || ''} onChange={e => setFormData(p => ({ ...p, content: e.target.value }))} />
            </>
          )}
          {tab === 'questions' && (
            <>
              <textarea className="manage__form-textarea" placeholder="Question text *" rows={2} value={formData.question_text || ''} onChange={e => setFormData(p => ({ ...p, question_text: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <select className="manage__form-input" value={formData.question_type || 'multiple_choice'} onChange={e => setFormData(p => ({ ...p, question_type: e.target.value }))}>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                </select>
                <select className="manage__form-input" value={formData.difficulty || 'medium'} onChange={e => setFormData(p => ({ ...p, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </div>
              <input className="manage__form-input" placeholder="Options (pipe-separated, e.g. Option A|Option B|Option C)" value={formData.options || ''} onChange={e => setFormData(p => ({ ...p, options: e.target.value }))} />
              <input className="manage__form-input" placeholder="Correct answer *" value={formData.correct_answer || ''} onChange={e => setFormData(p => ({ ...p, correct_answer: e.target.value }))} />
              <textarea className="manage__form-textarea" placeholder="Explanation" rows={2} value={formData.explanation || ''} onChange={e => setFormData(p => ({ ...p, explanation: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <select className="manage__form-input" value={formData.module_id || ''} onChange={e => setFormData(p => ({ ...p, module_id: e.target.value }))}>
                  <option value="">Module (optional)</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                <select className="manage__form-input" value={formData.exam_category || ''} onChange={e => setFormData(p => ({ ...p, exam_category: e.target.value }))}>
                  <option value="">Exam Category (optional)</option>
                  <option value="SIT">SIT</option>
                  <option value="RPLS">RPLS</option>
                </select>
              </div>
            </>
          )}
          <button className="admin-btn admin-btn--primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
        </div>
      )}

      {/* Content Lists */}
      {!loading && (
        <div className="manage__list">
          {tab === 'modules' && modules.sort((a, b) => a.order_index - b.order_index).map(m => (
            <div key={m.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title">
                  <span className="manage__item-order">{m.order_index}</span> {m.title}
                </div>
                <div className="manage__item-meta">
                  <span className={`manage__status manage__status--${m.status}`}>{m.status}</span>
                  {' '}{m.difficulty} · {m.estimated_hours}h · {m.lesson_count || 0} lessons
                </div>
              </div>
              <div className="manage__item-actions">
                <Link href={`/admin/learn/modules/${m.id}`} className="manage__item-btn">View</Link>
              </div>
            </div>
          ))}

          {tab === 'lessons' && lessons.map(l => (
            <div key={l.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title">{l.title}</div>
                <div className="manage__item-meta">
                  <span className={`manage__status manage__status--${l.status}`}>{l.status}</span>
                  {' '}Module: {modules.find(m => m.id === l.module_id)?.title || l.module_id?.slice(0, 8)} · Order: {l.order_index} · {l.estimated_minutes}min
                </div>
              </div>
              <div className="manage__item-actions">
                <Link href={`/admin/learn/manage/lesson-builder/${l.id}`} className="manage__item-btn manage__item-btn--primary">
                  Edit in Builder
                </Link>
                <Link href={`/admin/learn/modules/${l.module_id}/${l.id}`} className="manage__item-btn">View</Link>
              </div>
            </div>
          ))}

          {tab === 'articles' && articles.map(a => (
            <div key={a.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title">{a.title}</div>
                <div className="manage__item-meta">
                  <span className={`manage__status manage__status--${a.status}`}>{a.status}</span>
                  {' '}{a.category} · /{a.slug}
                </div>
              </div>
              <div className="manage__item-actions">
                <Link href={`/admin/learn/knowledge-base/${a.slug}`} className="manage__item-btn">View</Link>
              </div>
            </div>
          ))}

          {tab === 'questions' && questions.length === 0 && !showForm && (
            <div className="admin-empty" style={{ padding: '2rem' }}>
              <div className="admin-empty__icon">❓</div>
              <div className="admin-empty__title">No questions loaded</div>
              <div className="admin-empty__desc">Use the Create form above to add questions to the question bank, or add them via SQL.</div>
            </div>
          )}
          {tab === 'questions' && questions.map(q => (
            <div key={q.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title" style={{ fontSize: '.85rem' }}>{q.question_text.substring(0, 120)}{q.question_text.length > 120 ? '...' : ''}</div>
                <div className="manage__item-meta">
                  {q.question_type} · {q.difficulty}
                  {q.exam_category && ` · ${q.exam_category}`}
                </div>
              </div>
            </div>
          ))}

          {tab === 'flashcards' && flashcards.map(f => (
            <div key={f.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title">{f.term}</div>
                <div className="manage__item-meta">
                  {f.definition.substring(0, 80)}{f.definition.length > 80 ? '...' : ''}
                  {f.hint_1 && ' · Has hints'}
                </div>
              </div>
            </div>
          ))}

          {/* Empty states */}
          {tab === 'modules' && modules.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📚</div><div className="admin-empty__title">No modules yet</div></div>}
          {tab === 'lessons' && lessons.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📖</div><div className="admin-empty__title">No lessons yet</div></div>}
          {tab === 'articles' && articles.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📄</div><div className="admin-empty__title">No articles yet</div></div>}
          {tab === 'flashcards' && flashcards.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">🃏</div><div className="admin-empty__title">No built-in flashcards yet</div></div>}
        </div>
      )}
    </>
  );
}
