// app/admin/learn/manage/question-builder/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import FillBlankQuestion from '@/app/admin/components/FillBlankQuestion';
import { usePageError } from '../../../hooks/usePageError';

const ADMIN_EMAILS = ['hankmaddux@starr-surveying.com', 'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com'];

type QType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'multi_select' | 'numeric_input' | 'math_template' | 'essay';

interface Module { id: string; title: string; }
interface Lesson { id: string; title: string; module_id: string; }
interface Question {
  id: string;
  question_text: string;
  question_type: QType;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: string;
  module_id: string | null;
  lesson_id: string | null;
  exam_category: string | null;
  tags: string[];
}

const TYPE_INFO: Record<QType, { label: string; icon: string; desc: string }> = {
  multiple_choice:  { label: 'Multiple Choice',  icon: 'A', desc: 'Student picks one correct answer' },
  true_false:       { label: 'True / False',     icon: 'T', desc: 'Student picks true or false' },
  short_answer:     { label: 'Short Answer',     icon: '?', desc: 'Student types a text answer' },
  fill_blank:       { label: 'Fill in the Blank', icon: '_', desc: 'Drag words into blank spots in a sentence' },
  multi_select:     { label: 'Multi-Select',     icon: '+', desc: 'Student selects all correct answers' },
  numeric_input:    { label: 'Numeric Answer',   icon: '#', desc: 'Student types a number' },
  math_template:    { label: 'Math Template',    icon: 'f', desc: 'Auto-generated numbers with formula grading' },
  essay:            { label: 'Essay / Paragraph', icon: 'E', desc: 'AI-graded paragraph response' },
};

export default function QuestionBuilderPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);
  const { safeFetch, safeAction } = usePageError('QuestionBuilderPage');

  const [qType, setQType] = useState<QType>('multiple_choice');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]); // multi_select
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [moduleId, setModuleId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [examCategory, setExamCategory] = useState('');

  // Fill blank specifics
  const [fillSource, setFillSource] = useState('');
  const [distractors, setDistractors] = useState<string[]>([]);
  const [newDistractor, setNewDistractor] = useState('');

  // Math template specifics
  const [formula, setFormula] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  // Data
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewBlanks, setPreviewBlanks] = useState<string[]>([]);

  const sourceRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadModulesAndLessons();
    loadQuestions();
  }, []);

  async function loadModulesAndLessons() {
    try {
      const [modRes, lesRes] = await Promise.all([
        fetch('/api/admin/learn/modules'),
        fetch('/api/admin/learn/lessons?all=true'),
      ]);
      if (modRes.ok) { const d = await modRes.json(); setModules(d.modules || []); }
      if (lesRes.ok) { const d = await lesRes.json(); setLessons(d.lessons || []); }
    } catch (err) { console.error('QuestionBuilderPage: failed to load modules/lessons', err); }
  }

  async function loadQuestions() {
    try {
      const res = await fetch('/api/admin/learn/questions?limit=100');
      if (res.ok) { const d = await res.json(); setQuestions(d.questions || []); }
    } catch (err) { console.error('QuestionBuilderPage: failed to load questions', err); }
  }

  function resetForm() {
    setQuestionText(''); setOptions(['', '']); setCorrectAnswer('');
    setCorrectAnswers([]); setExplanation(''); setDifficulty('medium');
    setModuleId(''); setLessonId(''); setExamCategory('');
    setFillSource(''); setDistractors([]); setNewDistractor('');
    setFormula(''); setTestResult(null); setEditId(null);
    setShowPreview(false); setPreviewBlanks([]);
  }

  function loadForEdit(q: Question) {
    setQType(q.question_type);
    setQuestionText(q.question_text);
    setExplanation(q.explanation || '');
    setDifficulty(q.difficulty);
    setModuleId(q.module_id || '');
    setLessonId(q.lesson_id || '');
    setExamCategory(q.exam_category || '');
    setEditId(q.id);
    setShowPreview(false);

    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);

    if (q.question_type === 'fill_blank') {
      try {
        const correctArr = JSON.parse(q.correct_answer) as string[];
        // Reconstruct source: replace {{BLANK}} with correct answers
        let src = q.question_text;
        for (const ans of correctArr) {
          src = src.replace('{{BLANK}}', `{{${ans}}}`);
        }
        setFillSource(src);
        // Distractors are opts that aren't correct answers
        const correctSet = new Set(correctArr.map(a => a.toLowerCase()));
        setDistractors(opts.filter((o: string) => !correctSet.has(o.toLowerCase())));
      } catch {
        setFillSource(q.question_text);
      }
      setOptions(opts);
    } else if (q.question_type === 'multi_select') {
      setOptions(opts);
      try { setCorrectAnswers(JSON.parse(q.correct_answer)); } catch { setCorrectAnswers([]); }
    } else if (q.question_type === 'math_template') {
      setFormula(q.correct_answer.replace('formula:', ''));
      setCorrectAnswer(q.correct_answer);
    } else {
      setOptions(opts.length > 0 ? opts : ['', '']);
      setCorrectAnswer(q.correct_answer);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Fill blank: highlight selected text to make blank
  function handleMakeBlank() {
    const ta = sourceRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) { setMessage('Select some text in the source to blank out.'); return; }
    const selected = fillSource.slice(start, end);
    const before = fillSource.slice(0, start);
    const after = fillSource.slice(end);
    setFillSource(before + `{{${selected}}}` + after);
    setMessage('');
  }

  // Build fill_blank question data from source
  function buildFillBlankData() {
    const regex = /\{\{(.+?)\}\}/g;
    const correctArr: string[] = [];
    let match;
    while ((match = regex.exec(fillSource)) !== null) {
      if (match[1] !== 'BLANK') correctArr.push(match[1]);
    }
    const qText = fillSource.replace(/\{\{(.+?)\}\}/g, '{{BLANK}}');
    const allOptions = [...correctArr, ...distractors];
    return { questionText: qText, correctAnswer: JSON.stringify(correctArr), options: allOptions };
  }

  // Math template test
  function testMathTemplate() {
    const regex = /\{\{(\w+):(\d+):(\d+)\}\}/g;
    const vars: Record<string, number> = {};
    let m;
    while ((m = regex.exec(questionText)) !== null) {
      vars[m[1]] = Math.floor(Math.random() * (parseInt(m[3]) - parseInt(m[2]) + 1)) + parseInt(m[2]);
    }
    try {
      const scope: Record<string, unknown> = {
        ...vars, PI: Math.PI, sin: Math.sin, cos: Math.cos, tan: Math.tan,
        sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
        round: (n: number, d: number = 0) => { const f = Math.pow(10, d); return Math.round(n * f) / f; },
      };
      const keys = Object.keys(scope);
      const values = keys.map(k => scope[k]);
      const fn = new Function(...keys, `"use strict"; return (${formula});`);
      const result = fn(...values);
      const display = questionText.replace(/\{\{(\w+):\d+:\d+\}\}/g, (_: string, name: string) => String(vars[name]));
      setTestResult(`Vars: ${JSON.stringify(vars)}\nQuestion: ${display}\nAnswer: ${result}`);
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      let body: any = {
        explanation, difficulty,
        module_id: moduleId || null,
        lesson_id: lessonId || null,
        exam_category: examCategory || null,
      };

      if (qType === 'fill_blank') {
        const data = buildFillBlankData();
        body.question_text = data.questionText;
        body.question_type = 'fill_blank';
        body.options = data.options;
        body.correct_answer = data.correctAnswer;
      } else if (qType === 'multi_select') {
        body.question_text = questionText;
        body.question_type = 'multi_select';
        body.options = options.filter(o => o.trim());
        body.correct_answer = JSON.stringify(correctAnswers);
      } else if (qType === 'math_template') {
        body.question_text = questionText;
        body.question_type = 'math_template';
        body.options = [];
        body.correct_answer = `formula:${formula}`;
      } else if (qType === 'essay') {
        body.question_text = questionText;
        body.question_type = 'essay';
        body.options = [];
        body.correct_answer = correctAnswer; // reference answer for AI grading
      } else if (qType === 'numeric_input') {
        body.question_text = questionText;
        body.question_type = 'numeric_input';
        body.options = [];
        body.correct_answer = correctAnswer;
      } else if (qType === 'true_false') {
        body.question_text = questionText;
        body.question_type = 'true_false';
        body.options = ['True', 'False'];
        body.correct_answer = correctAnswer;
      } else {
        body.question_text = questionText;
        body.question_type = qType;
        body.options = options.filter(o => o.trim());
        body.correct_answer = correctAnswer;
      }

      if (!body.question_text) { setMessage('Question text is required.'); setSaving(false); return; }
      if (!body.correct_answer) { setMessage('Correct answer is required.'); setSaving(false); return; }

      if (editId) body.id = editId;

      const res = await fetch('/api/admin/learn/questions', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(editId ? 'Question updated!' : 'Question created!');
        resetForm();
        loadQuestions();
      } else {
        const err = await res.json();
        setMessage(err.error || 'Failed to save');
      }
    } catch (err) { console.error('QuestionBuilderPage: failed to save question', err); setMessage('Network error'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this question?')) return;
    try {
      const res = await fetch(`/api/admin/learn/questions?id=${id}`, { method: 'DELETE' });
      if (res.ok) { loadQuestions(); if (editId === id) resetForm(); }
    } catch (err) { console.error('QuestionBuilderPage: failed to delete question', err); }
  }

  if (!isAdmin) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x1F512;</div>
        <div className="admin-empty__title">Admin Access Required</div>
        <Link href="/admin/learn" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>&larr; Back</Link>
      </div>
    );
  }

  const filteredLessons = moduleId ? lessons.filter(l => l.module_id === moduleId) : lessons;

  // Build preview data for fill_blank
  const fillPreview = qType === 'fill_blank' ? buildFillBlankData() : null;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/manage" className="learn__back">&larr; Back to Manage Content</Link>
        <h2 className="learn__title">{editId ? 'Edit Question' : 'Question Builder'}</h2>
        <p className="learn__subtitle">Create questions for quizzes, tests, and exams. Choose a type, then fill in the details.</p>
      </div>

      {/* Question Type Selector */}
      <div className="qb__types">
        {(Object.keys(TYPE_INFO) as QType[]).map(t => (
          <button
            key={t}
            className={`qb__type-btn ${qType === t ? 'qb__type-btn--active' : ''}`}
            onClick={() => { setQType(t); if (!editId) { resetForm(); setQType(t); } }}
          >
            <span className="qb__type-icon">{TYPE_INFO[t].icon}</span>
            <span className="qb__type-label">{TYPE_INFO[t].label}</span>
            <span className="qb__type-desc">{TYPE_INFO[t].desc}</span>
          </button>
        ))}
      </div>

      {/* Editor Form */}
      <div className="qb__editor">
        <h3 className="qb__section-title">
          {TYPE_INFO[qType].label} Question
          {editId && <span className="qb__editing-badge">Editing</span>}
        </h3>

        {/* MULTIPLE CHOICE */}
        {qType === 'multiple_choice' && (
          <>
            <textarea className="qb__textarea" placeholder="Question text *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <div className="qb__options-editor">
              <label className="qb__label">Answer Options (click to mark correct)</label>
              {options.map((opt, i) => (
                <div key={i} className="qb__option-row">
                  <div
                    className={`qb__option-correct ${correctAnswer === opt && opt ? 'qb__option-correct--active' : ''}`}
                    onClick={() => { if (opt) setCorrectAnswer(opt); }}
                    title="Mark as correct"
                  >
                    {correctAnswer === opt && opt ? '\u2713' : ''}
                  </div>
                  <input className="qb__input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt} onChange={e => {
                    const newOpts = [...options];
                    if (correctAnswer === options[i]) setCorrectAnswer(e.target.value);
                    newOpts[i] = e.target.value;
                    setOptions(newOpts);
                  }} />
                  {options.length > 2 && (
                    <button className="qb__option-remove" onClick={() => {
                      const newOpts = options.filter((_, j) => j !== i);
                      setOptions(newOpts);
                      if (correctAnswer === opt) setCorrectAnswer('');
                    }}>&times;</button>
                  )}
                </div>
              ))}
              {options.length < 8 && (
                <button className="qb__add-option" onClick={() => setOptions([...options, ''])}>+ Add Option</button>
              )}
            </div>
          </>
        )}

        {/* TRUE / FALSE */}
        {qType === 'true_false' && (
          <>
            <textarea className="qb__textarea" placeholder="Statement (the student will mark it true or false) *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <label className="qb__label">Correct Answer</label>
            <div className="qb__tf-options">
              {['True', 'False'].map(v => (
                <div key={v} className={`qb__tf-btn ${correctAnswer === v ? 'qb__tf-btn--active' : ''}`} onClick={() => setCorrectAnswer(v)}>{v}</div>
              ))}
            </div>
          </>
        )}

        {/* SHORT ANSWER */}
        {qType === 'short_answer' && (
          <>
            <textarea className="qb__textarea" placeholder="Question text *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <input className="qb__input" placeholder="Correct answer (case-insensitive) *" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} />
          </>
        )}

        {/* FILL IN THE BLANK */}
        {qType === 'fill_blank' && (
          <>
            <label className="qb__label">Source Text (wrap blank words in {'{{double braces}}'} or select text and click &quot;Make Blank&quot;)</label>
            <textarea
              ref={sourceRef}
              className="qb__textarea"
              placeholder='E.g.: The {{Texas General Land Office}} was established in {{1836}}.'
              rows={4}
              value={fillSource}
              onChange={e => setFillSource(e.target.value)}
            />
            <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={handleMakeBlank} style={{ marginBottom: '.75rem' }}>
              Make Selection a Blank
            </button>

            {/* Distractors */}
            <label className="qb__label">Distractor Words (wrong answers to mix in)</label>
            <div className="qb__distractor-list">
              {distractors.map((d, i) => (
                <span key={i} className="qb__distractor-tag">
                  {d}
                  <button onClick={() => setDistractors(distractors.filter((_, j) => j !== i))}>&times;</button>
                </span>
              ))}
            </div>
            <div className="qb__distractor-add">
              <input className="qb__input" placeholder="Add distractor word..." value={newDistractor} onChange={e => setNewDistractor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newDistractor.trim()) { e.preventDefault(); setDistractors([...distractors, newDistractor.trim()]); setNewDistractor(''); } }} />
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { if (newDistractor.trim()) { setDistractors([...distractors, newDistractor.trim()]); setNewDistractor(''); } }}>Add</button>
            </div>

            {/* Preview */}
            {fillPreview && fillPreview.options.length > 0 && (
              <div className="qb__preview-section">
                <label className="qb__label">Preview</label>
                <FillBlankQuestion
                  questionText={fillPreview.questionText}
                  options={fillPreview.options}
                  blanks={previewBlanks}
                  onChange={setPreviewBlanks}
                />
              </div>
            )}
          </>
        )}

        {/* MULTI SELECT */}
        {qType === 'multi_select' && (
          <>
            <textarea className="qb__textarea" placeholder="Question text (e.g., Select all that apply...) *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <div className="qb__options-editor">
              <label className="qb__label">Options (check all correct answers)</label>
              {options.map((opt, i) => (
                <div key={i} className="qb__option-row">
                  <div
                    className={`qb__option-correct qb__option-correct--check ${correctAnswers.includes(opt) && opt ? 'qb__option-correct--active' : ''}`}
                    onClick={() => {
                      if (!opt) return;
                      if (correctAnswers.includes(opt)) setCorrectAnswers(correctAnswers.filter(a => a !== opt));
                      else setCorrectAnswers([...correctAnswers, opt]);
                    }}
                    title="Mark as correct"
                  >
                    {correctAnswers.includes(opt) && opt ? '\u2713' : ''}
                  </div>
                  <input className="qb__input" placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt} onChange={e => {
                    const newOpts = [...options];
                    const wasCorrect = correctAnswers.includes(options[i]);
                    if (wasCorrect) {
                      setCorrectAnswers(correctAnswers.map(a => a === options[i] ? e.target.value : a));
                    }
                    newOpts[i] = e.target.value;
                    setOptions(newOpts);
                  }} />
                  {options.length > 2 && (
                    <button className="qb__option-remove" onClick={() => {
                      setCorrectAnswers(correctAnswers.filter(a => a !== options[i]));
                      setOptions(options.filter((_, j) => j !== i));
                    }}>&times;</button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button className="qb__add-option" onClick={() => setOptions([...options, ''])}>+ Add Option</button>
              )}
            </div>
          </>
        )}

        {/* NUMERIC INPUT */}
        {qType === 'numeric_input' && (
          <>
            <textarea className="qb__textarea" placeholder="Question text (e.g., What is the sum of 15 and 27?) *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <input className="qb__input" type="number" step="any" placeholder="Correct numeric answer *" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} />
            <p className="qb__hint">Answers are compared with a tolerance of 0.01.</p>
          </>
        )}

        {/* ESSAY / PARAGRAPH */}
        {qType === 'essay' && (
          <>
            <textarea className="qb__textarea" placeholder="Question text (e.g., Explain the general steps involved in...) *" rows={4} value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <label className="qb__label">Reference Answer (what a good answer should cover — used by AI to grade)</label>
            <textarea className="qb__textarea" placeholder="A strong answer should mention: project planning, field reconnaissance, establishing control, data collection, computations/adjustments, map preparation, and final deliverables..." rows={5} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} />
            <p className="qb__hint">The AI will use this reference to evaluate the student&apos;s paragraph response. Be thorough — list the key points, concepts, and terminology a good answer should include.</p>
          </>
        )}

        {/* MATH TEMPLATE */}
        {qType === 'math_template' && (
          <>
            <label className="qb__label">Question Template (use {'{{varName:min:max}}'} for random numbers)</label>
            <textarea
              className="qb__textarea"
              placeholder='E.g.: A surveyor measures {{d:100:500}} feet at a bearing of N{{a:10:80}}°E. What is the departure?'
              rows={4}
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
            />
            <label className="qb__label">Answer Formula (use variable names, math functions: sin, cos, tan, sqrt, pow, round, PI)</label>
            <input
              className="qb__input"
              placeholder='E.g.: round(d * sin(a * PI / 180), 2)'
              value={formula}
              onChange={e => setFormula(e.target.value)}
            />
            <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={testMathTemplate} style={{ marginTop: '.5rem' }}>
              Test with Random Values
            </button>
            {testResult && <pre className="qb__test-result">{testResult}</pre>}
          </>
        )}

        {/* Common Fields */}
        <div className="qb__common">
          <textarea className="qb__textarea" placeholder="Explanation (shown after grading, optional)" rows={2} value={explanation} onChange={e => setExplanation(e.target.value)} />
          <div className="qb__row">
            <select className="qb__select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select className="qb__select" value={moduleId} onChange={e => { setModuleId(e.target.value); setLessonId(''); }}>
              <option value="">Module (optional)</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
            <select className="qb__select" value={lessonId} onChange={e => setLessonId(e.target.value)}>
              <option value="">Lesson (optional)</option>
              {filteredLessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
            <select className="qb__select" value={examCategory} onChange={e => setExamCategory(e.target.value)}>
              <option value="">Exam (optional)</option>
              <option value="SIT">SIT</option>
              <option value="RPLS">RPLS</option>
            </select>
          </div>
        </div>

        {message && <p className={`qb__message ${message.includes('!') ? 'qb__message--success' : 'qb__message--error'}`}>{message}</p>}

        <div className="qb__actions">
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editId ? 'Update Question' : 'Create Question'}
          </button>
          {editId && (
            <button className="admin-btn admin-btn--ghost" onClick={resetForm}>Cancel Edit</button>
          )}
        </div>
      </div>

      {/* Question Bank List */}
      <div className="qb__bank">
        <h3 className="qb__section-title">Question Bank ({questions.length} questions)</h3>
        {questions.length === 0 && (
          <div className="admin-empty" style={{ padding: '2rem' }}>
            <div className="admin-empty__icon">&#x2753;</div>
            <div className="admin-empty__title">No questions yet</div>
            <div className="admin-empty__desc">Create your first question above.</div>
          </div>
        )}
        <div className="qb__bank-list">
          {questions.map(q => {
            const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
            return (
              <div key={q.id} className={`qb__bank-item ${editId === q.id ? 'qb__bank-item--editing' : ''}`}>
                <div className="qb__bank-item-main">
                  <span className="qb__bank-type">{TYPE_INFO[q.question_type]?.label || q.question_type}</span>
                  <span className={`qb__bank-diff qb__bank-diff--${q.difficulty}`}>{q.difficulty}</span>
                  {q.exam_category && <span className="qb__bank-exam">{q.exam_category}</span>}
                </div>
                <p className="qb__bank-text">{q.question_text.substring(0, 150)}{q.question_text.length > 150 ? '...' : ''}</p>
                {q.question_type !== 'fill_blank' && q.question_type !== 'math_template' && (
                  <p className="qb__bank-answer">Correct: {q.correct_answer.substring(0, 80)}</p>
                )}
                {opts.length > 0 && q.question_type !== 'fill_blank' && (
                  <p className="qb__bank-opts">{opts.length} options</p>
                )}
                <div className="qb__bank-actions">
                  <button className="manage__item-btn" onClick={() => loadForEdit(q)}>Edit</button>
                  <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDelete(q.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
