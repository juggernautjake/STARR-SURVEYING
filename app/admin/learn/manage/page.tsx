// app/admin/learn/manage/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';

const ADMIN_EMAILS = ['hankmaddux@starr-surveying.com', 'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com'];

type Tab = 'modules' | 'lessons' | 'articles' | 'questions' | 'flashcards' | 'xp_config' | 'recycle_bin';

interface Module { id: string; title: string; status: string; order_index: number; description: string; difficulty: string; estimated_hours: number; lesson_count?: number; xp_value?: number; expiry_months?: number; }
interface XPModuleConfig { id: string; title: string; difficulty?: string; order_index?: number; module_number?: number; module_type: string; xp_value: number; expiry_months: number; difficulty_rating: number; has_custom_xp: boolean; config_id: string | null; }
interface Lesson { id: string; title: string; module_id: string; order_index: number; status: string; estimated_minutes: number; module_title?: string; }
interface Article { id: string; title: string; slug: string; category: string; status: string; }
interface Question { id: string; question_text: string; question_type: string; module_id?: string; lesson_id?: string; exam_category?: string; difficulty: string; correct_answer: string; options: any; explanation?: string; }
interface Flashcard { id: string; term: string; definition: string; hint_1?: string; }

export default function ManageContentPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);
  const { safeFetch, safeAction } = usePageError('ManageContentPage');
  const [tab, setTab] = useState<Tab>('modules');
  const [loading, setLoading] = useState(true);

  // Data
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [xpLearningModules, setXpLearningModules] = useState<XPModuleConfig[]>([]);
  const [xpFsModules, setXpFsModules] = useState<XPModuleConfig[]>([]);
  const [xpDefaults, setXpDefaults] = useState<{ learning_module: { xp_value: number; expiry_months: number }; fs_module: { xp_value: number; expiry_months: number } }>({ learning_module: { xp_value: 500, expiry_months: 18 }, fs_module: { xp_value: 500, expiry_months: 24 } });
  const [xpEditing, setXpEditing] = useState<Record<string, { xp_value: number; expiry_months: number }>>({});
  const [xpSaving, setXpSaving] = useState(false);
  const [recycleBin, setRecycleBin] = useState<{ id: string; item_title: string; item_type: string; deleted_by: string; deleted_at: string; original_id: string; original_table: string }[]>([]);

  // Create forms
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // Module editing
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editModule, setEditModule] = useState<Record<string, any>>({});

  useEffect(() => { loadData(); }, [tab]);

  async function loadData() {
    setLoading(true);
    switch (tab) {
      case 'modules': {
        const d = await safeFetch<{ modules: Module[] }>('/api/admin/learn/modules');
        if (d) setModules(d.modules || []);
        break;
      }
      case 'lessons': {
        const [modData, lesData] = await Promise.all([
          safeFetch<{ modules: Module[] }>('/api/admin/learn/modules'),
          safeFetch<{ lessons: Lesson[] }>('/api/admin/learn/lessons?all=true'),
        ]);
        if (modData) setModules(modData.modules || []);
        if (lesData) setLessons(lesData.lessons || []);
        break;
      }
      case 'articles': {
        const d = await safeFetch<{ articles: Article[] }>('/api/admin/learn/articles');
        if (d) setArticles(d.articles || []);
        break;
      }
      case 'questions': {
        const [modData, qData] = await Promise.all([
          safeFetch<{ modules: Module[] }>('/api/admin/learn/modules'),
          safeFetch<{ questions: Question[] }>('/api/admin/learn/questions?limit=100'),
        ]);
        if (modData) setModules(modData.modules || []);
        if (qData) setQuestions(qData.questions || []);
        break;
      }
      case 'flashcards': {
        const d = await safeFetch<{ cards: Flashcard[] }>('/api/admin/learn/flashcards?source=builtin');
        if (d) setFlashcards(d.cards || []);
        break;
      }
      case 'xp_config': {
        const d = await safeFetch<{ learning_modules: XPModuleConfig[]; fs_modules: XPModuleConfig[]; defaults: typeof xpDefaults }>('/api/admin/learn/xp-config');
        if (d) {
          setXpLearningModules(d.learning_modules || []);
          setXpFsModules(d.fs_modules || []);
          if (d.defaults) setXpDefaults(d.defaults);
        }
        break;
      }
      case 'recycle_bin': {
        const d = await safeFetch<{ items: typeof recycleBin }>('/api/admin/learn/recycle-bin');
        if (d) setRecycleBin(d.items || []);
        break;
      }
    }
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
        const result = await safeFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (result) {
          setShowForm(false);
          setFormData({});
          loadData();
        }
      }
    } catch (e) { /* safeFetch handles error reporting */ }
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

  async function handleSaveXP() {
    if (!isAdmin || Object.keys(xpEditing).length === 0) return;
    setXpSaving(true);
    const updates = Object.entries(xpEditing).map(([key, vals]) => {
      const [moduleType, moduleId] = key.split('::');
      return { module_type: moduleType, module_id: moduleId, xp_value: vals.xp_value, expiry_months: vals.expiry_months };
    });
    const result = await safeFetch('/api/admin/learn/xp-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (result) {
      setXpEditing({});
      loadData();
    }
    setXpSaving(false);
  }

  function startEditXP(moduleType: string, moduleId: string, current: { xp_value: number; expiry_months: number }) {
    setXpEditing(prev => ({ ...prev, [`${moduleType}::${moduleId}`]: { ...current } }));
  }

  function updateEditXP(key: string, field: 'xp_value' | 'expiry_months', value: number) {
    setXpEditing(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handleSaveModule() {
    if (!editingModuleId) return;
    setSaving(true);
    const result = await safeFetch('/api/admin/learn/modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingModuleId, ...editModule }),
    });
    if (result) {
      setEditingModuleId(null);
      setEditModule({});
      loadData();
    }
    setSaving(false);
  }

  async function handleDelete(itemType: string, itemId: string, itemTitle: string) {
    if (!confirm(`Move "${itemTitle}" to the recycle bin? You can restore it later.`)) return;
    const result = await safeFetch('/api/admin/learn/recycle-bin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: itemType, item_id: itemId }),
    });
    if (result) loadData();
  }

  async function handleRestore(recycleId: string) {
    if (!confirm('Restore this item?')) return;
    const result = await safeFetch('/api/admin/learn/recycle-bin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recycleId, action: 'restore' }),
    });
    if (result) loadData();
  }

  async function handlePermanentDelete(recycleId: string, title: string) {
    if (!confirm(`PERMANENTLY delete "${title}"? This cannot be undone!`)) return;
    const result = await safeFetch(`/api/admin/learn/recycle-bin?id=${recycleId}`, { method: 'DELETE' });
    if (result) loadData();
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'modules', label: 'Modules', icon: '\u{1F4DA}' },
    { key: 'lessons', label: 'Lessons', icon: '\u{1F4D6}' },
    { key: 'articles', label: 'Articles', icon: '\u{1F4C4}' },
    { key: 'questions', label: 'Questions', icon: '\u{2753}' },
    { key: 'flashcards', label: 'Flashcards', icon: '\u{1F0CF}' },
    { key: 'xp_config', label: 'XP Config', icon: '\u{2B50}' },
    { key: 'recycle_bin', label: `Recycle Bin${recycleBin.length > 0 ? ` (${recycleBin.length})` : ''}`, icon: '\u{1F5D1}' },
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
          {loading ? 'Loading...' : `${tab === 'modules' ? modules.length : tab === 'lessons' ? lessons.length : tab === 'articles' ? articles.length : tab === 'questions' ? questions.length : tab === 'xp_config' ? xpLearningModules.length + xpFsModules.length : flashcards.length} items`}
        </span>
        {tab === 'questions' ? (
          <Link href="/admin/learn/manage/question-builder" className="admin-btn admin-btn--primary admin-btn--sm">
            Open Question Builder
          </Link>
        ) : ['modules', 'lessons', 'articles'].includes(tab) && (
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(!showForm); setFormData({}); }}>
            {showForm ? '\u2715 Cancel' : '+ Create New'}
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
            <div key={m.id} className="manage__item" style={editingModuleId === m.id ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>
              {editingModuleId === m.id ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
                    <input className="manage__form-input" value={editModule.title ?? m.title} onChange={e => setEditModule(p => ({ ...p, title: e.target.value }))} placeholder="Title" />
                    <textarea className="manage__form-textarea" rows={2} value={editModule.description ?? m.description} onChange={e => setEditModule(p => ({ ...p, description: e.target.value }))} placeholder="Description" />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select className="manage__form-input" style={{ flex: 1 }} value={editModule.difficulty ?? m.difficulty} onChange={e => setEditModule(p => ({ ...p, difficulty: e.target.value }))}>
                        <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                      </select>
                      <input className="manage__form-input" style={{ flex: 1 }} type="number" step="0.5" min="0" placeholder="Est. hours" value={editModule.estimated_hours ?? m.estimated_hours} onChange={e => setEditModule(p => ({ ...p, estimated_hours: parseFloat(e.target.value) || 0 }))} />
                      <input className="manage__form-input" style={{ flex: 1 }} type="number" step="1" min="0" placeholder="Order" value={editModule.order_index ?? m.order_index} onChange={e => setEditModule(p => ({ ...p, order_index: parseInt(e.target.value) || 0 }))} />
                      <select className="manage__form-input" style={{ flex: 1 }} value={editModule.status ?? m.status} onChange={e => setEditModule(p => ({ ...p, status: e.target.value }))}>
                        <option value="draft">Draft</option><option value="published">Published</option>
                      </select>
                      <input className="manage__form-input" style={{ flex: 1 }} type="number" step="50" min="0" placeholder="XP Reward" value={editModule.xp_reward ?? (m as any).xp_reward ?? 200} onChange={e => setEditModule(p => ({ ...p, xp_reward: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                        <input type="checkbox" checked={editModule.is_fs_required ?? (m as any).is_fs_required ?? false} onChange={e => setEditModule(p => ({ ...p, is_fs_required: e.target.checked }))} />
                        {' '}FS Required
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveModule} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setEditingModuleId(null); setEditModule({}); }}>Cancel</button>
                    <Link href={`/admin/learn/modules/${m.id}`} className="manage__item-btn" style={{ marginLeft: 'auto' }}>View</Link>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('module', m.id, m.title)}>Delete</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="manage__item-info">
                    <div className="manage__item-title">
                      <span className="manage__item-order">{m.order_index}</span> {m.title}
                    </div>
                    <div className="manage__item-meta">
                      <span className={`manage__status manage__status--${m.status}`}>{m.status}</span>
                      {' '}{m.difficulty} · {m.estimated_hours}h · {m.lesson_count || 0} lessons
                      {m.xp_value && <span style={{ marginLeft: '0.5rem', color: '#10B981', fontWeight: 600 }}>{m.xp_value} XP</span>}
                    </div>
                  </div>
                  <div className="manage__item-actions">
                    <button className="manage__item-btn manage__item-btn--primary" onClick={() => { setEditingModuleId(m.id); setEditModule({}); }}>Edit</button>
                    <Link href={`/admin/learn/modules/${m.id}`} className="manage__item-btn">View</Link>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('module', m.id, m.title)}>Delete</button>
                  </div>
                </>
              )}
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
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('lesson', l.id, l.title)}>Delete</button>
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
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('article', a.id, a.title)}>Delete</button>
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
              <div className="manage__item-actions">
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('question', q.id, q.question_text.substring(0, 40))}>Delete</button>
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
              <div className="manage__item-actions">
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('flashcard', f.id, f.term)}>Delete</button>
              </div>
            </div>
          ))}

          {tab === 'xp_config' && (
            <div>
              {Object.keys(xpEditing).length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveXP} disabled={xpSaving}>
                    {xpSaving ? 'Saving...' : `Save ${Object.keys(xpEditing).length} Changes`}
                  </button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setXpEditing({})}>Cancel</button>
                </div>
              )}

              <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', margin: '0.5rem 0', color: '#1D3095' }}>
                Learning Modules ({xpLearningModules.length})
              </h4>
              <p style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.75rem' }}>
                Default: {xpDefaults.learning_module.xp_value} XP, {xpDefaults.learning_module.expiry_months} month expiry. Click a module to customize.
              </p>
              {xpLearningModules.map(m => {
                const editKey = `learning_module::${m.id}`;
                const editing = xpEditing[editKey];
                return (
                  <div key={m.id} className="manage__item" style={{ cursor: 'pointer' }} onClick={() => !editing && startEditXP('learning_module', m.id, { xp_value: m.xp_value, expiry_months: m.expiry_months })}>
                    <div className="manage__item-info">
                      <div className="manage__item-title">
                        <span className="manage__item-order">{m.order_index}</span> {m.title}
                      </div>
                      <div className="manage__item-meta">
                        {m.difficulty} · {m.has_custom_xp ? 'Custom' : 'Default'}
                        {editing ? (
                          <span style={{ display: 'inline-flex', gap: '0.4rem', marginLeft: '0.5rem' }} onClick={e => e.stopPropagation()}>
                            <input type="number" value={editing.xp_value} onChange={e => updateEditXP(editKey, 'xp_value', parseInt(e.target.value) || 0)}
                              style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.78rem', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>XP</span>
                            <input type="number" value={editing.expiry_months} onChange={e => updateEditXP(editKey, 'expiry_months', parseInt(e.target.value) || 0)}
                              style={{ width: '50px', padding: '0.15rem 0.3rem', fontSize: '0.78rem', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>mo</span>
                          </span>
                        ) : (
                          <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#10B981' }}>{m.xp_value} XP · {m.expiry_months}mo</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {xpFsModules.length > 0 && (
                <>
                  <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', margin: '1.25rem 0 0.5rem', color: '#1D3095' }}>
                    FS Prep Modules ({xpFsModules.length})
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.75rem' }}>
                    Default: {xpDefaults.fs_module.xp_value} XP, {xpDefaults.fs_module.expiry_months} month expiry.
                  </p>
                  {xpFsModules.map(m => {
                    const editKey = `fs_module::${m.id}`;
                    const editing = xpEditing[editKey];
                    return (
                      <div key={m.id} className="manage__item" style={{ cursor: 'pointer' }} onClick={() => !editing && startEditXP('fs_module', m.id, { xp_value: m.xp_value, expiry_months: m.expiry_months })}>
                        <div className="manage__item-info">
                          <div className="manage__item-title">
                            <span className="manage__item-order">{m.module_number}</span> {m.title}
                          </div>
                          <div className="manage__item-meta">
                            {m.has_custom_xp ? 'Custom' : 'Default'}
                            {editing ? (
                              <span style={{ display: 'inline-flex', gap: '0.4rem', marginLeft: '0.5rem' }} onClick={e => e.stopPropagation()}>
                                <input type="number" value={editing.xp_value} onChange={e => updateEditXP(editKey, 'xp_value', parseInt(e.target.value) || 0)}
                                  style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.78rem', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>XP</span>
                                <input type="number" value={editing.expiry_months} onChange={e => updateEditXP(editKey, 'expiry_months', parseInt(e.target.value) || 0)}
                                  style={{ width: '50px', padding: '0.15rem 0.3rem', fontSize: '0.78rem', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>mo</span>
                              </span>
                            ) : (
                              <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#10B981' }}>{m.xp_value} XP · {m.expiry_months}mo</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Empty states */}
          {tab === 'modules' && modules.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📚</div><div className="admin-empty__title">No modules yet</div></div>}
          {tab === 'lessons' && lessons.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📖</div><div className="admin-empty__title">No lessons yet</div></div>}
          {tab === 'articles' && articles.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">📄</div><div className="admin-empty__title">No articles yet</div></div>}
          {tab === 'flashcards' && flashcards.length === 0 && <div className="admin-empty"><div className="admin-empty__icon">🃏</div><div className="admin-empty__title">No built-in flashcards yet</div></div>}

          {tab === 'recycle_bin' && recycleBin.length === 0 && (
            <div className="admin-empty">
              <div className="admin-empty__icon">&#x1F5D1;</div>
              <div className="admin-empty__title">Recycle bin is empty</div>
              <div className="admin-empty__desc">Deleted items will appear here for 90 days before being permanently removed.</div>
            </div>
          )}
          {tab === 'recycle_bin' && recycleBin.map(item => (
            <div key={item.id} className="manage__item">
              <div className="manage__item-info">
                <div className="manage__item-title" style={{ textDecoration: 'line-through', opacity: 0.7 }}>{item.item_title}</div>
                <div className="manage__item-meta">
                  <span style={{ textTransform: 'capitalize' }}>{item.item_type}</span>
                  {' · Deleted by '}{item.deleted_by}
                  {' · '}{new Date(item.deleted_at).toLocaleDateString()}
                </div>
              </div>
              <div className="manage__item-actions">
                <button className="manage__item-btn manage__item-btn--primary" onClick={() => handleRestore(item.id)}>Restore</button>
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handlePermanentDelete(item.id, item.item_title)}>Permanently Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
