// app/admin/learn/manage/question-builder/page.tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import FillBlankQuestion from '@/app/admin/components/FillBlankQuestion';
import { usePageError } from '../../../hooks/usePageError';
import { useToast } from '../../../components/Toast';

const ADMIN_EMAILS = ['hankmaddux@starr-surveying.com', 'jacobmaddux@starr-surveying.com', 'info@starr-surveying.com'];

type QType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'multi_select' | 'numeric_input' | 'math_template' | 'essay';
type Tab = 'questions' | 'templates' | 'generators';

interface Module { id: string; title: string; }
interface Lesson { id: string; title: string; module_id: string; }
interface Topic { id: string; title: string; lesson_id: string; }
interface StudyRef { type: 'topic' | 'lesson' | 'module'; id: string; label: string; }
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
  topic_id: string | null;
  study_references: StudyRef[];
  tags: string[];
  template_id?: string | null;
  is_dynamic?: boolean;
  solution_steps?: SolutionStep[];
  tolerance?: number;
  stats?: { attempts: number; correct: number; wrong: number; pass_rate: number | null };
}

interface SolutionStep {
  step_number: number;
  title: string;
  description?: string;
  formula?: string;
  calculation?: string;
  result?: string;
}

interface TemplateParam {
  name: string;
  label: string;
  type: 'integer' | 'float' | 'angle_dms' | 'bearing' | 'choice' | 'computed';
  min?: number;
  max?: number;
  decimals?: number;
  step?: number;
  unit?: string;
  choices?: string[];
  formula?: string;
}

interface ComputedVar {
  name: string;
  formula: string;
}

interface SolutionStepTemplate {
  step_number: number;
  title: string;
  description_template?: string;
  formula?: string;
  calculation_template?: string;
  result_template?: string;
}

interface ProblemTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  question_type: string;
  difficulty: string;
  question_template: string;
  answer_formula: string;
  answer_format: { decimals?: number; tolerance?: number; unit?: string };
  parameters: TemplateParam[];
  computed_vars: ComputedVar[];
  solution_steps_template: SolutionStepTemplate[];
  options_generator: { method: string; offsets?: { add?: number; multiply?: number }[]; wrong_formulas?: string[] };
  explanation_template?: string;
  module_id?: string;
  lesson_id?: string;
  topic_id?: string;
  exam_category?: string;
  tags: string[];
  study_references?: StudyRef[];
  generator_id?: string;
  is_active: boolean;
}

interface GeneratorInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  module: number;
  difficulties: string[];
}

interface GeneratedProblem {
  id: string;
  question_text: string;
  question_type: string;
  options?: string[];
  correct_answer: string;
  tolerance: number;
  solution_steps: SolutionStep[];
  difficulty: string;
  category: string;
  subcategory: string;
  tags: string[];
  explanation: string;
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

const EMPTY_PARAM: TemplateParam = { name: '', label: '', type: 'float', min: 0, max: 100, decimals: 2 };
const EMPTY_COMPUTED: ComputedVar = { name: '', formula: '' };
const EMPTY_STEP: SolutionStepTemplate = { step_number: 1, title: '', description_template: '', formula: '', calculation_template: '', result_template: '' };

export default function QuestionBuilderPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);
  const { safeFetch, safeAction } = usePageError('QuestionBuilderPage');
  const { addToast } = useToast();

  // ========= SHARED STATE =========
  const [activeTab, setActiveTab] = useState<Tab>('questions');
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // ========= QUESTIONS TAB STATE =========
  const [qType, setQType] = useState<QType>('multiple_choice');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [moduleId, setModuleId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [examCategory, setExamCategory] = useState('');
  const [topicId, setTopicId] = useState('');
  const [studyRefs, setStudyRefs] = useState<StudyRef[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [fillSource, setFillSource] = useState('');
  const [distractors, setDistractors] = useState<string[]>([]);
  const [newDistractor, setNewDistractor] = useState('');
  const [formula, setFormula] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBlanks, setPreviewBlanks] = useState<string[]>([]);
  const [qFilter, setQFilter] = useState('');
  const [qTypeFilter, setQTypeFilter] = useState<string>('all');
  const [qDiffFilter, setQDiffFilter] = useState<string>('all');
  // Solution steps for static questions
  const [solutionSteps, setSolutionSteps] = useState<SolutionStep[]>([]);
  const [tolerance, setTolerance] = useState('0.01');

  // ========= TEMPLATES TAB STATE =========
  const [templates, setTemplates] = useState<ProblemTemplate[]>([]);
  const [tmplEditId, setTmplEditId] = useState<string | null>(null);
  const [tmplName, setTmplName] = useState('');
  const [tmplDescription, setTmplDescription] = useState('');
  const [tmplCategory, setTmplCategory] = useState('');
  const [tmplSubcategory, setTmplSubcategory] = useState('');
  const [tmplQuestionType, setTmplQuestionType] = useState('numeric_input');
  const [tmplDifficulty, setTmplDifficulty] = useState('medium');
  const [tmplQuestionTemplate, setTmplQuestionTemplate] = useState('');
  const [tmplAnswerFormula, setTmplAnswerFormula] = useState('');
  const [tmplDecimals, setTmplDecimals] = useState(2);
  const [tmplTolerance, setTmplTolerance] = useState(0.01);
  const [tmplUnit, setTmplUnit] = useState('');
  const [tmplParams, setTmplParams] = useState<TemplateParam[]>([]);
  const [tmplComputedVars, setTmplComputedVars] = useState<ComputedVar[]>([]);
  const [tmplSolutionSteps, setTmplSolutionSteps] = useState<SolutionStepTemplate[]>([]);
  const [tmplExplanation, setTmplExplanation] = useState('');
  const [tmplModuleId, setTmplModuleId] = useState('');
  const [tmplLessonId, setTmplLessonId] = useState('');
  const [tmplExamCategory, setTmplExamCategory] = useState('');
  const [tmplTags, setTmplTags] = useState<string[]>([]);
  const [tmplTagInput, setTmplTagInput] = useState('');
  const [tmplGeneratorId, setTmplGeneratorId] = useState('');
  const [tmplPreviewResult, setTmplPreviewResult] = useState<GeneratedProblem | null>(null);
  const [tmplPreviewParams, setTmplPreviewParams] = useState<Record<string, unknown> | null>(null);
  const [tmplFilter, setTmplFilter] = useState('');

  // ========= GENERATORS TAB STATE =========
  const [generators, setGenerators] = useState<GeneratorInfo[]>([]);
  const [genSelected, setGenSelected] = useState('');
  const [genCount, setGenCount] = useState(5);
  const [genPreview, setGenPreview] = useState<GeneratedProblem[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genPublishLesson, setGenPublishLesson] = useState('');
  const [genPublishModule, setGenPublishModule] = useState('');
  const [genPublishExam, setGenPublishExam] = useState('');

  // ========= BULK IMPORT STATE =========
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; errors: string[] } | null>(null);

  // ========= SIMULATED SCORING STATE =========
  const [showSimQuiz, setShowSimQuiz] = useState(false);
  const [simQuestions, setSimQuestions] = useState<Question[]>([]);
  const [simAnswers, setSimAnswers] = useState<Record<string, string>>({});
  const [simRevealed, setSimRevealed] = useState(false);

  const sourceRef = useRef<HTMLTextAreaElement>(null);

  // ========= QUIZ ANALYTICS STATE =========
  const [showQuizAnalytics, setShowQuizAnalytics] = useState(false);
  const [quizAnalytics, setQuizAnalytics] = useState<{
    summary: { total_attempts: number; passed: number; failed: number; pass_rate: number; avg_score: number; avg_time_seconds: number; unique_users: number };
    breakdown: { key: string; label: string; attempts: number; passed: number; failed: number; avg_score: number; pass_rate: number }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  async function loadQuizAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/admin/learn/user-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_quiz_analytics' }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuizAnalytics(data);
      }
    } catch (err) { console.error('Failed to load quiz analytics', err); }
    setAnalyticsLoading(false);
  }

  // Track if form is dirty (has unsaved changes)
  const isQuestionFormDirty = Boolean(questionText || explanation || options.some(o => o.trim()) || correctAnswer || correctAnswers.length > 0 || fillSource || formula || solutionSteps.length > 0 || tags.length > 0);

  function safeResetForm() {
    if (!isQuestionFormDirty || confirm('You have unsaved changes. Discard them?')) {
      resetForm();
    }
  }

  // ========= EFFECTS =========
  useEffect(() => {
    loadModulesAndLessons();
    loadQuestions();
    loadTemplates();
    loadGenerators();
  }, []);

  useEffect(() => {
    if (lessonId) loadTopics(lessonId);
    else { setTopics([]); setTopicId(''); }
  }, [lessonId]);

  useEffect(() => {
    if (tmplLessonId) loadTopics(tmplLessonId);
  }, [tmplLessonId]);

  // ========= DATA LOADING =========
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

  async function loadTopics(lid: string) {
    try {
      const res = await fetch(`/api/admin/learn/topics?lessonId=${lid}`);
      if (res.ok) { const d = await res.json(); setTopics(d.topics || []); }
    } catch { setTopics([]); }
  }

  async function loadQuestions() {
    try {
      const res = await fetch('/api/admin/learn/questions?limit=500&stats=true');
      if (res.ok) { const d = await res.json(); setQuestions(d.questions || []); }
    } catch (err) { console.error('QuestionBuilderPage: failed to load questions', err); }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/admin/learn/templates?action=list');
      if (res.ok) { const d = await res.json(); setTemplates(d.templates || []); }
    } catch (err) { console.error('QuestionBuilderPage: failed to load templates', err); }
  }

  async function loadGenerators() {
    try {
      const res = await fetch('/api/admin/learn/templates?action=generators');
      if (res.ok) { const d = await res.json(); setGenerators(d.generators || []); }
    } catch (err) { console.error('QuestionBuilderPage: failed to load generators', err); }
  }

  // ========= QUESTIONS TAB FUNCTIONS =========
  function resetForm() {
    setQuestionText(''); setOptions(['', '']); setCorrectAnswer('');
    setCorrectAnswers([]); setExplanation(''); setDifficulty('medium');
    setModuleId(''); setLessonId(''); setExamCategory('');
    setTopicId(''); setStudyRefs([]); setTags([]); setTagInput('');
    setFillSource(''); setDistractors([]); setNewDistractor('');
    setFormula(''); setTestResult(null); setEditId(null);
    setShowPreview(false); setPreviewBlanks([]);
    setSolutionSteps([]); setTolerance('0.01');
  }

  function loadForEdit(q: Question) {
    setActiveTab('questions');
    setQType(q.question_type);
    setQuestionText(q.question_text);
    setExplanation(q.explanation || '');
    setDifficulty(q.difficulty);
    setModuleId(q.module_id || '');
    setLessonId(q.lesson_id || '');
    setExamCategory(q.exam_category || '');
    setTopicId(q.topic_id || '');
    setStudyRefs(q.study_references || []);
    setTags(q.tags || []);
    setEditId(q.id);
    setShowPreview(false);
    setSolutionSteps(q.solution_steps || []);
    setTolerance(String(q.tolerance ?? 0.01));

    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);

    if (q.question_type === 'fill_blank') {
      try {
        const correctArr = JSON.parse(q.correct_answer) as string[];
        let src = q.question_text;
        for (const ans of correctArr) { src = src.replace('{{BLANK}}', `{{${ans}}}`); }
        setFillSource(src);
        const correctSet = new Set(correctArr.map(a => a.toLowerCase()));
        setDistractors(opts.filter((o: string) => !correctSet.has(o.toLowerCase())));
      } catch { setFillSource(q.question_text); }
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
        topic_id: topicId || null,
        study_references: studyRefs,
        tags,
        solution_steps: solutionSteps.length > 0 ? solutionSteps : undefined,
        tolerance: parseFloat(tolerance) || 0.01,
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
        body.is_dynamic = true;
      } else if (qType === 'essay') {
        body.question_text = questionText;
        body.question_type = 'essay';
        body.options = [];
        body.correct_answer = correctAnswer;
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
        addToast(editId ? 'Question updated!' : 'Question created successfully!', 'success');
        resetForm();
        loadQuestions();
      } else {
        const err = await res.json();
        setMessage(err.error || 'Failed to save');
        addToast(err.error || 'Failed to save question.', 'error');
      }
    } catch (err) {
      console.error('QuestionBuilderPage: failed to save question', err);
      setMessage('Network error');
      addToast('Network error — check your connection.', 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this question?')) return;
    try {
      const res = await fetch(`/api/admin/learn/questions?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadQuestions();
        if (editId === id) resetForm();
        addToast('Question deleted.', 'info');
      }
    } catch (err) { console.error('QuestionBuilderPage: failed to delete question', err); }
  }

  // ========= BULK IMPORT =========
  async function handleBulkImport() {
    setBulkImporting(true);
    setBulkResult(null);
    try {
      const parsed = JSON.parse(bulkJson);
      const items: any[] = Array.isArray(parsed) ? parsed : [parsed];
      let success = 0;
      const errors: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const q = items[i];
        if (!q.question_text || !q.correct_answer) {
          errors.push(`Item ${i + 1}: Missing question_text or correct_answer`);
          continue;
        }
        try {
          const res = await fetch('/api/admin/learn/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: q.question_text,
              question_type: q.question_type || 'multiple_choice',
              options: q.options || [],
              correct_answer: q.correct_answer,
              explanation: q.explanation || '',
              difficulty: q.difficulty || 'medium',
              module_id: q.module_id || null,
              lesson_id: q.lesson_id || null,
              exam_category: q.exam_category || null,
              tags: q.tags || [],
            }),
          });
          if (res.ok) success++;
          else { const e = await res.json(); errors.push(`Item ${i + 1}: ${e.error || 'Failed'}`); }
        } catch { errors.push(`Item ${i + 1}: Network error`); }
      }
      setBulkResult({ success, errors });
      if (success > 0) loadQuestions();
    } catch {
      setBulkResult({ success: 0, errors: ['Invalid JSON. Please paste a valid JSON array of questions.'] });
    }
    setBulkImporting(false);
  }

  // ========= SIMULATED SCORING =========
  function startSimQuiz(pool: Question[]) {
    const eligible = pool.filter(q => q.question_type === 'multiple_choice' || q.question_type === 'true_false');
    const shuffled = [...eligible].sort(() => Math.random() - 0.5).slice(0, 10);
    setSimQuestions(shuffled);
    setSimAnswers({});
    setSimRevealed(false);
    setShowSimQuiz(true);
  }

  function getSimScore(): { correct: number; total: number } {
    let correct = 0;
    for (const q of simQuestions) {
      if (simAnswers[q.id] === q.correct_answer) correct++;
    }
    return { correct, total: simQuestions.length };
  }

  // ========= TEMPLATE TAB FUNCTIONS =========
  function resetTemplateForm() {
    setTmplEditId(null); setTmplName(''); setTmplDescription('');
    setTmplCategory(''); setTmplSubcategory(''); setTmplQuestionType('numeric_input');
    setTmplDifficulty('medium'); setTmplQuestionTemplate(''); setTmplAnswerFormula('');
    setTmplDecimals(2); setTmplTolerance(0.01); setTmplUnit('');
    setTmplParams([]); setTmplComputedVars([]); setTmplSolutionSteps([]);
    setTmplExplanation(''); setTmplModuleId(''); setTmplLessonId('');
    setTmplExamCategory(''); setTmplTags([]); setTmplTagInput('');
    setTmplGeneratorId(''); setTmplPreviewResult(null); setTmplPreviewParams(null);
  }

  function loadTemplateForEdit(t: ProblemTemplate) {
    setActiveTab('templates');
    setTmplEditId(t.id);
    setTmplName(t.name);
    setTmplDescription(t.description || '');
    setTmplCategory(t.category);
    setTmplSubcategory(t.subcategory || '');
    setTmplQuestionType(t.question_type);
    setTmplDifficulty(t.difficulty);
    setTmplQuestionTemplate(t.question_template);
    setTmplAnswerFormula(t.answer_formula);
    setTmplDecimals(t.answer_format?.decimals ?? 2);
    setTmplTolerance(t.answer_format?.tolerance ?? 0.01);
    setTmplUnit(t.answer_format?.unit || '');
    setTmplParams(t.parameters || []);
    setTmplComputedVars(t.computed_vars || []);
    setTmplSolutionSteps(t.solution_steps_template || []);
    setTmplExplanation(t.explanation_template || '');
    setTmplModuleId(t.module_id || '');
    setTmplLessonId(t.lesson_id || '');
    setTmplExamCategory(t.exam_category || '');
    setTmplTags(t.tags || []);
    setTmplGeneratorId(t.generator_id || '');
    setTmplPreviewResult(null);
    setTmplPreviewParams(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handlePreviewTemplate() {
    setMessage('');
    try {
      const body: any = {
        action: 'preview',
        name: tmplName || 'Preview',
        category: tmplCategory || 'Preview',
        subcategory: tmplSubcategory,
        question_type: tmplQuestionType,
        difficulty: tmplDifficulty,
        question_template: tmplQuestionTemplate,
        answer_formula: tmplAnswerFormula,
        answer_format: { decimals: tmplDecimals, tolerance: tmplTolerance, unit: tmplUnit },
        parameters: tmplParams,
        computed_vars: tmplComputedVars,
        solution_steps_template: tmplSolutionSteps,
        explanation_template: tmplExplanation,
        tags: tmplTags,
        generator_id: tmplGeneratorId || undefined,
      };
      const res = await fetch('/api/admin/learn/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setTmplPreviewResult(data.problem);
        setTmplPreviewParams(data.parameters || null);
        setMessage('Preview generated!');
      } else {
        setMessage(data.error || 'Preview failed');
        if (data.validation_errors) {
          setMessage(data.validation_errors.join('; '));
        }
      }
    } catch (err) { setMessage('Network error during preview'); }
  }

  async function handleSaveTemplate() {
    setSaving(true); setMessage('');
    try {
      const body: any = {
        name: tmplName,
        description: tmplDescription || null,
        category: tmplCategory,
        subcategory: tmplSubcategory || null,
        question_type: tmplQuestionType,
        difficulty: tmplDifficulty,
        question_template: tmplQuestionTemplate,
        answer_formula: tmplAnswerFormula,
        answer_format: { decimals: tmplDecimals, tolerance: tmplTolerance, unit: tmplUnit || undefined },
        parameters: tmplParams,
        computed_vars: tmplComputedVars,
        solution_steps_template: tmplSolutionSteps,
        explanation_template: tmplExplanation || null,
        module_id: tmplModuleId || null,
        lesson_id: tmplLessonId || null,
        exam_category: tmplExamCategory || null,
        tags: tmplTags,
        generator_id: tmplGeneratorId || null,
      };

      if (tmplEditId) {
        body.id = tmplEditId;
        const res = await fetch('/api/admin/learn/templates', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { setMessage('Template updated!'); loadTemplates(); }
        else { const err = await res.json(); setMessage(err.error || 'Failed to update'); }
      } else {
        const res = await fetch('/api/admin/learn/templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { setMessage('Template created!'); resetTemplateForm(); loadTemplates(); }
        else { const err = await res.json(); setMessage(err.error || (err.validation_errors || []).join('; ') || 'Failed to create'); }
      }
    } catch { setMessage('Network error'); }
    setSaving(false);
  }

  async function handlePublishTemplate(templateId: string, count: number, asDynamic: boolean) {
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/admin/learn/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', template_id: templateId, count, as_dynamic: asDynamic }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Published ${data.count} question(s) to the question bank!`);
        loadQuestions();
      } else { setMessage(data.error || 'Failed to publish'); }
    } catch { setMessage('Network error'); }
    setSaving(false);
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Deactivate this template?')) return;
    try {
      const res = await fetch(`/api/admin/learn/templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) { loadTemplates(); if (tmplEditId === id) resetTemplateForm(); }
    } catch { setMessage('Failed to delete template'); }
  }

  // ========= GENERATORS TAB FUNCTIONS =========
  async function handleGeneratePreview() {
    if (!genSelected) return;
    setGenLoading(true);
    try {
      const res = await fetch('/api/admin/learn/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_hardcoded', generator_id: genSelected, count: genCount }),
      });
      const data = await res.json();
      if (res.ok) { setGenPreview(data.problems || []); }
      else { setMessage(data.error || 'Generation failed'); }
    } catch { setMessage('Network error'); }
    setGenLoading(false);
  }

  async function handlePublishGenerated() {
    if (!genSelected) return;
    setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/admin/learn/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish_hardcoded',
          generator_id: genSelected,
          count: genCount,
          lesson_id: genPublishLesson || null,
          module_id: genPublishModule || null,
          exam_category: genPublishExam || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Published ${data.count} question(s) from "${data.generator}" to the question bank!`);
        loadQuestions();
      } else { setMessage(data.error || 'Publish failed'); }
    } catch { setMessage('Network error'); }
    setSaving(false);
  }

  // ========= ACCESS CHECK =========
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
  const tmplFilteredLessons = tmplModuleId ? lessons.filter(l => l.module_id === tmplModuleId) : lessons;
  const fillPreview = qType === 'fill_blank' ? buildFillBlankData() : null;

  // Filtered questions
  const filteredQuestions = questions.filter(q => {
    if (qTypeFilter !== 'all' && q.question_type !== qTypeFilter) return false;
    if (qDiffFilter !== 'all' && q.difficulty !== qDiffFilter) return false;
    if (qFilter && !q.question_text.toLowerCase().includes(qFilter.toLowerCase()) &&
        !(q.tags || []).some(t => t.toLowerCase().includes(qFilter.toLowerCase()))) return false;
    return true;
  });

  // Filtered templates
  const filteredTemplates = templates.filter(t => {
    if (tmplFilter && !t.name.toLowerCase().includes(tmplFilter.toLowerCase()) &&
        !t.category.toLowerCase().includes(tmplFilter.toLowerCase())) return false;
    return true;
  });

  // Group generators
  const genGrouped: Record<string, GeneratorInfo[]> = {};
  for (const g of generators) {
    if (!genGrouped[g.category]) genGrouped[g.category] = [];
    genGrouped[g.category].push(g);
  }

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/manage?tab=questions" className="learn__back">&larr; Back to Questions</Link>
        <h2 className="learn__title">Problem Builder</h2>
        <p className="learn__subtitle">Create, edit, and auto-generate questions for quizzes, tests, and practice sessions.</p>
      </div>

      {/* Tab Navigation */}
      <div className="qb__tabs">
        <button className={`qb__tab ${activeTab === 'questions' ? 'qb__tab--active' : ''}`} onClick={() => setActiveTab('questions')}>
          Questions ({questions.length})
        </button>
        <button className={`qb__tab ${activeTab === 'templates' ? 'qb__tab--active' : ''}`} onClick={() => setActiveTab('templates')}>
          Templates ({templates.length})
        </button>
        <button className={`qb__tab ${activeTab === 'generators' ? 'qb__tab--active' : ''}`} onClick={() => setActiveTab('generators')}>
          Auto-Generate ({generators.length})
        </button>
      </div>

      {message && <p className={`qb__message ${message.includes('!') ? 'qb__message--success' : 'qb__message--error'}`}>{message}</p>}

      {/* ================================================================== */}
      {/* TAB 1: QUESTIONS (Static question CRUD — the original builder) */}
      {/* ================================================================== */}
      {activeTab === 'questions' && (
        <>
          {/* Question Type Selector */}
          <div className="qb__types">
            {(Object.keys(TYPE_INFO) as QType[]).map(t => (
              <button
                key={t}
                className={`qb__type-btn ${qType === t ? 'qb__type-btn--active' : ''}`}
                onClick={() => {
                  if (editId) { setQType(t); return; }
                  if (isQuestionFormDirty && !confirm('Switch question type? Unsaved data will be lost.')) return;
                  resetForm(); setQType(t);
                }}
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
                <textarea ref={sourceRef} className="qb__textarea"
                  placeholder='E.g.: The {{Texas General Land Office}} was established in {{1836}}.'
                  rows={4} value={fillSource} onChange={e => setFillSource(e.target.value)} />
                <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={handleMakeBlank} style={{ marginBottom: '.75rem' }}>
                  Make Selection a Blank
                </button>
                <label className="qb__label">Distractor Words (wrong answers to mix in)</label>
                <div className="qb__distractor-list">
                  {distractors.map((d, i) => (
                    <span key={i} className="qb__distractor-tag">
                      {d} <button onClick={() => setDistractors(distractors.filter((_, j) => j !== i))}>&times;</button>
                    </span>
                  ))}
                </div>
                <div className="qb__distractor-add">
                  <input className="qb__input" placeholder="Add distractor word..." value={newDistractor} onChange={e => setNewDistractor(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newDistractor.trim()) { e.preventDefault(); setDistractors([...distractors, newDistractor.trim()]); setNewDistractor(''); } }} />
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { if (newDistractor.trim()) { setDistractors([...distractors, newDistractor.trim()]); setNewDistractor(''); } }}>Add</button>
                </div>
                {fillPreview && fillPreview.options.length > 0 && (
                  <div className="qb__preview-section">
                    <label className="qb__label">Preview</label>
                    <FillBlankQuestion questionText={fillPreview.questionText} options={fillPreview.options} blanks={previewBlanks} onChange={setPreviewBlanks} />
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
                        if (wasCorrect) setCorrectAnswers(correctAnswers.map(a => a === options[i] ? e.target.value : a));
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
                <textarea className="qb__textarea" placeholder="Question text *" rows={3} value={questionText} onChange={e => setQuestionText(e.target.value)} />
                <div className="qb__row">
                  <input className="qb__input" type="number" step="any" placeholder="Correct numeric answer *" value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} style={{ flex: 2 }} />
                  <input className="qb__input" type="number" step="any" placeholder="Tolerance" value={tolerance} onChange={e => setTolerance(e.target.value)} style={{ flex: 1 }} />
                </div>
                <p className="qb__hint">Answers are compared with the specified tolerance (default 0.01).</p>
              </>
            )}

            {/* ESSAY / PARAGRAPH */}
            {qType === 'essay' && (
              <>
                <textarea className="qb__textarea" placeholder="Question text *" rows={4} value={questionText} onChange={e => setQuestionText(e.target.value)} />
                <label className="qb__label">Reference Answer (what a good answer should cover -- used by AI to grade)</label>
                <textarea className="qb__textarea" placeholder="A strong answer should mention..." rows={5} value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} />
                <p className="qb__hint">The AI will use this reference to evaluate the student&apos;s paragraph response.</p>
              </>
            )}

            {/* MATH TEMPLATE */}
            {qType === 'math_template' && (
              <>
                <label className="qb__label">Question Template (use {'{{varName:min:max}}'} for random numbers)</label>
                <textarea className="qb__textarea"
                  placeholder='E.g.: A surveyor measures {{d:100:500}} feet at a bearing of N{{a:10:80}}E. What is the departure?'
                  rows={4} value={questionText} onChange={e => setQuestionText(e.target.value)} />
                <label className="qb__label">Answer Formula (use variable names, math functions: sin, cos, tan, sqrt, pow, round, PI)</label>
                <input className="qb__input"
                  placeholder='E.g.: round(d * sin(a * PI / 180), 2)'
                  value={formula} onChange={e => setFormula(e.target.value)} />
                <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={testMathTemplate} style={{ marginTop: '.5rem' }}>
                  Test with Random Values
                </button>
                {testResult && <pre className="qb__test-result">{testResult}</pre>}
              </>
            )}

            {/* Solution Steps (for numeric_input, short_answer) */}
            {(qType === 'numeric_input' || qType === 'short_answer') && (
              <div className="qb__solution-steps">
                <label className="qb__label">Solution Steps (optional -- shown when student views solution)</label>
                {solutionSteps.map((step, i) => (
                  <div key={i} className="qb__solution-step">
                    <div className="qb__solution-step-header">
                      <span className="qb__solution-step-num">Step {i + 1}</span>
                      <button className="qb__option-remove" onClick={() => setSolutionSteps(solutionSteps.filter((_, j) => j !== i))}>&times;</button>
                    </div>
                    <input className="qb__input" placeholder="Step title" value={step.title}
                      onChange={e => { const s = [...solutionSteps]; s[i] = { ...s[i], title: e.target.value }; setSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Formula (optional)" value={step.formula || ''}
                      onChange={e => { const s = [...solutionSteps]; s[i] = { ...s[i], formula: e.target.value }; setSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Calculation (optional)" value={step.calculation || ''}
                      onChange={e => { const s = [...solutionSteps]; s[i] = { ...s[i], calculation: e.target.value }; setSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Result (optional)" value={step.result || ''}
                      onChange={e => { const s = [...solutionSteps]; s[i] = { ...s[i], result: e.target.value }; setSolutionSteps(s); }} />
                  </div>
                ))}
                <button className="qb__add-option" onClick={() => setSolutionSteps([...solutionSteps, { step_number: solutionSteps.length + 1, title: '' }])}>
                  + Add Solution Step
                </button>
              </div>
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
                <select className="qb__select" value={moduleId} onChange={e => { setModuleId(e.target.value); setLessonId(''); setTopicId(''); }}>
                  <option value="">Module (optional)</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                <select className="qb__select" value={lessonId} onChange={e => { setLessonId(e.target.value); setTopicId(''); }}>
                  <option value="">Lesson (optional)</option>
                  {filteredLessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
                <select className="qb__select" value={examCategory} onChange={e => setExamCategory(e.target.value)}>
                  <option value="">Exam (optional)</option>
                  <option value="SIT">SIT</option>
                  <option value="RPLS">RPLS</option>
                </select>
              </div>

              {lessonId && topics.length > 0 && (
                <div className="qb__topic-row">
                  <label className="qb__label">Topic</label>
                  <select className="qb__select" value={topicId} onChange={e => setTopicId(e.target.value)}>
                    <option value="">No specific topic</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}

              {/* Study References */}
              <div className="qb__study-refs">
                <label className="qb__label">Study References</label>
                {studyRefs.length > 0 && (
                  <div className="qb__study-refs-list">
                    {studyRefs.map((ref, i) => (
                      <div key={i} className="qb__study-ref-item">
                        <span className="qb__study-ref-badge">{ref.type}</span>
                        <span className="qb__study-ref-label">{ref.label}</span>
                        <button className="qb__study-ref-remove" onClick={() => setStudyRefs(studyRefs.filter((_, j) => j !== i))}>&times;</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="qb__study-refs-add">
                  {topicId && topics.length > 0 && (
                    <button className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => { const topic = topics.find(t => t.id === topicId); if (topic && !studyRefs.some(r => r.id === topic.id)) setStudyRefs([...studyRefs, { type: 'topic', id: topic.id, label: topic.title }]); }}>
                      + Add Current Topic
                    </button>
                  )}
                  {lessonId && topics.length > 0 && (
                    <select className="qb__select qb__select--sm" value=""
                      onChange={e => { const t = topics.find(t => t.id === e.target.value); if (t && !studyRefs.some(r => r.id === t.id)) setStudyRefs([...studyRefs, { type: 'topic', id: t.id, label: t.title }]); }}>
                      <option value="">+ Add topic from lesson...</option>
                      {topics.filter(t => !studyRefs.some(r => r.id === t.id)).map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  )}
                  {lessonId && (
                    <button className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => { const les = lessons.find(l => l.id === lessonId); if (les && !studyRefs.some(r => r.id === les.id)) setStudyRefs([...studyRefs, { type: 'lesson', id: les.id, label: les.title }]); }}>
                      + Add Current Lesson
                    </button>
                  )}
                  {moduleId && (
                    <button className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => { const mod = modules.find(m => m.id === moduleId); if (mod && !studyRefs.some(r => r.id === mod.id)) setStudyRefs([...studyRefs, { type: 'module', id: mod.id, label: mod.title }]); }}>
                      + Add Current Module
                    </button>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="qb__tags-section">
                <label className="qb__label">Tags (optional)</label>
                {tags.length > 0 && (
                  <div className="qb__tags-list">
                    {tags.map((tag, i) => (
                      <span key={i} className="qb__tag-item">{tag} <button onClick={() => setTags(tags.filter((_, j) => j !== i))}>&times;</button></span>
                    ))}
                  </div>
                )}
                <div className="qb__tag-add">
                  <input className="qb__input qb__input--sm" placeholder="Add tag..." value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]); setTagInput(''); } }} />
                  <button className="admin-btn admin-btn--ghost admin-btn--sm"
                    onClick={() => { if (tagInput.trim() && !tags.includes(tagInput.trim())) { setTags([...tags, tagInput.trim()]); setTagInput(''); } }}>Add</button>
                </div>
              </div>
            </div>

            <div className="qb__actions">
              <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Question' : 'Create Question'}
              </button>
              {editId && <button className="admin-btn admin-btn--ghost" onClick={safeResetForm}>Cancel Edit</button>}
            </div>
          </div>

          {/* Quiz Analytics Panel */}
          <div className="qb__bank" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showQuizAnalytics ? '.75rem' : 0 }}>
              <h3 className="qb__section-title" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => { setShowQuizAnalytics(!showQuizAnalytics); if (!quizAnalytics && !showQuizAnalytics) loadQuizAnalytics(); }}>
                {showQuizAnalytics ? '\u25BC' : '\u25B6'} Quiz Analytics
              </h3>
              {showQuizAnalytics && (
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={loadQuizAnalytics} disabled={analyticsLoading} style={{ fontSize: '.7rem' }}>
                  {analyticsLoading ? 'Loading...' : 'Refresh'}
                </button>
              )}
            </div>
            {showQuizAnalytics && (
              <>
                {analyticsLoading && !quizAnalytics && (
                  <p style={{ fontSize: '.78rem', color: '#6B7280' }}>Loading quiz analytics...</p>
                )}
                {quizAnalytics && (
                  <div>
                    {/* Summary row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '.5rem', marginBottom: '.75rem' }}>
                      <div style={{ background: '#F0FDF4', borderRadius: 6, padding: '.5rem .65rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16A34A' }}>{quizAnalytics.summary.pass_rate}%</div>
                        <div style={{ fontSize: '.68rem', color: '#6B7280' }}>Overall Pass Rate</div>
                      </div>
                      <div style={{ background: '#EFF6FF', borderRadius: 6, padding: '.5rem .65rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1D4ED8' }}>{quizAnalytics.summary.avg_score}%</div>
                        <div style={{ fontSize: '.68rem', color: '#6B7280' }}>Avg Score</div>
                      </div>
                      <div style={{ background: '#FAFBFF', borderRadius: 6, padding: '.5rem .65rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#374151' }}>{quizAnalytics.summary.total_attempts}</div>
                        <div style={{ fontSize: '.68rem', color: '#6B7280' }}>Total Attempts</div>
                      </div>
                      <div style={{ background: '#FAFBFF', borderRadius: 6, padding: '.5rem .65rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#374151' }}>{quizAnalytics.summary.unique_users}</div>
                        <div style={{ fontSize: '.68rem', color: '#6B7280' }}>Unique Users</div>
                      </div>
                    </div>
                    {/* Pass/Fail bar */}
                    {quizAnalytics.summary.total_attempts > 0 && (
                      <div style={{ marginBottom: '.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginBottom: '.2rem' }}>
                          <span style={{ color: '#16A34A', fontWeight: 600 }}>{quizAnalytics.summary.passed} passed</span>
                          <span style={{ color: '#DC2626', fontWeight: 600 }}>{quizAnalytics.summary.failed} failed</span>
                        </div>
                        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#FEE2E2' }}>
                          <div style={{ width: `${quizAnalytics.summary.pass_rate}%`, background: '#16A34A', borderRadius: '4px 0 0 4px', transition: 'width .3s' }} />
                        </div>
                      </div>
                    )}
                    {/* Breakdown by quiz type */}
                    {quizAnalytics.breakdown.length > 0 && (
                      <div>
                        <h4 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: '.4rem' }}>Breakdown by Quiz</h4>
                        {quizAnalytics.breakdown.map(b => {
                          const passColor = b.pass_rate >= 70 ? '#10B981' : b.pass_rate >= 40 ? '#F59E0B' : '#EF4444';
                          return (
                            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem', fontSize: '.72rem' }}>
                              <span style={{ fontWeight: 600, color: '#374151', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.label}>
                                {b.label.length > 12 ? b.label.slice(0, 12) + '...' : b.label}
                              </span>
                              <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${b.pass_rate}%`, background: passColor, borderRadius: 3 }} />
                              </div>
                              <span style={{ color: passColor, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{b.pass_rate}%</span>
                              <span style={{ color: '#9CA3AF', minWidth: 50 }}>{b.attempts} att.</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {quizAnalytics.summary.total_attempts === 0 && (
                      <p style={{ fontSize: '.78rem', color: '#9CA3AF', textAlign: 'center' }}>No quiz attempts recorded yet.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Question Bank List */}
          <div className="qb__bank">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.75rem' }}>
              <h3 className="qb__section-title" style={{ marginBottom: 0 }}>Question Bank ({filteredQuestions.length}{filteredQuestions.length !== questions.length ? ` of ${questions.length}` : ''} questions)</h3>
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setShowBulkImport(!showBulkImport); setShowSimQuiz(false); }}>
                  {showBulkImport ? 'Close Import' : 'Bulk Import'}
                </button>
                <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => {
                  if (showSimQuiz) { setShowSimQuiz(false); } else { startSimQuiz(filteredQuestions); }
                }}>
                  {showSimQuiz ? 'Close Quiz' : 'Practice Quiz'}
                </button>
              </div>
            </div>

            {/* Bulk Import Panel */}
            {showBulkImport && (
              <div style={{ background: '#FAFBFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                <h4 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.88rem', fontWeight: 600, color: '#1D3095', marginBottom: '.5rem' }}>Bulk Import Questions</h4>
                <p style={{ fontSize: '.78rem', color: '#6B7280', marginBottom: '.5rem' }}>Paste a JSON array of questions. Each object needs at minimum: <code>question_text</code>, <code>correct_answer</code>. Optional: <code>question_type</code>, <code>options</code>, <code>explanation</code>, <code>difficulty</code>, <code>module_id</code>, <code>lesson_id</code>, <code>tags</code>.</p>
                <textarea
                  className="fc-form__textarea"
                  rows={6}
                  placeholder={'[\n  {\n    "question_text": "What is a bearing?",\n    "question_type": "multiple_choice",\n    "options": ["A direction", "A distance", "An elevation", "A coordinate"],\n    "correct_answer": "A direction",\n    "difficulty": "easy"\n  }\n]'}
                  value={bulkJson}
                  onChange={e => setBulkJson(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '.8rem' }}
                />
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
                  <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleBulkImport} disabled={bulkImporting || !bulkJson.trim()}>
                    {bulkImporting ? 'Importing...' : 'Import Questions'}
                  </button>
                  {bulkResult && (
                    <span style={{ fontSize: '.78rem', color: bulkResult.errors.length > 0 ? '#D97706' : '#10B981' }}>
                      {bulkResult.success} imported{bulkResult.errors.length > 0 ? `, ${bulkResult.errors.length} errors` : ''}
                    </span>
                  )}
                </div>
                {bulkResult && bulkResult.errors.length > 0 && (
                  <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: '#DC2626' }}>
                    {bulkResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Simulated Practice Quiz */}
            {showSimQuiz && simQuestions.length > 0 && (
              <div style={{ background: '#FFF', border: '2px solid #1D3095', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
                <h4 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.95rem', fontWeight: 700, color: '#1D3095', marginBottom: '.75rem' }}>
                  Practice Quiz ({simQuestions.length} questions)
                </h4>
                {simQuestions.map((q, qi) => {
                  const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
                  const answered = simAnswers[q.id];
                  const isCorrect = answered === q.correct_answer;
                  return (
                    <div key={q.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: qi < simQuestions.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
                      <p style={{ fontSize: '.88rem', fontWeight: 600, color: '#0F1419', marginBottom: '.5rem' }}>
                        {qi + 1}. {q.question_text}
                        <span className={`manage__diff-badge manage__diff-badge--${q.difficulty}`} style={{ marginLeft: '.5rem' }}>{q.difficulty}</span>
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                        {opts.map((opt: string, oi: number) => {
                          let bg = '#F9FAFB';
                          let border = '1px solid #E5E7EB';
                          if (simRevealed) {
                            if (opt === q.correct_answer) { bg = '#ECFDF5'; border = '1.5px solid #10B981'; }
                            else if (opt === answered && !isCorrect) { bg = '#FEF2F2'; border = '1.5px solid #EF4444'; }
                          } else if (opt === answered) {
                            bg = '#EFF6FF'; border = '1.5px solid #1D3095';
                          }
                          return (
                            <button key={oi} onClick={() => { if (!simRevealed) setSimAnswers(prev => ({ ...prev, [q.id]: opt })); }}
                              disabled={simRevealed}
                              style={{ textAlign: 'left', padding: '.45rem .75rem', borderRadius: 6, background: bg, border, fontSize: '.82rem', cursor: simRevealed ? 'default' : 'pointer', fontFamily: 'Inter,sans-serif' }}>
                              <strong style={{ marginRight: '.35rem' }}>{String.fromCharCode(65 + oi)}.</strong> {opt}
                              {simRevealed && opt === q.correct_answer && <span style={{ marginLeft: '.5rem', color: '#10B981' }}>&#x2713;</span>}
                              {simRevealed && opt === answered && !isCorrect && <span style={{ marginLeft: '.5rem', color: '#EF4444' }}>&#x2717;</span>}
                            </button>
                          );
                        })}
                      </div>
                      {simRevealed && q.explanation && (
                        <p style={{ fontSize: '.78rem', color: '#1D3095', marginTop: '.35rem', background: '#F0F4FF', padding: '.35rem .65rem', borderRadius: 6 }}>{q.explanation}</p>
                      )}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  {!simRevealed ? (
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setSimRevealed(true)}
                      disabled={Object.keys(simAnswers).length < simQuestions.length}>
                      Submit &amp; Score ({Object.keys(simAnswers).length}/{simQuestions.length} answered)
                    </button>
                  ) : (
                    <>
                      <span style={{ fontFamily: 'Sora,sans-serif', fontSize: '.95rem', fontWeight: 700, color: getSimScore().correct >= getSimScore().total * 0.7 ? '#10B981' : '#EF4444' }}>
                        Score: {getSimScore().correct}/{getSimScore().total} ({Math.round((getSimScore().correct / getSimScore().total) * 100)}%)
                      </span>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => startSimQuiz(filteredQuestions)}>New Quiz</button>
                    </>
                  )}
                </div>
              </div>
            )}
            {showSimQuiz && simQuestions.length === 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: '.85rem', color: '#92400E' }}>
                No multiple choice or true/false questions match the current filters. Adjust filters to include eligible questions.
              </div>
            )}

            {/* Filters */}
            <div className="qb__filters">
              <input className="qb__input qb__input--sm" placeholder="Search questions..." value={qFilter} onChange={e => setQFilter(e.target.value)} style={{ flex: 2 }} />
              <select className="qb__select qb__select--sm" value={qTypeFilter} onChange={e => setQTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {(Object.keys(TYPE_INFO) as QType[]).map(t => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
              </select>
              <select className="qb__select qb__select--sm" value={qDiffFilter} onChange={e => setQDiffFilter(e.target.value)}>
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {filteredQuestions.length === 0 && (
              <div className="admin-empty" style={{ padding: '2rem' }}>
                <div className="admin-empty__icon">&#x2753;</div>
                <div className="admin-empty__title">{questions.length === 0 ? 'No questions yet' : 'No matching questions'}</div>
                <div className="admin-empty__desc">{questions.length === 0 ? 'Create your first question above.' : 'Try adjusting your filters.'}</div>
              </div>
            )}
            <div className="qb__bank-list">
              {filteredQuestions.map(q => {
                const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
                return (
                  <div key={q.id} className={`qb__bank-item ${editId === q.id ? 'qb__bank-item--editing' : ''}`}>
                    <div className="qb__bank-item-main">
                      <span className="qb__bank-type">{TYPE_INFO[q.question_type]?.label || q.question_type}</span>
                      <span className={`qb__bank-diff qb__bank-diff--${q.difficulty}`}>{q.difficulty}</span>
                      {q.exam_category && <span className="qb__bank-exam">{q.exam_category}</span>}
                      {q.is_dynamic && <span className="qb__bank-dynamic">Dynamic</span>}
                      {q.template_id && <span className="qb__bank-template">Template</span>}
                      {q.study_references && q.study_references.length > 0 && (
                        <span className="qb__bank-refs">{q.study_references.length} ref{q.study_references.length !== 1 ? 's' : ''}</span>
                      )}
                      {q.tags && q.tags.length > 0 && <span className="qb__bank-tags">{q.tags.join(', ')}</span>}
                    </div>
                    <p className="qb__bank-text">{q.question_text.substring(0, 150)}{q.question_text.length > 150 ? '...' : ''}</p>
                    {q.question_type !== 'fill_blank' && q.question_type !== 'math_template' && (
                      <p className="qb__bank-answer">Correct: {q.correct_answer.substring(0, 80)}</p>
                    )}
                    {opts.length > 0 && q.question_type !== 'fill_blank' && (
                      <p className="qb__bank-opts">{opts.length} options</p>
                    )}
                    {q.stats && q.stats.attempts > 0 && (
                      <div className="qb__bank-stats">
                        <div className="qb__bank-stats-bar">
                          <div className="qb__bank-stats-fill" style={{
                            width: `${q.stats.pass_rate ?? 0}%`,
                            background: (q.stats.pass_rate ?? 0) >= 70 ? '#10B981' : (q.stats.pass_rate ?? 0) >= 40 ? '#F59E0B' : '#EF4444',
                          }} />
                        </div>
                        <span className="qb__bank-stats-label">
                          {q.stats.pass_rate}% pass ({q.stats.correct}/{q.stats.attempts})
                        </span>
                      </div>
                    )}
                    {q.stats && q.stats.attempts === 0 && (
                      <span style={{ fontSize: '.68rem', color: '#D1D5DB' }}>No attempts yet</span>
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
      )}

      {/* ================================================================== */}
      {/* TAB 2: TEMPLATES (Parametric problem template CRUD) */}
      {/* ================================================================== */}
      {activeTab === 'templates' && (
        <>
          <div className="qb__editor">
            <h3 className="qb__section-title">
              {tmplEditId ? 'Edit Template' : 'Create Problem Template'}
              {tmplEditId && <span className="qb__editing-badge">Editing</span>}
            </h3>
            <p className="qb__hint" style={{ marginBottom: '1rem' }}>
              Templates define parametric problems with variable ranges and formulas. Each template can generate unlimited unique problem instances.
            </p>

            {/* Basic Info */}
            <div className="qb__row">
              <input className="qb__input" placeholder="Template name *" value={tmplName} onChange={e => setTmplName(e.target.value)} style={{ flex: 2 }} />
              <input className="qb__input" placeholder="Category *" value={tmplCategory} onChange={e => setTmplCategory(e.target.value)} />
              <input className="qb__input" placeholder="Subcategory" value={tmplSubcategory} onChange={e => setTmplSubcategory(e.target.value)} />
            </div>
            <textarea className="qb__textarea" placeholder="Description (optional)" rows={2} value={tmplDescription} onChange={e => setTmplDescription(e.target.value)} />

            <div className="qb__row">
              <select className="qb__select" value={tmplQuestionType} onChange={e => setTmplQuestionType(e.target.value)}>
                <option value="numeric_input">Numeric Answer</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="short_answer">Short Answer</option>
              </select>
              <select className="qb__select" value={tmplDifficulty} onChange={e => setTmplDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="very_hard">Very Hard</option>
              </select>
              <select className="qb__select" value={tmplGeneratorId} onChange={e => setTmplGeneratorId(e.target.value)}>
                <option value="">No linked generator (custom formula)</option>
                {generators.map(g => <option key={g.id} value={g.id}>[{g.category}] {g.name}</option>)}
              </select>
            </div>

            {/* Link to module/lesson */}
            <div className="qb__row">
              <select className="qb__select" value={tmplModuleId} onChange={e => setTmplModuleId(e.target.value)}>
                <option value="">Module (optional)</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <select className="qb__select" value={tmplLessonId} onChange={e => setTmplLessonId(e.target.value)}>
                <option value="">Lesson (optional)</option>
                {tmplFilteredLessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
              <select className="qb__select" value={tmplExamCategory} onChange={e => setTmplExamCategory(e.target.value)}>
                <option value="">Exam (optional)</option>
                <option value="SIT">SIT</option>
                <option value="RPLS">RPLS</option>
              </select>
            </div>

            {/* Question Template */}
            {!tmplGeneratorId && (
              <>
                <label className="qb__label">Question Template (use {'{{paramName}}'} for variables)</label>
                <textarea className="qb__textarea"
                  placeholder='E.g.: A surveyor measures a slope distance of {{slope_dist}} ft at a vertical angle of {{vert_angle}}. What is the horizontal distance? Round to 2 decimal places.'
                  rows={4} value={tmplQuestionTemplate} onChange={e => setTmplQuestionTemplate(e.target.value)} />

                {/* Parameters */}
                <label className="qb__label">Parameters (variables used in the question and formulas)</label>
                {tmplParams.map((p, i) => (
                  <div key={i} className="qb__param-row">
                    <input className="qb__input qb__input--sm" placeholder="Name" value={p.name}
                      onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], name: e.target.value }; setTmplParams(np); }} style={{ width: '120px' }} />
                    <input className="qb__input qb__input--sm" placeholder="Label" value={p.label}
                      onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], label: e.target.value }; setTmplParams(np); }} style={{ width: '140px' }} />
                    <select className="qb__select qb__select--sm" value={p.type}
                      onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], type: e.target.value as TemplateParam['type'] }; setTmplParams(np); }} style={{ width: '110px' }}>
                      <option value="integer">Integer</option>
                      <option value="float">Float</option>
                      <option value="angle_dms">Angle (DMS)</option>
                      <option value="bearing">Bearing</option>
                      <option value="choice">Choice</option>
                      <option value="computed">Computed</option>
                    </select>
                    {(p.type === 'integer' || p.type === 'float' || p.type === 'angle_dms') && (
                      <>
                        <input className="qb__input qb__input--sm" type="number" placeholder="Min" value={p.min ?? ''} style={{ width: '80px' }}
                          onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], min: parseFloat(e.target.value) }; setTmplParams(np); }} />
                        <input className="qb__input qb__input--sm" type="number" placeholder="Max" value={p.max ?? ''} style={{ width: '80px' }}
                          onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], max: parseFloat(e.target.value) }; setTmplParams(np); }} />
                      </>
                    )}
                    {p.type === 'float' && (
                      <input className="qb__input qb__input--sm" type="number" placeholder="Decimals" value={p.decimals ?? 2} style={{ width: '70px' }}
                        onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], decimals: parseInt(e.target.value) }; setTmplParams(np); }} />
                    )}
                    {p.type === 'choice' && (
                      <input className="qb__input qb__input--sm" placeholder='Choices (comma-separated)' value={(p.choices || []).join(',')}
                        onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], choices: e.target.value.split(',').map(s => s.trim()) }; setTmplParams(np); }} />
                    )}
                    {p.type === 'computed' && (
                      <input className="qb__input qb__input--sm" placeholder='Formula (e.g. a + b)' value={p.formula || ''}
                        onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], formula: e.target.value }; setTmplParams(np); }} />
                    )}
                    <input className="qb__input qb__input--sm" placeholder="Unit" value={p.unit || ''} style={{ width: '60px' }}
                      onChange={e => { const np = [...tmplParams]; np[i] = { ...np[i], unit: e.target.value }; setTmplParams(np); }} />
                    <button className="qb__option-remove" onClick={() => setTmplParams(tmplParams.filter((_, j) => j !== i))}>&times;</button>
                  </div>
                ))}
                <button className="qb__add-option" onClick={() => setTmplParams([...tmplParams, { ...EMPTY_PARAM }])}>+ Add Parameter</button>

                {/* Computed Variables */}
                <label className="qb__label" style={{ marginTop: '1rem' }}>Computed Variables (intermediate calculations for solution steps)</label>
                {tmplComputedVars.map((cv, i) => (
                  <div key={i} className="qb__param-row">
                    <input className="qb__input qb__input--sm" placeholder="Name (e.g. _cos_angle)" value={cv.name} style={{ width: '160px' }}
                      onChange={e => { const nc = [...tmplComputedVars]; nc[i] = { ...nc[i], name: e.target.value }; setTmplComputedVars(nc); }} />
                    <input className="qb__input" placeholder='Formula (e.g. round(cos(angle * PI / 180), 6))' value={cv.formula}
                      onChange={e => { const nc = [...tmplComputedVars]; nc[i] = { ...nc[i], formula: e.target.value }; setTmplComputedVars(nc); }} />
                    <button className="qb__option-remove" onClick={() => setTmplComputedVars(tmplComputedVars.filter((_, j) => j !== i))}>&times;</button>
                  </div>
                ))}
                <button className="qb__add-option" onClick={() => setTmplComputedVars([...tmplComputedVars, { ...EMPTY_COMPUTED }])}>+ Add Computed Variable</button>

                {/* Answer Formula */}
                <label className="qb__label" style={{ marginTop: '1rem' }}>Answer Formula (compute the correct answer from parameters)</label>
                <input className="qb__input" placeholder='E.g.: round(slope_dist * cos(vert_angle * PI / 180), 2)' value={tmplAnswerFormula} onChange={e => setTmplAnswerFormula(e.target.value)} />
                <div className="qb__row">
                  <div>
                    <label className="qb__label">Decimal Places</label>
                    <input className="qb__input qb__input--sm" type="number" value={tmplDecimals} onChange={e => setTmplDecimals(parseInt(e.target.value) || 2)} style={{ width: '80px' }} />
                  </div>
                  <div>
                    <label className="qb__label">Tolerance</label>
                    <input className="qb__input qb__input--sm" type="number" step="any" value={tmplTolerance} onChange={e => setTmplTolerance(parseFloat(e.target.value) || 0.01)} style={{ width: '100px' }} />
                  </div>
                  <div>
                    <label className="qb__label">Unit</label>
                    <input className="qb__input qb__input--sm" placeholder="ft, m, deg" value={tmplUnit} onChange={e => setTmplUnit(e.target.value)} style={{ width: '80px' }} />
                  </div>
                </div>

                {/* Solution Step Templates */}
                <label className="qb__label" style={{ marginTop: '1rem' }}>Solution Steps (use {'{{paramName}}'} and {'{{_answer}}'} for substitution)</label>
                {tmplSolutionSteps.map((st, i) => (
                  <div key={i} className="qb__solution-step">
                    <div className="qb__solution-step-header">
                      <span className="qb__solution-step-num">Step {i + 1}</span>
                      <button className="qb__option-remove" onClick={() => setTmplSolutionSteps(tmplSolutionSteps.filter((_, j) => j !== i))}>&times;</button>
                    </div>
                    <input className="qb__input" placeholder="Step title" value={st.title}
                      onChange={e => { const s = [...tmplSolutionSteps]; s[i] = { ...s[i], title: e.target.value }; setTmplSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Description template (use {{vars}})" value={st.description_template || ''}
                      onChange={e => { const s = [...tmplSolutionSteps]; s[i] = { ...s[i], description_template: e.target.value }; setTmplSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Formula display" value={st.formula || ''}
                      onChange={e => { const s = [...tmplSolutionSteps]; s[i] = { ...s[i], formula: e.target.value }; setTmplSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Calculation template (use {{vars}})" value={st.calculation_template || ''}
                      onChange={e => { const s = [...tmplSolutionSteps]; s[i] = { ...s[i], calculation_template: e.target.value }; setTmplSolutionSteps(s); }} />
                    <input className="qb__input" placeholder="Result template (use {{_answer}})" value={st.result_template || ''}
                      onChange={e => { const s = [...tmplSolutionSteps]; s[i] = { ...s[i], result_template: e.target.value }; setTmplSolutionSteps(s); }} />
                  </div>
                ))}
                <button className="qb__add-option" onClick={() => setTmplSolutionSteps([...tmplSolutionSteps, { ...EMPTY_STEP, step_number: tmplSolutionSteps.length + 1 }])}>
                  + Add Solution Step
                </button>

                {/* Explanation Template */}
                <label className="qb__label" style={{ marginTop: '1rem' }}>Explanation Template</label>
                <textarea className="qb__textarea" rows={2} placeholder='E.g.: H = S x cos(alpha) = {{slope_dist}} x cos({{vert_angle}}) = {{_answer}} ft.'
                  value={tmplExplanation} onChange={e => setTmplExplanation(e.target.value)} />
              </>
            )}

            {tmplGeneratorId && (
              <div className="qb__callout" style={{ background: 'var(--bg-alt, #f0f4f8)', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
                <strong>Linked to hardcoded generator:</strong> {generators.find(g => g.id === tmplGeneratorId)?.name || tmplGeneratorId}
                <p style={{ margin: '.5rem 0 0', fontSize: '.85rem', opacity: .8 }}>
                  This template delegates to an existing algorithm. The question template, parameters, and formula fields above are for reference only.
                </p>
              </div>
            )}

            {/* Tags */}
            <div className="qb__tags-section">
              <label className="qb__label">Tags</label>
              {tmplTags.length > 0 && (
                <div className="qb__tags-list">
                  {tmplTags.map((tag, i) => (
                    <span key={i} className="qb__tag-item">{tag} <button onClick={() => setTmplTags(tmplTags.filter((_, j) => j !== i))}>&times;</button></span>
                  ))}
                </div>
              )}
              <div className="qb__tag-add">
                <input className="qb__input qb__input--sm" placeholder="Add tag..." value={tmplTagInput}
                  onChange={e => setTmplTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && tmplTagInput.trim()) { e.preventDefault(); if (!tmplTags.includes(tmplTagInput.trim())) setTmplTags([...tmplTags, tmplTagInput.trim()]); setTmplTagInput(''); } }} />
                <button className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() => { if (tmplTagInput.trim() && !tmplTags.includes(tmplTagInput.trim())) { setTmplTags([...tmplTags, tmplTagInput.trim()]); setTmplTagInput(''); } }}>Add</button>
              </div>
            </div>

            {/* Actions */}
            <div className="qb__actions">
              <button className="admin-btn admin-btn--secondary" onClick={handlePreviewTemplate} disabled={saving}>
                Test / Preview
              </button>
              <button className="admin-btn admin-btn--primary" onClick={handleSaveTemplate} disabled={saving}>
                {saving ? 'Saving...' : tmplEditId ? 'Update Template' : 'Create Template'}
              </button>
              {tmplEditId && <button className="admin-btn admin-btn--ghost" onClick={resetTemplateForm}>Cancel Edit</button>}
            </div>

            {/* Preview Result */}
            {tmplPreviewResult && (
              <div className="qb__preview-result">
                <h4 className="qb__label">Generated Preview</h4>
                {tmplPreviewParams && (
                  <div className="qb__preview-params">
                    <strong>Parameters:</strong> {JSON.stringify(tmplPreviewParams, null, 2)}
                  </div>
                )}
                <div className="qb__preview-question">
                  <strong>Question:</strong> {tmplPreviewResult.question_text}
                </div>
                <div className="qb__preview-answer">
                  <strong>Answer:</strong> {tmplPreviewResult.correct_answer}
                  {tmplPreviewResult.tolerance > 0 && <span style={{ opacity: .6 }}> (tolerance: {tmplPreviewResult.tolerance})</span>}
                </div>
                {tmplPreviewResult.solution_steps && tmplPreviewResult.solution_steps.length > 0 && (
                  <div className="qb__preview-steps">
                    <strong>Solution Steps:</strong>
                    {tmplPreviewResult.solution_steps.map((s, i) => (
                      <div key={i} className="qb__preview-step">
                        <span className="qb__preview-step-num">{s.step_number}.</span>
                        <strong>{s.title}</strong>
                        {s.description && <div style={{ fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{s.description}</div>}
                        {s.formula && <div style={{ fontSize: '.85rem', fontStyle: 'italic' }}>{s.formula}</div>}
                        {s.calculation && <div style={{ fontSize: '.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{s.calculation}</div>}
                        {s.result && <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{s.result}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {tmplPreviewResult.explanation && (
                  <div className="qb__preview-explanation">
                    <strong>Explanation:</strong> {tmplPreviewResult.explanation}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Template Library */}
          <div className="qb__bank">
            <h3 className="qb__section-title">Template Library ({filteredTemplates.length} templates)</h3>
            <div className="qb__filters">
              <input className="qb__input qb__input--sm" placeholder="Search templates..." value={tmplFilter} onChange={e => setTmplFilter(e.target.value)} />
            </div>
            {filteredTemplates.length === 0 && (
              <div className="admin-empty" style={{ padding: '2rem' }}>
                <div className="admin-empty__icon">&#x1F9E9;</div>
                <div className="admin-empty__title">No templates yet</div>
                <div className="admin-empty__desc">Create your first problem template above, or templates will be auto-created when you run the migration.</div>
              </div>
            )}
            <div className="qb__bank-list">
              {filteredTemplates.map(t => (
                <div key={t.id} className={`qb__bank-item ${tmplEditId === t.id ? 'qb__bank-item--editing' : ''}`}>
                  <div className="qb__bank-item-main">
                    <span className="qb__bank-type">{t.category}</span>
                    <span className={`qb__bank-diff qb__bank-diff--${t.difficulty}`}>{t.difficulty}</span>
                    {t.generator_id && <span className="qb__bank-dynamic">Algorithm</span>}
                    {!t.generator_id && <span className="qb__bank-template">Custom</span>}
                    {t.subcategory && <span className="qb__bank-tags">{t.subcategory}</span>}
                  </div>
                  <p className="qb__bank-text"><strong>{t.name}</strong>{t.description ? ` -- ${t.description}` : ''}</p>
                  <p className="qb__bank-answer" style={{ fontSize: '.8rem' }}>
                    {t.parameters.length} params | Formula: {t.answer_formula.substring(0, 60)}{t.answer_formula.length > 60 ? '...' : ''}
                  </p>
                  <div className="qb__bank-actions">
                    <button className="manage__item-btn" onClick={() => loadTemplateForEdit(t)}>Edit</button>
                    <button className="manage__item-btn" onClick={() => handlePreviewFromList(t)} title="Generate a sample problem">Preview</button>
                    <button className="manage__item-btn" onClick={() => handlePublishTemplate(t.id, 1, true)} title="Add 1 dynamic question to question bank">Publish 1</button>
                    <button className="manage__item-btn" onClick={() => handlePublishTemplate(t.id, 5, false)} title="Generate 5 static questions">Publish 5</button>
                    <button className="manage__item-btn manage__item-btn--danger" onClick={() => handleDeleteTemplate(t.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* TAB 3: AUTO-GENERATE (Use hardcoded generators) */}
      {/* ================================================================== */}
      {activeTab === 'generators' && (
        <>
          <div className="qb__editor">
            <h3 className="qb__section-title">Auto-Generate Problems</h3>
            <p className="qb__hint" style={{ marginBottom: '1rem' }}>
              Select a problem type and click Generate to create random problems with full solutions.
              Problems can be previewed, then published to the question bank for use in quizzes.
            </p>

            {/* Generator Selector */}
            <label className="qb__label">Select Problem Type</label>
            <div className="qb__gen-categories">
              {Object.entries(genGrouped).map(([cat, gens]) => (
                <div key={cat} className="qb__gen-category">
                  <h4 className="qb__gen-category-title">{cat}</h4>
                  <div className="qb__gen-buttons">
                    {gens.map(g => (
                      <button key={g.id}
                        className={`qb__gen-btn ${genSelected === g.id ? 'qb__gen-btn--active' : ''}`}
                        onClick={() => { setGenSelected(g.id); setGenPreview([]); }}>
                        <span className="qb__gen-btn-name">{g.name}</span>
                        <span className="qb__gen-btn-desc">{g.description}</span>
                        <span className="qb__gen-btn-diff">{g.difficulties.join(', ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {genSelected && (
              <div className="qb__gen-controls">
                <div className="qb__row" style={{ alignItems: 'flex-end' }}>
                  <div>
                    <label className="qb__label">Count</label>
                    <input className="qb__input" type="number" min="1" max="50" value={genCount} onChange={e => setGenCount(Math.min(50, parseInt(e.target.value) || 1))} style={{ width: '80px' }} />
                  </div>
                  <button className="admin-btn admin-btn--secondary" onClick={handleGeneratePreview} disabled={genLoading}>
                    {genLoading ? 'Generating...' : 'Generate Preview'}
                  </button>
                </div>

                {/* Publish options */}
                <div className="qb__gen-publish" style={{ marginTop: '1rem' }}>
                  <label className="qb__label">Publish to (optional -- assign to lesson/module before publishing)</label>
                  <div className="qb__row">
                    <select className="qb__select" value={genPublishModule} onChange={e => setGenPublishModule(e.target.value)}>
                      <option value="">Module (optional)</option>
                      {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                    <select className="qb__select" value={genPublishLesson} onChange={e => setGenPublishLesson(e.target.value)}>
                      <option value="">Lesson (optional)</option>
                      {(genPublishModule ? lessons.filter(l => l.module_id === genPublishModule) : lessons).map(l => (
                        <option key={l.id} value={l.id}>{l.title}</option>
                      ))}
                    </select>
                    <select className="qb__select" value={genPublishExam} onChange={e => setGenPublishExam(e.target.value)}>
                      <option value="">Exam (optional)</option>
                      <option value="SIT">SIT</option>
                      <option value="RPLS">RPLS</option>
                    </select>
                    <button className="admin-btn admin-btn--primary" onClick={handlePublishGenerated} disabled={saving || genPreview.length === 0}>
                      {saving ? 'Publishing...' : `Publish ${genCount} to Question Bank`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Results */}
            {genPreview.length > 0 && (
              <div className="qb__gen-preview">
                <h4 className="qb__label">Generated Problems ({genPreview.length})</h4>
                {genPreview.map((p, i) => (
                  <div key={p.id} className="qb__gen-problem">
                    <div className="qb__gen-problem-header">
                      <span className="qb__gen-problem-num">#{i + 1}</span>
                      <span className={`qb__bank-diff qb__bank-diff--${p.difficulty}`}>{p.difficulty}</span>
                      <span className="qb__bank-tags">{p.subcategory}</span>
                    </div>
                    <p className="qb__gen-problem-text">{p.question_text}</p>
                    <p className="qb__gen-problem-answer">
                      <strong>Answer:</strong> {p.correct_answer}
                      {p.tolerance > 0 && <span style={{ opacity: .6 }}> (tol: {p.tolerance})</span>}
                    </p>
                    <details className="qb__gen-problem-details">
                      <summary>Solution Steps ({p.solution_steps.length})</summary>
                      <div className="qb__gen-solution">
                        {p.solution_steps.map((s, j) => (
                          <div key={j} className="qb__gen-solution-step">
                            <strong>Step {s.step_number}: {s.title}</strong>
                            {s.description && <div style={{ whiteSpace: 'pre-wrap', fontSize: '.85rem' }}>{s.description}</div>}
                            {s.formula && <div style={{ fontStyle: 'italic', fontSize: '.85rem' }}>{s.formula}</div>}
                            {s.calculation && <div style={{ fontFamily: 'monospace', fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{s.calculation}</div>}
                            {s.result && <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{s.result}</div>}
                          </div>
                        ))}
                      </div>
                    </details>
                    {p.explanation && (
                      <p className="qb__gen-problem-explanation" style={{ fontSize: '.85rem', opacity: .8, marginTop: '.25rem' }}>
                        {p.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  // Helper: preview from template list item
  async function handlePreviewFromList(t: ProblemTemplate) {
    try {
      const res = await fetch(`/api/admin/learn/templates?action=preview&id=${t.id}`);
      const data = await res.json();
      if (res.ok) {
        setTmplPreviewResult(data.problem);
        setTmplPreviewParams(data.parameters);
        setMessage('Preview generated!');
        // Scroll to preview
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setMessage(data.error || 'Preview failed');
      }
    } catch { setMessage('Network error'); }
  }
}
