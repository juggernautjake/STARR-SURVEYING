// app/admin/learn/manage/page.tsx — Content management with Assignments and Activity Monitor
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';
import SmartSearch from '../components/SmartSearch';
import { useToast } from '../../components/Toast';
import SmallScreenBanner from '../../components/SmallScreenBanner';
import StudentOverridePanel from '../../components/StudentOverridePanel';

type Tab = 'modules' | 'lessons' | 'articles' | 'questions' | 'flashcards' | 'xp_config' | 'assignments' | 'student_overrides' | 'activity' | 'recycle_bin';

interface Module { id: string; title: string; status: string; order_index: number; description: string; difficulty: string; estimated_hours: number; lesson_count?: number; xp_value?: number; expiry_months?: number; }
interface XPModuleConfig { id: string; title: string; difficulty?: string; order_index?: number; module_number?: number; module_type: string; xp_value: number; expiry_months: number; difficulty_rating: number; has_custom_xp: boolean; config_id: string | null; }
interface Lesson { id: string; title: string; module_id: string; order_index: number; status: string; estimated_minutes: number; module_title?: string; }
interface Article { id: string; title: string; slug: string; category: string; status: string; author?: string; subtitle?: string; estimated_minutes?: number; excerpt?: string; }
interface Question { id: string; question_text: string; question_type: string; module_id?: string; lesson_id?: string; exam_category?: string; difficulty: string; correct_answer: string; options: any; explanation?: string; tags?: string[]; }
interface Flashcard { id: string; term: string; definition: string; hint_1?: string; hint_2?: string; hint_3?: string; module_id?: string; lesson_id?: string; tags?: string[]; source?: string; }
interface Assignment { id: string; assigned_to: string; assigned_by: string; module_id?: string; lesson_id?: string; unlock_next: boolean; status: string; due_date?: string; notes?: string; created_at: string; completed_at?: string; module_title?: string; lesson_title?: string; }
interface Activity { id: string; user_email: string; action_type: string; entity_type?: string; entity_id?: string; metadata?: any; created_at: string; }

export default function ManageContentPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const userRole = session?.user?.role || 'employee';
  const canManage = userRole === 'admin' || userRole === 'teacher';
  const isAdmin = userRole === 'admin';
  const { safeFetch } = usePageError('ManageContentPage');
  const { addToast } = useToast();
  const initialTab = (searchParams.get('tab') as Tab) || 'modules';
  const [tab, setTab] = useState<Tab>(initialTab);
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

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignForm, setAssignForm] = useState<Record<string, any>>({});
  const [assignFilter, setAssignFilter] = useState<string>('all');

  // Activity
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityFilter, setActivityFilter] = useState<string>('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');

  // Create forms
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // Module editing
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editModule, setEditModule] = useState<Record<string, any>>({});

  // Flashcard editing
  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);
  const [editFlashcard, setEditFlashcard] = useState<Record<string, any>>({});

  // Question editing
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState<Record<string, any>>({});

  // Dirty tracking — true when user has entered data into a form
  const isFormDirty = Object.values(formData).some(v => v !== '' && v !== undefined && v !== null);
  const isEditModuleDirty = Object.keys(editModule).length > 0;
  const isEditQuestionDirty = Object.keys(editQuestion).length > 0;
  const isEditFlashcardDirty = Object.keys(editFlashcard).length > 0;

  function confirmDiscard(dirty: boolean): boolean {
    if (!dirty) return true;
    return confirm('You have unsaved changes. Discard them?');
  }

  function handleCancelForm() {
    if (!confirmDiscard(isFormDirty)) return;
    setShowForm(false);
    setFormData({});
  }

  function handleToggleForm() {
    if (showForm) {
      handleCancelForm();
    } else {
      setShowForm(true);
      setFormData({});
    }
  }

  function handleCancelEditModule() {
    if (!confirmDiscard(isEditModuleDirty)) return;
    setEditingModuleId(null);
    setEditModule({});
  }

  function handleCancelEditQuestion() {
    if (!confirmDiscard(isEditQuestionDirty)) return;
    setEditingQuestionId(null);
    setEditQuestion({});
  }

  function handleCancelEditFlashcard() {
    if (!confirmDiscard(isEditFlashcardDirty)) return;
    setEditingFlashcardId(null);
    setEditFlashcard({});
  }

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
        const [fData, modData] = await Promise.all([
          safeFetch<{ cards: Flashcard[] }>('/api/admin/learn/flashcards?source=builtin&discovered=false'),
          safeFetch<{ modules: Module[] }>('/api/admin/learn/modules'),
        ]);
        if (fData) setFlashcards(fData.cards || []);
        if (modData) setModules(modData.modules || []);
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
      case 'assignments': {
        const [assignData, modData] = await Promise.all([
          safeFetch<{ assignments: Assignment[] }>('/api/admin/learn/assignments'),
          safeFetch<{ modules: Module[] }>('/api/admin/learn/modules'),
        ]);
        if (assignData) setAssignments(assignData.assignments || []);
        if (modData) setModules(modData.modules || []);
        break;
      }
      case 'activity': {
        const d = await safeFetch<{ activities: Activity[] }>('/api/admin/learn/activity?limit=100');
        if (d) setActivities(d.activities || []);
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
    if (!canManage) return;
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
          if (!body.module_id) { addToast('Please select a module.', 'warning'); setSaving(false); return; }
          break;
        case 'articles':
          url = '/api/admin/learn/articles';
          body = {
            title: formData.title || 'New Article',
            content: formData.content || '<p>Article content goes here.</p>',
            slug: formData.slug || formData.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-article',
            category: formData.category || 'General',
            excerpt: formData.excerpt || '',
            author: formData.author || '',
            subtitle: formData.subtitle || '',
            estimated_minutes: Number(formData.estimated_minutes) || 10,
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
          if (!body.question_text) { addToast('Please enter a question.', 'warning'); setSaving(false); return; }
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
          addToast(`${tab.slice(0, -1).replace('_', ' ')} created successfully!`, 'success');
        }
      }
    } catch { /* safeFetch handles error reporting */ }
    setSaving(false);
  }

  if (!canManage) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x1F512;</div>
        <div className="admin-empty__title">Content Management Access Required</div>
        <div className="admin-empty__desc">Only administrators and teachers can manage learning content.</div>
        <Link href="/admin/learn" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>&larr; Back to Learning Hub</Link>
      </div>
    );
  }

  async function handleSaveXP() {
    if (!canManage || Object.keys(xpEditing).length === 0) return;
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
      addToast('Module updated successfully!', 'success');
    }
    setSaving(false);
  }

  async function handleSaveFlashcard() {
    if (!editingFlashcardId) return;
    setSaving(true);
    const result = await safeFetch('/api/admin/learn/flashcards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingFlashcardId, source: 'builtin', ...editFlashcard }),
    });
    if (result) {
      setEditingFlashcardId(null);
      setEditFlashcard({});
      loadData();
      addToast('Flashcard updated!', 'success');
    }
    setSaving(false);
  }

  async function handleCreateFlashcard() {
    setSaving(true);
    const result = await safeFetch('/api/admin/learn/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'builtin',
        term: formData.term || 'New Term',
        definition: formData.definition || '',
        hint_1: formData.hint_1 || null,
        hint_2: formData.hint_2 || null,
        hint_3: formData.hint_3 || null,
        module_id: formData.module_id || null,
        lesson_id: formData.lesson_id || null,
      }),
    });
    if (result) {
      setShowForm(false);
      setFormData({});
      loadData();
      addToast('Flashcard created!', 'success');
    }
    setSaving(false);
  }

  async function handleSaveQuestion() {
    if (!editingQuestionId) return;
    setSaving(true);
    const optionsVal = typeof editQuestion.options === 'string'
      ? editQuestion.options.split('|').map((o: string) => o.trim()).filter(Boolean)
      : editQuestion.options;
    const result = await safeFetch('/api/admin/learn/questions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingQuestionId, ...editQuestion, options: optionsVal }),
    });
    if (result) {
      setEditingQuestionId(null);
      setEditQuestion({});
      loadData();
      addToast('Question updated!', 'success');
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
    if (result) {
      loadData();
      addToast(`"${itemTitle}" moved to recycle bin.`, 'info');
    }
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

  // Assignment actions
  async function handleCreateAssignment() {
    if (!assignForm.assigned_to) { addToast('Please enter a user email.', 'warning'); return; }
    if (!assignForm.module_id && !assignForm.lesson_id) { addToast('Select a module or lesson.', 'warning'); return; }
    setSaving(true);
    const result = await safeFetch('/api/admin/learn/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...assignForm, status: 'in_progress' }),
    });
    if (result) {
      setAssignForm({});
      setShowForm(false);
      addToast('Assignment created successfully!', 'success');
      loadData();
    } else {
      addToast('Failed to create assignment. Check the email and try again.', 'error');
    }
    setSaving(false);
  }

  async function handleCancelAssignment(id: string) {
    if (!confirm('Cancel this assignment?')) return;
    await safeFetch(`/api/admin/learn/assignments?id=${id}`, { method: 'DELETE' });
    loadData();
  }

  async function handleUpdateAssignmentStatus(id: string, status: string) {
    await safeFetch('/api/admin/learn/assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    loadData();
  }

  // ACC enrollment
  async function handleEnrollACC() {
    if (!assignForm.acc_email || !assignForm.acc_course) { addToast('Enter email and select course.', 'warning'); return; }
    setSaving(true);
    const result = await safeFetch('/api/admin/learn/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enroll_acc', user_email: assignForm.acc_email, course_id: assignForm.acc_course }),
    });
    if (result) {
      addToast(`Enrolled ${assignForm.acc_email} in ${assignForm.acc_course.replace('_', ' ')}!`, 'success');
      setAssignForm(prev => ({ ...prev, acc_email: '', acc_course: '' }));
    } else {
      addToast('Failed to enroll user. Check the email and try again.', 'error');
    }
    setSaving(false);
  }

  // Refresh frequency
  async function handleUpdateRefresh(moduleId: string, months: number) {
    await safeFetch('/api/admin/learn/assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_refresh', module_id: moduleId, refresh_months: months }),
    });
  }

  const filteredAssignments = assignments.filter(a => {
    if (assignFilter === 'all') return true;
    return a.status === assignFilter;
  });

  const filteredActivities = activities.filter(a => {
    let match = true;
    if (activityFilter) match = a.user_email.toLowerCase().includes(activityFilter.toLowerCase());
    if (activityTypeFilter !== 'all') match = match && a.action_type === activityTypeFilter;
    return match;
  });

  const activityTypes = [...new Set(activities.map(a => a.action_type))];

  const allTabs: { key: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
    { key: 'modules', label: 'Modules', icon: '\u{1F4DA}' },
    { key: 'lessons', label: 'Lessons', icon: '\u{1F4D6}' },
    { key: 'articles', label: 'Articles', icon: '\u{1F4C4}' },
    { key: 'questions', label: 'Questions', icon: '\u{2753}' },
    { key: 'flashcards', label: 'Flashcards', icon: '\u{1F0CF}' },
    { key: 'xp_config', label: 'XP Config', icon: '\u{2B50}', adminOnly: true },
    { key: 'assignments', label: 'Assignments', icon: '\u{1F4CB}' },
    { key: 'student_overrides', label: 'Student Overrides', icon: '\u{1F6E0}', adminOnly: true },
    { key: 'activity', label: 'Activity', icon: '\u{1F4CA}', adminOnly: true },
    { key: 'recycle_bin', label: `Recycle Bin${recycleBin.length > 0 ? ` (${recycleBin.length})` : ''}`, icon: '\u{1F5D1}', adminOnly: true },
  ];
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <>
      <SmallScreenBanner storageKey="manage-content-banner" />
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Manage Content</h2>
        <p className="learn__subtitle">Create and manage modules, lessons, articles, question bank, flashcards, assignments, and monitor activity.</p>
      </div>

      {/* Universal Smart Search */}
      <div style={{ marginBottom: '1rem' }}>
        <SmartSearch placeholder="Search everything: modules, lessons, questions, flashcards, articles... (Ctrl+K)" />
      </div>

      {/* Tabs */}
      <div className="manage__tabs">
        {tabs.map(t => (
          <button key={t.key} className={`manage__tab ${tab === t.key ? 'manage__tab--active' : ''}`} onClick={() => {
            if (showForm && isFormDirty && !confirm('You have unsaved changes. Switch tabs and discard?')) return;
            setTab(t.key); setShowForm(false); setFormData({});
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="manage__toolbar">
        <span style={{ fontSize: '.85rem', color: '#6B7280' }}>
          {loading ? 'Loading...' : tab === 'assignments' ? `${filteredAssignments.length} assignments` : tab === 'activity' ? `${filteredActivities.length} activities` : tab === 'student_overrides' ? 'Admin student control panel' : `${tab === 'modules' ? modules.length : tab === 'lessons' ? lessons.length : tab === 'articles' ? articles.length : tab === 'questions' ? questions.length : tab === 'xp_config' ? xpLearningModules.length + xpFsModules.length : flashcards.length} items`}
        </span>
        {tab === 'questions' ? (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <Link href="/admin/learn/manage/question-builder" className="admin-btn admin-btn--primary admin-btn--sm">
              Question Builder
            </Link>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleToggleForm}>
              {showForm ? '\u2715 Cancel' : '+ Quick Add'}
            </button>
          </div>
        ) : tab === 'flashcards' ? (
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleToggleForm}>
            {showForm ? '\u2715 Cancel' : '+ New Flashcard'}
          </button>
        ) : tab === 'assignments' ? (
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => {
            if (showForm) { handleCancelForm(); } else { setShowForm(true); setAssignForm({}); }
          }}>
            {showForm ? '\u2715 Cancel' : '+ New Assignment'}
          </button>
        ) : ['modules', 'lessons', 'articles'].includes(tab) && (
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleToggleForm}>
            {showForm ? '\u2715 Cancel' : '+ Create New'}
          </button>
        )}
      </div>

      {/* ── ASSIGNMENTS TAB ── */}
      {tab === 'assignments' && (
        <>
          {/* Assignment Create Form */}
          {showForm && (
            <div className="manage__form">
              <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: '#0F1419', margin: '0 0 0.75rem' }}>Create Assignment</h4>
              <input className="manage__form-input" placeholder="User email *" type="email" value={assignForm.assigned_to || ''} onChange={e => setAssignForm(p => ({ ...p, assigned_to: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <select className="manage__form-input" style={{ flex: 1 }} value={assignForm.module_id || ''} onChange={e => setAssignForm(p => ({ ...p, module_id: e.target.value }))}>
                  <option value="">Select module</option>
                  {modules.sort((a, b) => a.order_index - b.order_index).map(m => <option key={m.id} value={m.id}>{m.order_index}. {m.title}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="manage__form-input" style={{ flex: 1 }} type="date" placeholder="Due date (optional)" value={assignForm.due_date || ''} onChange={e => setAssignForm(p => ({ ...p, due_date: e.target.value }))} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.82rem', color: '#374151', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={assignForm.unlock_next || false} onChange={e => setAssignForm(p => ({ ...p, unlock_next: e.target.checked }))} />
                  Unlock next module on completion
                </label>
              </div>
              <textarea className="manage__form-textarea" placeholder="Notes (optional)" rows={2} value={assignForm.notes || ''} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} />
              <button className="admin-btn admin-btn--primary" onClick={handleCreateAssignment} disabled={saving}>{saving ? 'Creating...' : 'Create Assignment'}</button>
            </div>
          )}

          {/* ACC Enrollment Section */}
          <div className="assign__section">
            <h4 className="assign__section-title">&#x1F3EB; ACC Course Enrollment</h4>
            <p className="assign__section-desc">Enroll users in ACC academic courses to grant access to those modules.</p>
            <div className="assign__enroll-row">
              <input className="manage__form-input" style={{ flex: 1 }} placeholder="User email" type="email" value={assignForm.acc_email || ''} onChange={e => setAssignForm(p => ({ ...p, acc_email: e.target.value }))} />
              <select className="manage__form-input" style={{ flex: 1 }} value={assignForm.acc_course || ''} onChange={e => setAssignForm(p => ({ ...p, acc_course: e.target.value }))}>
                <option value="">Select ACC course</option>
                <option value="SRVY_1301">SRVY 1301</option>
                <option value="SRVY_1335">SRVY 1335</option>
                <option value="SRVY_1341">SRVY 1341</option>
                <option value="SRVY_2339">SRVY 2339</option>
                <option value="SRVY_2341">SRVY 2341</option>
                <option value="SRVY_2343">SRVY 2343</option>
                <option value="SRVY_2344">SRVY 2344</option>
              </select>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleEnrollACC} disabled={saving}>Enroll</button>
            </div>
          </div>

          {/* Assignment Filters */}
          <div className="assign__filters">
            {['all', 'pending', 'in_progress', 'completed', 'cancelled'].map(f => (
              <button key={f} className={`modules__filter-btn ${assignFilter === f ? 'modules__filter-btn--active' : ''}`} onClick={() => setAssignFilter(f)}>
                {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Assignment List */}
          {filteredAssignments.length === 0 ? (
            <div className="admin-empty" style={{ padding: '2rem' }}>
              <div className="admin-empty__icon">&#x1F4CB;</div>
              <div className="admin-empty__title">No assignments found</div>
              <div className="admin-empty__desc">Create an assignment using the button above.</div>
            </div>
          ) : (
            <div className="manage__list">
              {filteredAssignments.map(a => (
                <div key={a.id} className="manage__item assign__item">
                  <div className="manage__item-info">
                    <div className="manage__item-title">
                      {a.module_title || a.lesson_title || 'Unknown'}
                      {a.unlock_next && <span className="assign__unlock-badge">&#x1F513; Unlocks Next</span>}
                    </div>
                    <div className="manage__item-meta">
                      <span className={`assign__status assign__status--${a.status}`}>{a.status.replace('_', ' ')}</span>
                      {' '}Assigned to: {a.assigned_to}
                      {' \u00B7 '}{new Date(a.created_at).toLocaleDateString()}
                      {a.due_date && <span> &middot; Due: {new Date(a.due_date).toLocaleDateString()}</span>}
                      {a.notes && <span> &middot; Note: {a.notes}</span>}
                    </div>
                  </div>
                  <div className="manage__item-actions">
                    {a.status === 'pending' && (
                      <button className="manage__item-btn" onClick={() => handleUpdateAssignmentStatus(a.id, 'in_progress')}>Start</button>
                    )}
                    {a.status !== 'completed' && a.status !== 'cancelled' && (
                      <button className="manage__item-btn manage__item-btn--primary" onClick={() => handleUpdateAssignmentStatus(a.id, 'completed')}>Complete</button>
                    )}
                    {a.status !== 'cancelled' && (
                      <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleCancelAssignment(a.id)}>Cancel</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── STUDENT OVERRIDES TAB ── */}
      {tab === 'student_overrides' && <StudentOverridePanel />}

      {/* ── ACTIVITY MONITOR TAB ── */}
      {tab === 'activity' && (
        <>
          <div className="activity__filters">
            <input className="manage__form-input" style={{ flex: 1, maxWidth: '300px' }} placeholder="Filter by user email..." value={activityFilter} onChange={e => setActivityFilter(e.target.value)} />
            <select className="manage__form-input" style={{ maxWidth: '220px' }} value={activityTypeFilter} onChange={e => setActivityTypeFilter(e.target.value)}>
              <option value="all">All Activity Types</option>
              {activityTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={loadData}>&#x1F504; Refresh</button>
          </div>

          <p className="activity__notice">Activity logs are retained for 4 weeks, then automatically cleaned up.</p>

          {filteredActivities.length === 0 ? (
            <div className="admin-empty" style={{ padding: '2rem' }}>
              <div className="admin-empty__icon">&#x1F4CA;</div>
              <div className="admin-empty__title">No activity found</div>
              <div className="admin-empty__desc">Activity will appear here as users interact with the learning platform.</div>
            </div>
          ) : (
            <div className="manage__list">
              {filteredActivities.map(a => (
                <div key={a.id} className="manage__item activity__item">
                  <div className="manage__item-info">
                    <div className="manage__item-title" style={{ fontSize: '.85rem' }}>
                      <span className="activity__type-badge">{a.action_type.replace(/_/g, ' ')}</span>
                      {a.entity_type && <span className="activity__entity-badge">{a.entity_type}</span>}
                    </div>
                    <div className="manage__item-meta">
                      {a.user_email} &middot; {new Date(a.created_at).toLocaleString()}
                      {a.metadata && Object.keys(a.metadata).length > 0 && (
                        <span style={{ marginLeft: '0.5rem', color: '#9CA3AF' }}>
                          {JSON.stringify(a.metadata).substring(0, 80)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Form (modules/lessons/articles/questions) */}
      {showForm && tab !== 'assignments' && (
        <div className="manage__form">
          {tab === 'modules' && (
            <>
              <div className="manage__form-field">
                <input className="manage__form-input" placeholder="Module title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
                <span className="manage__form-hint">The display name for this module (e.g., &ldquo;Introduction to Boundary Law&rdquo;).</span>
              </div>
              <div className="manage__form-field">
                <textarea className="manage__form-textarea" placeholder="Description" rows={2} value={formData.description || ''} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} />
                <span className="manage__form-hint">A brief summary shown on the module card. Explain what students will learn.</span>
              </div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <select className="manage__form-input" value={formData.difficulty || 'beginner'} onChange={e => setFormData(p => ({ ...p, difficulty: e.target.value }))}>
                    <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                  </select>
                  <span className="manage__form-hint">Difficulty level shown to students.</span>
                </div>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <input className="manage__form-input" type="number" min="0" step="0.5" placeholder="Est. hours" value={formData.estimated_hours || ''} onChange={e => setFormData(p => ({ ...p, estimated_hours: e.target.value }))} />
                  <span className="manage__form-hint">Estimated time to complete all lessons.</span>
                </div>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <select className="manage__form-input" value={formData.status || 'draft'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}>
                    <option value="draft">Draft</option><option value="published">Published</option>
                  </select>
                  <span className="manage__form-hint">Draft modules are hidden from students.</span>
                </div>
              </div>
            </>
          )}
          {tab === 'lessons' && (
            <>
              <div className="manage__form-field">
                <select className="manage__form-input" value={formData.module_id || ''} onChange={e => setFormData(p => ({ ...p, module_id: e.target.value }))}>
                  <option value="">Select module *</option>
                  {modules.sort((a, b) => a.order_index - b.order_index).map(m => <option key={m.id} value={m.id}>{m.order_index}. {m.title}</option>)}
                </select>
                <span className="manage__form-hint">Which module this lesson belongs to. Students must complete lessons in module order.</span>
              </div>
              <div className="manage__form-field">
                <input className="manage__form-input" placeholder="Lesson title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
                <span className="manage__form-hint">The lesson name shown in the module&rsquo;s lesson list (e.g., &ldquo;Types of Legal Descriptions&rdquo;).</span>
              </div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <input className="manage__form-input" type="number" min="1" step="1" placeholder="Order (e.g. 1, 2, 3)" value={formData.order_index || ''} onChange={e => setFormData(p => ({ ...p, order_index: Math.max(1, parseInt(e.target.value) || 1).toString() }))} />
                  <span className="manage__form-hint">Position in the module (1 = first lesson). Must be 1 or higher.</span>
                </div>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <input className="manage__form-input" type="number" min="1" step="5" placeholder="Est. minutes (e.g. 30)" value={formData.estimated_minutes || ''} onChange={e => setFormData(p => ({ ...p, estimated_minutes: e.target.value }))} />
                  <span className="manage__form-hint">Approximate reading/study time for this lesson.</span>
                </div>
                <div className="manage__form-field" style={{ flex: 1 }}>
                  <select className="manage__form-input" value={formData.status || 'draft'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}>
                    <option value="draft">Draft</option><option value="published">Published</option>
                  </select>
                  <span className="manage__form-hint">Draft = hidden. Publish when content is ready.</span>
                </div>
              </div>
              <p style={{ fontSize: '.78rem', color: '#6B7280', marginTop: '.25rem' }}>After creating, use the <strong>Lesson Builder</strong> to add rich content blocks (text, images, quizzes, etc.).</p>
            </>
          )}
          {tab === 'articles' && (
            <>
              <input className="manage__form-input" placeholder="Article title *" value={formData.title || ''} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <input className="manage__form-input" style={{ flex: 1 }} placeholder="Author" value={formData.author || ''} onChange={e => setFormData(p => ({ ...p, author: e.target.value }))} />
                <input className="manage__form-input" style={{ flex: 1 }} placeholder="Subtitle" value={formData.subtitle || ''} onChange={e => setFormData(p => ({ ...p, subtitle: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <input className="manage__form-input" style={{ flex: 1 }} placeholder="URL slug" value={formData.slug || ''} onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} />
                <input className="manage__form-input" style={{ flex: 1 }} placeholder="Category" value={formData.category || ''} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} />
                <input className="manage__form-input" style={{ width: '100px' }} type="number" placeholder="Minutes" value={formData.estimated_minutes || ''} onChange={e => setFormData(p => ({ ...p, estimated_minutes: e.target.value }))} />
                <select className="manage__form-input" style={{ width: '120px' }} value={formData.status || 'draft'} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}>
                  <option value="draft">Draft</option><option value="published">Published</option>
                </select>
              </div>
              <input className="manage__form-input" placeholder="Short excerpt" value={formData.excerpt || ''} onChange={e => setFormData(p => ({ ...p, excerpt: e.target.value }))} />
              <p style={{ fontSize: '.78rem', color: '#6B7280' }}>Use the Article Editor to add rich content after creating the article.</p>
            </>
          )}
          {tab === 'questions' && (
            <>
              <textarea className="manage__form-textarea" placeholder="Question text *" rows={2} value={formData.question_text || ''} onChange={e => setFormData(p => ({ ...p, question_text: e.target.value }))} />
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
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
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            {['modules', 'lessons', 'articles'].includes(tab) && formData.status !== 'draft' && (
              <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => { setFormData(p => ({ ...p, status: 'draft' })); handleCreate(); }} disabled={saving}>
                Save as Draft
              </button>
            )}
            <button className="admin-btn admin-btn--primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : formData.status === 'draft' || !['modules', 'lessons', 'articles'].includes(tab) ? 'Create' : 'Create & Publish'}
            </button>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleCancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Flashcard Create Form */}
      {showForm && tab === 'flashcards' && (
        <div className="manage__form">
          <h4 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: '#0F1419', margin: '0 0 0.75rem' }}>Create Builtin Flashcard</h4>
          <input className="manage__form-input" placeholder="Term *" value={formData.term || ''} onChange={e => setFormData(p => ({ ...p, term: e.target.value }))} />
          <textarea className="manage__form-textarea" placeholder="Definition *" rows={3} value={formData.definition || ''} onChange={e => setFormData(p => ({ ...p, definition: e.target.value }))} />
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <input className="manage__form-input" style={{ flex: 1 }} placeholder="Hint 1 (optional)" value={formData.hint_1 || ''} onChange={e => setFormData(p => ({ ...p, hint_1: e.target.value }))} />
            <input className="manage__form-input" style={{ flex: 1 }} placeholder="Hint 2 (optional)" value={formData.hint_2 || ''} onChange={e => setFormData(p => ({ ...p, hint_2: e.target.value }))} />
            <input className="manage__form-input" style={{ flex: 1 }} placeholder="Hint 3 (optional)" value={formData.hint_3 || ''} onChange={e => setFormData(p => ({ ...p, hint_3: e.target.value }))} />
          </div>
          <select className="manage__form-input" value={formData.module_id || ''} onChange={e => setFormData(p => ({ ...p, module_id: e.target.value }))}>
            <option value="">Link to module (optional)</option>
            {modules.sort((a, b) => a.order_index - b.order_index).map(m => <option key={m.id} value={m.id}>{m.order_index}. {m.title}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <button className="admin-btn admin-btn--primary" onClick={handleCreateFlashcard} disabled={saving}>{saving ? 'Creating...' : 'Create Flashcard'}</button>
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleCancelForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div style={{ padding: '0.5rem 0' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton skeleton--card" style={{ height: 64 }} />
          ))}
        </div>
      )}

      {/* Content Lists */}
      {!loading && tab !== 'assignments' && tab !== 'activity' && (
        <div className="manage__list" role="list" aria-label={`${tab} list`}>
          {tab === 'modules' && modules.length === 0 && !showForm && (
            <div className="admin-empty">
              <div className="admin-empty__icon">{'\u{1F4DA}'}</div>
              <div className="admin-empty__title">No modules yet</div>
              <div className="admin-empty__desc">Create your first learning module to get started. Modules contain lessons that guide students through topics.</div>
              <div className="admin-empty__action">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(true); setFormData({}); }}>+ Create Module</button>
              </div>
            </div>
          )}
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
                      <input className="manage__form-input" style={{ flex: 1 }} type="number" step="1" min="1" placeholder="Order" value={editModule.order_index ?? m.order_index} onChange={e => setEditModule(p => ({ ...p, order_index: Math.max(1, parseInt(e.target.value) || 1) }))} />
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
                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveModule} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleCancelEditModule}>Cancel</button>
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
                      {' '}{m.difficulty} &middot; {m.estimated_hours}h &middot; {m.lesson_count || 0} lessons
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
                  {' '}Module: {modules.find(m => m.id === l.module_id)?.title || l.module_id?.slice(0, 8)} &middot; Order: {l.order_index} &middot; {l.estimated_minutes}min
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
                  {' '}{a.category || 'Uncategorized'}
                  {a.author && ` \u00B7 ${a.author}`}
                  {a.estimated_minutes && ` \u00B7 ${a.estimated_minutes} min`}
                  {' \u00B7 '}/{a.slug}
                </div>
              </div>
              <div className="manage__item-actions">
                <Link href={`/admin/learn/manage/article-editor/${a.id}`} className="manage__item-btn manage__item-btn--primary">
                  Edit
                </Link>
                <Link href={`/admin/learn/articles/${a.id}`} className="manage__item-btn">View</Link>
                <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('article', a.id, a.title)}>Delete</button>
              </div>
            </div>
          ))}

          {tab === 'questions' && questions.length === 0 && !showForm && (
            <div className="admin-empty" style={{ padding: '2rem' }}>
              <div className="admin-empty__icon">&#x2753;</div>
              <div className="admin-empty__title">No questions loaded</div>
              <div className="admin-empty__desc">Use the Question Builder or Quick Add to add questions to the bank.</div>
            </div>
          )}
          {tab === 'questions' && questions.map(q => (
            <div key={q.id} className="manage__item" style={editingQuestionId === q.id ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>
              {editingQuestionId === q.id ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
                    <textarea className="manage__form-textarea" rows={3} value={editQuestion.question_text ?? q.question_text} onChange={e => setEditQuestion(p => ({ ...p, question_text: e.target.value }))} placeholder="Question text" />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select className="manage__form-input" style={{ flex: 1 }} value={editQuestion.question_type ?? q.question_type} onChange={e => setEditQuestion(p => ({ ...p, question_type: e.target.value }))}>
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True/False</option>
                        <option value="short_answer">Short Answer</option>
                        <option value="fill_blank">Fill in the Blank</option>
                        <option value="multi_select">Multi-Select</option>
                        <option value="numeric_input">Numeric Input</option>
                      </select>
                      <select className="manage__form-input" style={{ flex: 1 }} value={editQuestion.difficulty ?? q.difficulty} onChange={e => setEditQuestion(p => ({ ...p, difficulty: e.target.value }))}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                      <select className="manage__form-input" style={{ flex: 1 }} value={editQuestion.exam_category ?? q.exam_category ?? ''} onChange={e => setEditQuestion(p => ({ ...p, exam_category: e.target.value || null }))}>
                        <option value="">No exam category</option>
                        <option value="SIT">SIT</option>
                        <option value="RPLS">RPLS</option>
                      </select>
                    </div>
                    <input className="manage__form-input" placeholder="Options (pipe-separated: A|B|C|D)" value={editQuestion.options !== undefined ? (typeof editQuestion.options === 'string' ? editQuestion.options : (Array.isArray(editQuestion.options) ? editQuestion.options.join(' | ') : '')) : (Array.isArray(q.options) ? q.options.join(' | ') : '')} onChange={e => setEditQuestion(p => ({ ...p, options: e.target.value }))} />
                    <input className="manage__form-input" placeholder="Correct answer *" value={editQuestion.correct_answer ?? q.correct_answer} onChange={e => setEditQuestion(p => ({ ...p, correct_answer: e.target.value }))} />
                    <textarea className="manage__form-textarea" rows={2} placeholder="Explanation" value={editQuestion.explanation ?? q.explanation ?? ''} onChange={e => setEditQuestion(p => ({ ...p, explanation: e.target.value }))} />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select className="manage__form-input" style={{ flex: 1 }} value={editQuestion.module_id ?? q.module_id ?? ''} onChange={e => setEditQuestion(p => ({ ...p, module_id: e.target.value || null }))}>
                        <option value="">No linked module</option>
                        {modules.sort((a, b) => a.order_index - b.order_index).map(m => <option key={m.id} value={m.id}>{m.order_index}. {m.title}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveQuestion} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleCancelEditQuestion}>Cancel</button>
                    <Link href={`/admin/learn/manage/question-builder`} className="manage__item-btn" style={{ marginLeft: 'auto' }}>Open in Builder</Link>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('question', q.id, q.question_text.substring(0, 40))}>Delete</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="manage__item-info">
                    <div className="manage__item-title" style={{ fontSize: '.85rem' }}>{q.question_text.substring(0, 120)}{q.question_text.length > 120 ? '...' : ''}</div>
                    <div className="manage__item-meta">
                      <span className="manage__qtype-badge">{q.question_type.replace('_', ' ')}</span>
                      {' '}<span className={`manage__diff-badge manage__diff-badge--${q.difficulty}`}>{q.difficulty}</span>
                      {q.exam_category && <span> &middot; {q.exam_category}</span>}
                      {q.module_id && (
                        <span> &middot; <Link href={`/admin/learn/modules/${q.module_id}`} style={{ color: '#1D3095', textDecoration: 'underline', fontSize: '.78rem' }} onClick={e => e.stopPropagation()}>
                          {modules.find(m => m.id === q.module_id)?.title || 'Module'}
                        </Link></span>
                      )}
                      {q.lesson_id && (
                        <span> &middot; <Link href={`/admin/learn/manage/lesson-builder/${q.lesson_id}`} style={{ color: '#059669', textDecoration: 'underline', fontSize: '.78rem' }} onClick={e => e.stopPropagation()}>
                          Lesson
                        </Link></span>
                      )}
                    </div>
                  </div>
                  <div className="manage__item-actions">
                    <button className="manage__item-btn manage__item-btn--primary" onClick={() => { setEditingQuestionId(q.id); setEditQuestion({}); }}>Edit</button>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('question', q.id, q.question_text.substring(0, 40))}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}

          {tab === 'flashcards' && flashcards.map(f => (
            <div key={f.id} className="manage__item" style={editingFlashcardId === f.id ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>
              {editingFlashcardId === f.id ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
                    <input className="manage__form-input" value={editFlashcard.term ?? f.term} onChange={e => setEditFlashcard(p => ({ ...p, term: e.target.value }))} placeholder="Term" />
                    <textarea className="manage__form-textarea" rows={3} value={editFlashcard.definition ?? f.definition} onChange={e => setEditFlashcard(p => ({ ...p, definition: e.target.value }))} placeholder="Definition" />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input className="manage__form-input" style={{ flex: 1 }} value={editFlashcard.hint_1 ?? f.hint_1 ?? ''} onChange={e => setEditFlashcard(p => ({ ...p, hint_1: e.target.value || null }))} placeholder="Hint 1" />
                      <input className="manage__form-input" style={{ flex: 1 }} value={editFlashcard.hint_2 ?? f.hint_2 ?? ''} onChange={e => setEditFlashcard(p => ({ ...p, hint_2: e.target.value || null }))} placeholder="Hint 2" />
                      <input className="manage__form-input" style={{ flex: 1 }} value={editFlashcard.hint_3 ?? f.hint_3 ?? ''} onChange={e => setEditFlashcard(p => ({ ...p, hint_3: e.target.value || null }))} placeholder="Hint 3" />
                    </div>
                    <select className="manage__form-input" value={editFlashcard.module_id ?? f.module_id ?? ''} onChange={e => setEditFlashcard(p => ({ ...p, module_id: e.target.value || null }))}>
                      <option value="">No linked module</option>
                      {modules.sort((a, b) => a.order_index - b.order_index).map(m => <option key={m.id} value={m.id}>{m.order_index}. {m.title}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleSaveFlashcard} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleCancelEditFlashcard}>Cancel</button>
                    <button className="manage__item-btn manage__item-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => handleDelete('flashcard', f.id, f.term)}>Delete</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="manage__item-info">
                    <div className="manage__item-title">{f.term}</div>
                    <div className="manage__item-meta">
                      {f.definition.substring(0, 100)}{f.definition.length > 100 ? '...' : ''}
                      {f.hint_1 && <span> &middot; <span style={{ color: '#7C3AED' }}>3 hints</span></span>}
                      {f.module_id && (
                        <span> &middot; <Link href={`/admin/learn/modules/${f.module_id}`} style={{ color: '#1D3095', textDecoration: 'underline', fontSize: '.78rem' }} onClick={e => e.stopPropagation()}>
                          {modules.find(m => m.id === f.module_id)?.title || 'Module'}
                        </Link></span>
                      )}
                    </div>
                  </div>
                  <div className="manage__item-actions">
                    <button className="manage__item-btn manage__item-btn--primary" onClick={() => { setEditingFlashcardId(f.id); setEditFlashcard({}); }}>Edit</button>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete('flashcard', f.id, f.term)}>Delete</button>
                  </div>
                </>
              )}
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
                        {m.difficulty} &middot; {m.has_custom_xp ? 'Custom' : 'Default'}
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
                          <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#10B981' }}>{m.xp_value} XP &middot; {m.expiry_months}mo</span>
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
                              <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#10B981' }}>{m.xp_value} XP &middot; {m.expiry_months}mo</span>
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
          {tab === 'lessons' && lessons.length === 0 && !showForm && (
            <div className="admin-empty">
              <div className="admin-empty__icon">{'\u{1F4D6}'}</div>
              <div className="admin-empty__title">No lessons yet</div>
              <div className="admin-empty__desc">Lessons live inside modules. Create a lesson and then use the Lesson Builder to add rich content blocks.</div>
              <div className="admin-empty__action">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(true); setFormData({}); }}>+ Create Lesson</button>
              </div>
            </div>
          )}
          {tab === 'articles' && articles.length === 0 && !showForm && (
            <div className="admin-empty">
              <div className="admin-empty__icon">{'\u{1F4C4}'}</div>
              <div className="admin-empty__title">No articles yet</div>
              <div className="admin-empty__desc">Knowledge base articles help students learn key surveying concepts. Create one to get started.</div>
              <div className="admin-empty__action">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(true); setFormData({}); }}>+ Create Article</button>
              </div>
            </div>
          )}
          {tab === 'flashcards' && flashcards.length === 0 && !showForm && (
            <div className="admin-empty">
              <div className="admin-empty__icon">{'\u{1F0CF}'}</div>
              <div className="admin-empty__title">No built-in flashcards yet</div>
              <div className="admin-empty__desc">Built-in flashcards are company-wide study aids linked to modules. Students discover them as they progress.</div>
              <div className="admin-empty__action">
                <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => { setShowForm(true); setFormData({}); }}>+ Create Flashcard</button>
              </div>
            </div>
          )}

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
                  {' \u00B7 Deleted by '}{item.deleted_by}
                  {' \u00B7 '}{new Date(item.deleted_at).toLocaleDateString()}
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
