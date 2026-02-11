// app/admin/learn/manage/lesson-builder/[id]/page.tsx
'use client';
import { useState, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SmartSearch from '../../../components/SmartSearch';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePageError } from '../../../../hooks/usePageError';

const TipTapEditor = dynamic(() => import('@/app/admin/components/TipTapEditor'), { ssr: false });

type BlockType = 'text' | 'image' | 'video' | 'callout' | 'divider' | 'quiz' | 'embed' | 'table' | 'file' | 'slideshow' | 'html' | 'audio' | 'link_reference' | 'flashcard' | 'popup_article' | 'backend_link' | 'highlight' | 'key_takeaways' | 'equation' | 'tabs' | 'accordion' | 'columns';

interface BlockStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  boxShadow?: string;
  width?: 'full' | 'wide' | 'half' | 'third';
  collapsible?: boolean;
  collapsedLabel?: string;
  hidden?: boolean;
  hiddenLabel?: string;
}

interface LessonBlock {
  id: string;
  block_type: BlockType;
  content: Record<string, any>;
  order_index: number;
  style?: BlockStyle;
}

interface LessonMeta {
  id: string;
  title: string;
  status: string;
  module_id: string;
  estimated_minutes: number;
  content?: string; // Legacy HTML content for seeded lessons
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: string; description: string; group?: string }[] = [
  { type: 'text', label: 'Text', icon: 'T', description: 'Rich text with formatting', group: 'Content' },
  { type: 'html', label: 'HTML', icon: '</>', description: 'Raw HTML code block', group: 'Content' },
  { type: 'image', label: 'Image', icon: '🖼', description: 'Upload or link an image', group: 'Media' },
  { type: 'video', label: 'Video', icon: '▶', description: 'YouTube/Vimeo embed', group: 'Media' },
  { type: 'audio', label: 'Audio', icon: '🔊', description: 'Audio player / podcast', group: 'Media' },
  { type: 'callout', label: 'Callout', icon: '💡', description: 'Styled info/warning/formula box', group: 'Content' },
  { type: 'highlight', label: 'Highlight', icon: '✦', description: 'Key term or concept bubble', group: 'Content' },
  { type: 'key_takeaways', label: 'Takeaways', icon: '🎯', description: 'Key takeaways checklist', group: 'Content' },
  { type: 'divider', label: 'Divider', icon: '—', description: 'Visual separator', group: 'Layout' },
  { type: 'quiz', label: 'Quiz', icon: '?', description: 'Inline quiz question', group: 'Interactive' },
  { type: 'embed', label: 'Embed', icon: '⧉', description: 'External content via URL', group: 'Media' },
  { type: 'table', label: 'Table', icon: '▦', description: 'Data table', group: 'Content' },
  { type: 'file', label: 'File', icon: '📎', description: 'Downloadable attachment', group: 'Media' },
  { type: 'slideshow', label: 'Slideshow', icon: '🎞', description: 'Image slideshow/carousel', group: 'Media' },
  { type: 'link_reference', label: 'Links / Refs', icon: '🔗', description: 'Curated links & references', group: 'Interactive' },
  { type: 'flashcard', label: 'Flashcards', icon: '🃏', description: 'Flip-card study deck', group: 'Interactive' },
  { type: 'popup_article', label: 'Popup Article', icon: '📰', description: 'Expandable summary / article', group: 'Interactive' },
  { type: 'backend_link', label: 'Page Link', icon: '➡', description: 'Link card to app page', group: 'Interactive' },
  { type: 'equation', label: 'Equation', icon: 'Σ', description: 'Math formula (LaTeX)', group: 'Content' },
  { type: 'tabs', label: 'Tabs', icon: '⊞', description: 'Tabbed content panels', group: 'Layout' },
  { type: 'accordion', label: 'Accordion', icon: '≡', description: 'Collapsible FAQ sections', group: 'Layout' },
  { type: 'columns', label: 'Columns', icon: '▥', description: '2-3 column layout', group: 'Layout' },
];

function convertToEmbedUrl(url: string): string {
  if (!url) return '';
  // YouTube: convert watch URLs to embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo: convert standard URLs to embed
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Lightweight LaTeX to HTML renderer for common math notation
function renderLatex(tex: string): string {
  if (!tex) return '';
  let html = tex
    // Escape HTML first
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Fractions: \frac{a}{b}
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="eq-frac"><span class="eq-num">$1</span><span class="eq-den">$2</span></span>')
    // Square root: \sqrt{x}
    .replace(/\\sqrt\{([^}]+)\}/g, '<span class="eq-sqrt">&radic;<span style="text-decoration:overline">$1</span></span>')
    // Superscript: ^{...} or ^x
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\^([a-zA-Z0-9])/g, '<sup>$1</sup>')
    // Subscript: _{...} or _x
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>')
    // Greek letters
    .replace(/\\alpha/g, '&alpha;').replace(/\\beta/g, '&beta;').replace(/\\gamma/g, '&gamma;')
    .replace(/\\delta/g, '&delta;').replace(/\\epsilon/g, '&epsilon;').replace(/\\theta/g, '&theta;')
    .replace(/\\lambda/g, '&lambda;').replace(/\\mu/g, '&mu;').replace(/\\pi/g, '&pi;')
    .replace(/\\sigma/g, '&sigma;').replace(/\\phi/g, '&phi;').replace(/\\omega/g, '&omega;')
    .replace(/\\Delta/g, '&Delta;').replace(/\\Sigma/g, '&Sigma;').replace(/\\Omega/g, '&Omega;')
    .replace(/\\Theta/g, '&Theta;').replace(/\\Pi/g, '&Pi;')
    // Operators
    .replace(/\\times/g, '&times;').replace(/\\div/g, '&divide;').replace(/\\pm/g, '&plusmn;')
    .replace(/\\cdot/g, '&middot;').replace(/\\leq/g, '&le;').replace(/\\geq/g, '&ge;')
    .replace(/\\neq/g, '&ne;').replace(/\\approx/g, '&asymp;').replace(/\\infty/g, '&infin;')
    .replace(/\\sum/g, '&Sigma;').replace(/\\prod/g, '&Pi;').replace(/\\int/g, '&int;')
    .replace(/\\partial/g, '&part;').replace(/\\nabla/g, '&nabla;')
    // Arrows
    .replace(/\\rightarrow/g, '&rarr;').replace(/\\leftarrow/g, '&larr;')
    .replace(/\\Rightarrow/g, '&rArr;').replace(/\\Leftarrow/g, '&lArr;')
    // Spacing and text
    .replace(/\\quad/g, '&emsp;').replace(/\\,/g, '&thinsp;')
    .replace(/\\text\{([^}]+)\}/g, '<span style="font-style:normal;font-family:Inter,sans-serif">$1</span>')
    // Remaining backslash commands (show symbol name in italic as fallback)
    .replace(/\\([a-zA-Z]+)/g, '<em>$1</em>');
  return html;
}

// Smart HTML-to-blocks parser: splits seeded lesson HTML into discrete block types
function parseHtmlToBlocks(htmlStr: string): LessonBlock[] {
  if (typeof window === 'undefined' || !htmlStr?.trim()) return [];
  const blocks: LessonBlock[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');
  const body = doc.body;
  let pendingHtml = '';
  let idx = 0;

  function makeId() { return `temp-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${idx++}`; }

  function flushPending() {
    const trimmed = pendingHtml.trim();
    if (!trimmed) return;
    blocks.push({ id: makeId(), block_type: 'text', content: { html: trimmed }, order_index: 0 });
    pendingHtml = '';
  }

  function detectCalloutType(style: string): string | null {
    const s = style.toLowerCase();
    if (s.includes('#1a1a2e')) return 'formula';
    if (s.includes('#f0f4f8') || (s.includes('border-left') && s.includes('#2563eb'))) return 'note';
    if (s.includes('#fffbeb')) return 'example';
    if (s.includes('#ecfdf5')) return 'tip';
    if (s.includes('#fee2e2') || s.includes('#fef2f2') || (s.includes('border-left') && s.includes('#dc2626'))) return 'danger';
    return null;
  }

  function processNode(node: Node) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) pendingHtml += node.textContent;
      return;
    }
    const el = node as Element;
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;

    // HR → divider block
    if (tag === 'hr') {
      flushPending();
      blocks.push({ id: makeId(), block_type: 'divider', content: {}, order_index: 0 });
      return;
    }

    // TABLE → table block
    if (tag === 'table') {
      flushPending();
      const headers: string[] = [];
      const rows: string[][] = [];
      el.querySelectorAll('thead th').forEach(th => headers.push(th.innerHTML?.trim() || ''));
      el.querySelectorAll('tbody tr').forEach(tr => {
        const row: string[] = [];
        tr.querySelectorAll('td').forEach(td => row.push(td.innerHTML?.trim() || ''));
        if (row.length > 0) rows.push(row);
      });
      // Fallback: no thead, use first row with th as headers
      if (headers.length === 0) {
        const firstTr = el.querySelector('tr');
        if (firstTr) {
          const ths = firstTr.querySelectorAll('th');
          if (ths.length > 0) {
            ths.forEach(th => headers.push(th.innerHTML?.trim() || ''));
          } else {
            const tds = firstTr.querySelectorAll('td');
            tds.forEach(td => headers.push(td.innerHTML?.trim() || ''));
            if (rows.length > 0 && rows[0].join() === headers.join()) rows.shift();
          }
        }
      }
      blocks.push({ id: makeId(), block_type: 'table', content: { headers, rows }, order_index: 0 });
      return;
    }

    // IMG → image block
    if (tag === 'img') {
      flushPending();
      blocks.push({ id: makeId(), block_type: 'image', content: { url: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '', caption: '', alignment: 'center' }, order_index: 0 });
      return;
    }

    // DIV → check for styled callout, otherwise process children
    if (tag === 'div') {
      const style = el.getAttribute('style') || '';
      const calloutType = detectCalloutType(style);
      if (calloutType) {
        flushPending();
        blocks.push({ id: makeId(), block_type: 'callout', content: { type: calloutType, text: el.innerHTML.trim() }, order_index: 0 });
        return;
      }
      // Non-styled div: recurse into children
      Array.from(el.childNodes).forEach(processNode);
      return;
    }

    // H2 / H3 → flush pending, start a new text section with the heading
    if (tag === 'h2' || tag === 'h3') {
      flushPending();
      pendingHtml = el.outerHTML;
      return;
    }

    // Everything else (p, ul, ol, h4, pre, etc.) → accumulate
    pendingHtml += el.outerHTML;
  }

  Array.from(body.childNodes).forEach(processNode);
  flushPending();
  return blocks.map((b, i) => ({ ...b, order_index: i }));
}

export default function LessonBuilderPage() {
  const params = useParams();
  const lessonId = params.id as string;
  const router = useRouter();
  const { safeFetch, safeAction } = usePageError('LessonBuilderPage');
  const [lesson, setLesson] = useState<LessonMeta | null>(null);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isDraft, setIsDraft] = useState(true);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [slideshowIndexes, setSlideshowIndexes] = useState<Record<string, number>>({});
  const [convertedFromHtml, setConvertedFromHtml] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const [showStylePanel, setShowStylePanel] = useState<string | null>(null);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [expandedPopups, setExpandedPopups] = useState<Record<string, boolean>>({});
  const [flashcardIndexes, setFlashcardIndexes] = useState<Record<string, number>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | null>>({});
  const [quizRevealed, setQuizRevealed] = useState<Record<string, boolean>>({});
  const [previewTabIndexes, setPreviewTabIndexes] = useState<Record<string, number>>({});
  const [previewAccordionOpen, setPreviewAccordionOpen] = useState<Record<string, boolean>>({});
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [qbQuestions, setQbQuestions] = useState<any[]>([]);
  const [showQbPicker, setShowQbPicker] = useState<string | null>(null);
  const [qbLoading, setQbLoading] = useState(false);
  const [autoSaveFlash, setAutoSaveFlash] = useState(false);
  const [blockPickerSearch, setBlockPickerSearch] = useState('');
  const [blockPickerTab, setBlockPickerTab] = useState<'blocks' | 'templates'>('blocks');
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateDesc, setSaveTemplateDesc] = useState('');
  const [linkedContent, setLinkedContent] = useState<{ questions: any[]; flashcards: any[]; articles: any[] }>({ questions: [], flashcards: [], articles: [] });
  const [showLinkedPanel, setShowLinkedPanel] = useState(false);
  const [linkedLoaded, setLinkedLoaded] = useState(false);
  const [saveTemplateCat, setSaveTemplateCat] = useState('custom');
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const undoStack = useRef<LessonBlock[][]>([]);
  const redoStack = useRef<LessonBlock[][]>([]);
  const isUndoRedo = useRef(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadTarget, setFileUploadTarget] = useState<{ blockId: string; field: string } | null>(null);

  useEffect(() => {
    loadLesson();
  }, [lessonId]);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (blocks.length > 0 && !saving) {
        saveBlocks(true);
      }
    }, 30000);
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [blocks, saving]);

  // Track block changes for undo/redo
  useEffect(() => {
    if (isUndoRedo.current) { isUndoRedo.current = false; return; }
    if (blocks.length === 0) return;
    const last = undoStack.current[undoStack.current.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(blocks)) return;
    undoStack.current.push(JSON.parse(JSON.stringify(blocks)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, [blocks]);

  // Keyboard shortcuts: Ctrl+S save, Ctrl+Z undo, Ctrl+Shift+Z redo, arrow nav, Delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (blocks.length > 0 && !saving) saveBlocks(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.current.length > 1) {
          const current = undoStack.current.pop()!;
          redoStack.current.push(current);
          const prev = undoStack.current[undoStack.current.length - 1];
          isUndoRedo.current = true;
          setBlocks(JSON.parse(JSON.stringify(prev)));
        }
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        if (redoStack.current.length > 0) {
          const next = redoStack.current.pop()!;
          undoStack.current.push(next);
          isUndoRedo.current = true;
          setBlocks(JSON.parse(JSON.stringify(next)));
        }
      }
      // Block navigation: Alt+ArrowUp/Down to move selection, Alt+Delete to remove
      if (!isInput && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (blocks.length === 0) return;
        const curIdx = selectedBlockId ? blocks.findIndex(b => b.id === selectedBlockId) : -1;
        if (e.key === 'ArrowUp') {
          const newIdx = curIdx > 0 ? curIdx - 1 : blocks.length - 1;
          setSelectedBlockId(blocks[newIdx].id);
        } else {
          const newIdx = curIdx < blocks.length - 1 ? curIdx + 1 : 0;
          setSelectedBlockId(blocks[newIdx].id);
        }
      }
      if (!isInput && e.altKey && e.key === 'Delete' && selectedBlockId) {
        e.preventDefault();
        removeBlock(selectedBlockId);
      }
      // Escape to deselect
      if (e.key === 'Escape' && selectedBlockId && !isInput) {
        setSelectedBlockId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks, saving, selectedBlockId]);

  async function loadLesson() {
    setLoading(true);
    try {
      const [lessonRes, blocksRes] = await Promise.all([
        fetch(`/api/admin/learn/lessons?id=${lessonId}`),
        fetch(`/api/admin/learn/lesson-blocks?lesson_id=${lessonId}`),
      ]);
      let lessonData: any = null;
      if (lessonRes.ok) {
        const data = await lessonRes.json();
        lessonData = data.lesson || null;
        setLesson(data.lesson || null);
        setIsDraft(data.lesson?.status === 'draft');
      }
      if (blocksRes.ok) {
        const data = await blocksRes.json();
        const loadedBlocks = (data.blocks || []).sort((a: LessonBlock, b: LessonBlock) => a.order_index - b.order_index);

        // Auto-convert: If lesson has HTML content but no blocks, parse into discrete blocks
        if (loadedBlocks.length === 0 && lessonData?.content && lessonData.content.trim().length > 0) {
          const parsed = parseHtmlToBlocks(lessonData.content);
          setBlocks(parsed.length > 0 ? parsed : [{ id: `temp-converted-${Date.now()}`, block_type: 'text', content: { html: lessonData.content }, order_index: 0 }]);
          setConvertedFromHtml(true);
        } else {
          setBlocks(loadedBlocks);
        }
      }
    } catch (err) { console.error('LessonBuilderPage: failed to load lesson', err); }
    setLoading(false);
  }

  async function saveBlocks(isAutoSave = false) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/learn/lesson-blocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          blocks: blocks.map((b, i) => ({ block_type: b.block_type, content: b.content, order_index: i, style: b.style || undefined })),
        }),
      });
      if (res.ok) {
        setLastSaved(new Date().toLocaleTimeString());
        if (isAutoSave) { setAutoSaveFlash(true); setTimeout(() => setAutoSaveFlash(false), 2000); }
      }
    } catch (err) { console.error('LessonBuilderPage: failed to save blocks', err); }
    setSaving(false);
  }

  // Fetch question bank questions for quiz block import
  async function fetchQuestionBank(blockId: string) {
    setQbLoading(true);
    setShowQbPicker(blockId);
    try {
      const res = await fetch(`/api/admin/learn/questions?lesson_id=${lessonId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setQbQuestions((data.questions || []).filter((q: any) =>
          q.question_type === 'multiple_choice' || q.question_type === 'true_false'
        ));
      }
    } catch (err) { console.error('Failed to fetch question bank', err); }
    setQbLoading(false);
  }

  function importQuestion(blockId: string, question: any) {
    const options: string[] = Array.isArray(question.options) ? question.options : [];
    const correctIdx = options.findIndex((o: string) => o === question.correct_answer);
    updateBlockContent(blockId, {
      question: question.question_text,
      options: options.length > 0 ? options : ['', ''],
      correct: correctIdx >= 0 ? correctIdx : 0,
      explanation: question.explanation || '',
      source_question_id: question.id,
    });
    setShowQbPicker(null);
    setQbQuestions([]);
  }

  // Block templates CRUD
  async function loadTemplates() {
    if (savedTemplates.length > 0) return; // already loaded
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/admin/learn/block-templates');
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(data.templates || []);
      }
    } catch (err) { console.error('Failed to load block templates', err); }
    setTemplatesLoading(false);
  }

  function insertTemplate(template: any) {
    const idx = insertIdx !== null ? insertIdx : blocks.length;
    const templateBlocks = (template.blocks || []).map((b: any, i: number) => ({
      id: `temp-${Date.now()}-${i}`,
      block_type: b.block_type,
      content: JSON.parse(JSON.stringify(b.content || {})),
      order_index: idx + i,
      style: b.style ? JSON.parse(JSON.stringify(b.style)) : undefined,
    }));
    const updated = [...blocks];
    updated.splice(idx, 0, ...templateBlocks);
    setBlocks(updated.map((b, i) => ({ ...b, order_index: i })));
    setShowBlockPicker(false);
    setInsertIdx(null);
    setBlockPickerTab('blocks');
    if (templateBlocks.length > 0) setSelectedBlockId(templateBlocks[0].id);
  }

  async function saveAsTemplate() {
    if (!saveTemplateName.trim()) return;
    // Save multi-selected, single-selected, or all blocks as a template
    const blocksToSave = multiSelect.size > 1
      ? blocks.filter(b => multiSelect.has(b.id)).map(b => ({ block_type: b.block_type, content: b.content, style: b.style }))
      : selectedBlockId
        ? blocks.filter(b => b.id === selectedBlockId).map(b => ({ block_type: b.block_type, content: b.content, style: b.style }))
        : blocks.map(b => ({ block_type: b.block_type, content: b.content, style: b.style }));
    try {
      const res = await fetch('/api/admin/learn/block-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveTemplateName.trim(),
          description: saveTemplateDesc.trim(),
          category: saveTemplateCat,
          blocks: blocksToSave,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedTemplates(prev => [...prev, data.template]);
        setShowSaveTemplate(false);
        setSaveTemplateName('');
        setSaveTemplateDesc('');
      }
    } catch (err) { console.error('Failed to save template', err); }
  }

  async function deleteTemplate(templateId: string) {
    try {
      const res = await fetch(`/api/admin/learn/block-templates?id=${templateId}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
      }
    } catch (err) { console.error('Failed to delete template', err); }
  }

  async function loadLinkedContent() {
    if (linkedLoaded) return;
    setLinkedLoaded(true);
    try {
      const [qRes, fcRes, artRes] = await Promise.all([
        fetch(`/api/admin/learn/questions?lesson_id=${lessonId}&limit=20`),
        fetch(`/api/admin/learn/flashcards?lesson_id=${lessonId}&limit=20`),
        fetch(`/api/admin/learn/articles?lesson_id=${lessonId}`),
      ]);
      const qData = qRes.ok ? await qRes.json() : { questions: [] };
      const fcData = fcRes.ok ? await fcRes.json() : { flashcards: [] };
      const artData = artRes.ok ? await artRes.json() : { articles: [] };
      setLinkedContent({
        questions: qData.questions || [],
        flashcards: fcData.flashcards || fcData.cards || [],
        articles: artData.articles || [],
      });
    } catch (err) { console.error('Failed to load linked content', err); }
  }

  async function togglePublish() {
    const newStatus = isDraft ? 'published' : 'draft';
    try {
      const res = await fetch('/api/admin/learn/lessons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lessonId, status: newStatus }),
      });
      if (res.ok) setIsDraft(!isDraft);
    } catch (err) { console.error('LessonBuilderPage: failed to toggle publish', err); }
  }

  function addBlock(type: BlockType) {
    const idx = insertIdx !== null ? insertIdx : blocks.length;
    const defaultContent = getDefaultContent(type);
    const newBlock: LessonBlock = {
      id: `temp-${Date.now()}`,
      block_type: type,
      content: defaultContent,
      order_index: idx,
    };
    const updated = [...blocks];
    updated.splice(idx, 0, newBlock);
    setBlocks(updated.map((b, i) => ({ ...b, order_index: i })));
    setShowBlockPicker(false);
    setInsertIdx(null);
    setSelectedBlockId(newBlock.id);
  }

  function getDefaultContent(type: BlockType): Record<string, any> {
    switch (type) {
      case 'text': return { html: '<p>Enter text here...</p>' };
      case 'html': return { code: '<div>\n  <p>Your HTML here</p>\n</div>' };
      case 'image': return { url: '', alt: '', caption: '', alignment: 'center' };
      case 'video': return { url: '', type: 'youtube', caption: '' };
      case 'audio': return { url: '', title: '', autoplay: false };
      case 'callout': return { type: 'info', text: 'Important information here.' };
      case 'divider': return {};
      case 'quiz': return { question: '', options: ['', ''], correct: 0, explanation: '' };
      case 'embed': return { url: '', height: 400 };
      case 'table': return { headers: ['Column 1', 'Column 2'], rows: [['', '']] };
      case 'file': return { url: '', name: '', size: 0, type: '' };
      case 'slideshow': return { images: [{ url: '', alt: '', caption: '' }] };
      case 'link_reference': return { links: [{ title: '', url: '', type: 'reference', description: '' }] };
      case 'flashcard': return { cards: [{ front: 'Term or question', back: 'Definition or answer' }] };
      case 'popup_article': return { summary: 'Click to read more...', title: 'Article Title', full_content: '<p>Full article content here...</p>' };
      case 'backend_link': return { path: '/admin/learn', title: 'Page Title', description: 'Click to navigate', icon: '📖' };
      case 'highlight': return { text: 'Key term or concept', style: 'blue' };
      case 'key_takeaways': return { title: 'Key Takeaways', items: ['First takeaway', 'Second takeaway'] };
      case 'equation': return { latex: 'E = mc^2', label: '', display: 'block' };
      case 'tabs': return { tabs: [{ title: 'Tab 1', content: '<p>Content for tab 1</p>' }, { title: 'Tab 2', content: '<p>Content for tab 2</p>' }], activeTab: 0 };
      case 'accordion': return { sections: [{ title: 'Section 1', content: '<p>Content for section 1</p>', open: true }, { title: 'Section 2', content: '<p>Content for section 2</p>', open: false }] };
      case 'columns': return { columnCount: 2, columns: [{ html: '<p>Left column content</p>' }, { html: '<p>Right column content</p>' }] };
      default: return {};
    }
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id).map((b, i) => ({ ...b, order_index: i })));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
    setBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
  }

  function duplicateBlock(id: string) {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const orig = blocks[idx];
    const copy: LessonBlock = {
      id: `temp-${Date.now()}`,
      block_type: orig.block_type,
      content: JSON.parse(JSON.stringify(orig.content)),
      order_index: idx + 1,
    };
    const updated = [...blocks];
    updated.splice(idx + 1, 0, copy);
    setBlocks(updated.map((b, i) => ({ ...b, order_index: i })));
    setSelectedBlockId(copy.id);
  }

  function updateBlockContent(id: string, content: Record<string, any>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  }

  function updateBlockStyle(id: string, styleUpdate: Partial<BlockStyle>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, style: { ...(b.style || {}), ...styleUpdate } } : b));
  }

  // File handling via browser FileReader (converts to base64 data URL)
  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !fileUploadTarget) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const block = blocks.find(b => b.id === fileUploadTarget.blockId);
      if (!block) return;

      if (fileUploadTarget.field === 'slideshow-add') {
        const images = [...(block.content.images || []), { url: dataUrl, alt: file.name, caption: '' }];
        updateBlockContent(block.id, { ...block.content, images });
      } else if (fileUploadTarget.field === 'file') {
        updateBlockContent(block.id, { ...block.content, url: dataUrl, name: file.name, size: file.size, type: file.type });
      } else {
        updateBlockContent(block.id, { ...block.content, [fileUploadTarget.field]: dataUrl });
      }
      setFileUploadTarget(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function triggerFileUpload(blockId: string, field: string, accept?: string) {
    setFileUploadTarget({ blockId, field });
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept || 'image/*';
      fileInputRef.current.click();
    }
  }

  // Drag-and-drop handler for image blocks
  function handleDrop(e: DragEvent<HTMLDivElement>, blockId: string, field: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlockId(null);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;
      if (field === 'slideshow-add') {
        const images = [...(block.content.images || []), { url: dataUrl, alt: file.name, caption: '' }];
        updateBlockContent(blockId, { ...block.content, images });
      } else {
        updateBlockContent(blockId, { ...block.content, [field]: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, blockId: string) {
    e.preventDefault();
    setDragOverBlockId(blockId);
  }

  function handleDragLeave() {
    setDragOverBlockId(null);
  }

  // Block-level drag-and-drop reordering
  function onBlockDragStart(e: React.DragEvent, blockId: string) {
    setDragBlockId(blockId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId);
    // Make drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }
  function onBlockDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragBlockId(null);
    setDragOverIdx(null);
  }
  function onBlockDragOver(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragBlockId) setDragOverIdx(targetIdx);
  }
  function onBlockDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (!dragBlockId) return;
    const fromIdx = blocks.findIndex(b => b.id === dragBlockId);
    if (fromIdx < 0 || fromIdx === targetIdx) { setDragBlockId(null); setDragOverIdx(null); return; }
    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(fromIdx, 1);
    const adjustedIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
    newBlocks.splice(adjustedIdx, 0, moved);
    setBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
    setDragBlockId(null);
    setDragOverIdx(null);
  }

  // Estimate reading time from block content
  function estimateReadingTime(): number {
    let wordCount = 0;
    for (const block of blocks) {
      const c = block.content;
      if (c.html) wordCount += c.html.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      if (c.text) wordCount += c.text.split(/\s+/).filter(Boolean).length;
      if (c.question) wordCount += c.question.split(/\s+/).filter(Boolean).length;
      if (c.explanation) wordCount += c.explanation.split(/\s+/).filter(Boolean).length;
      if (c.code) wordCount += c.code.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      if (c.summary) wordCount += c.summary.split(/\s+/).filter(Boolean).length;
      if (c.full_content) wordCount += c.full_content.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      if (Array.isArray(c.items)) c.items.forEach((item: string) => { wordCount += item.split(/\s+/).filter(Boolean).length; });
      if (Array.isArray(c.cards)) c.cards.forEach((card: any) => { wordCount += ((card.front || '') + ' ' + (card.back || '')).split(/\s+/).filter(Boolean).length; });
      if (Array.isArray(c.options)) c.options.forEach((opt: string) => { wordCount += opt.split(/\s+/).filter(Boolean).length; });
    }
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  // Slideshow navigation
  function slideshowNav(blockId: string, dir: 'prev' | 'next', total: number) {
    setSlideshowIndexes(prev => {
      const curr = prev[blockId] || 0;
      let next = dir === 'next' ? curr + 1 : curr - 1;
      if (next < 0) next = total - 1;
      if (next >= total) next = 0;
      return { ...prev, [blockId]: next };
    });
  }

  if (loading) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">⏳</div>
        <div className="admin-empty__title">Loading lesson builder...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">❌</div>
        <div className="admin-empty__title">Lesson not found</div>
        <Link href="/admin/learn/manage" className="admin-btn admin-btn--ghost">&larr; Back to Manage Content</Link>
      </div>
    );
  }

  return (
    <div className="lesson-builder">
      {/* Hidden file input for uploads */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />

      {/* Smart Search */}
      <div style={{ marginBottom: '.75rem' }}>
        <SmartSearch compact onSelect={(result) => {
          if (result.builderUrl) router.push(result.builderUrl);
          else if (result.url) router.push(result.url);
        }} placeholder="Search modules, lessons, questions, flashcards... (Ctrl+K)" />
      </div>

      {/* Builder Header */}
      <div className="lesson-builder__header">
        <div className="lesson-builder__header-left">
          <Link href="/admin/learn/manage" className="learn__back">&larr; Back to Manage</Link>
          <h2 className="lesson-builder__title">{lesson.title}</h2>
          {lesson.module_id && <span style={{ fontSize: '.72rem', color: '#6B7280' }}>Module: {lesson.module_id.slice(0, 8)}...</span>}
        </div>
        <div className="lesson-builder__header-right">
          <span className={`lesson-builder__status ${isDraft ? 'lesson-builder__status--draft' : 'lesson-builder__status--published'}`}>
            {isDraft ? 'Draft' : 'Published'}
          </span>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={togglePublish}>
            {isDraft ? 'Publish' : 'Unpublish'}
          </button>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setPreviewMode(!previewMode)}>
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          {blocks.length > 0 && (
            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setShowSaveTemplate(true)} title="Save blocks as reusable template">
              Save Template
            </button>
          )}
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setShowLinkedPanel(!showLinkedPanel); loadLinkedContent(); }}>
            Linked Content
          </button>
          <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveBlocks(false)} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>{blocks.length} block{blocks.length !== 1 ? 's' : ''} &middot; ~{estimateReadingTime()} min read</span>
          <div style={{ display: 'flex', gap: '.25rem' }}>
            <button className="lesson-builder__undo-btn" title="Undo (Ctrl+Z)" disabled={undoStack.current.length <= 1} onClick={() => { if (undoStack.current.length > 1) { const cur = undoStack.current.pop()!; redoStack.current.push(cur); isUndoRedo.current = true; setBlocks(JSON.parse(JSON.stringify(undoStack.current[undoStack.current.length - 1]))); } }}>↶</button>
            <button className="lesson-builder__undo-btn" title="Redo (Ctrl+Shift+Z)" disabled={redoStack.current.length === 0} onClick={() => { if (redoStack.current.length > 0) { const next = redoStack.current.pop()!; undoStack.current.push(next); isUndoRedo.current = true; setBlocks(JSON.parse(JSON.stringify(next))); } }}>↷</button>
          </div>
          {lastSaved && <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Saved {lastSaved}</span>}
          {autoSaveFlash && <span className="lesson-builder__autosave-flash">Auto-saved</span>}
          <span style={{ fontSize: '0.65rem', color: '#D1D5DB' }}>Ctrl+S / Z / Y</span>
        </div>
      </div>

      {/* Conversion Banner */}
      {convertedFromHtml && (
        <div className="lesson-builder__convert-banner">
          <span>This lesson&apos;s HTML content was auto-parsed into {blocks.length} editable block{blocks.length !== 1 ? 's' : ''} (headings, callouts, tables, images, etc.). Click <strong>Save</strong> to persist.</span>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setConvertedFromHtml(false)}>Dismiss</button>
        </div>
      )}

      {/* Preview Mode */}
      {previewMode ? (
        <div className="lesson__body">
          {blocks.map((block) => {
            const blockWrapStyle: React.CSSProperties = {};
            if (block.style?.backgroundColor && block.style.backgroundColor !== '#ffffff') blockWrapStyle.backgroundColor = block.style.backgroundColor;
            if (block.style?.borderColor && block.style?.borderWidth) { blockWrapStyle.border = `${block.style.borderWidth}px solid ${block.style.borderColor}`; }
            if (block.style?.borderRadius !== undefined) blockWrapStyle.borderRadius = `${block.style.borderRadius}px`;
            if (block.style?.boxShadow && block.style.boxShadow !== 'none') {
              const shadows: Record<string, string> = { sm: '0 1px 3px rgba(0,0,0,.1)', md: '0 4px 12px rgba(0,0,0,.1)', lg: '0 8px 24px rgba(0,0,0,.12)', xl: '0 16px 40px rgba(0,0,0,.15)' };
              blockWrapStyle.boxShadow = shadows[block.style.boxShadow] || 'none';
            }
            if (block.style?.width && block.style.width !== 'full') {
              const widths: Record<string, string> = { wide: '80%', half: '50%', third: '33%' };
              blockWrapStyle.maxWidth = widths[block.style.width]; blockWrapStyle.margin = '0 auto';
            }
            if (Object.keys(blockWrapStyle).length > 0) { blockWrapStyle.padding = blockWrapStyle.padding || '1rem'; blockWrapStyle.marginBottom = '1rem'; }
            const isCollapsible = block.style?.collapsible;
            const isHidden = block.style?.hidden;
            const isCollapsed = collapsedBlocks[block.id] ?? true;
            if (isHidden && isCollapsed) {
              return (
                <div key={block.id} style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <button className="admin-btn admin-btn--ghost" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: false }))} style={{ fontSize: '.85rem' }}>
                    {block.style?.hiddenLabel || 'Click to reveal'}
                  </button>
                </div>
              );
            }
            return (
            <div key={block.id} style={blockWrapStyle}>
              {isCollapsible && (
                <button className="lesson-builder__collapse-toggle" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: !isCollapsed }))}>
                  <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform .2s' }}>&#x25BC;</span>
                  {' '}{block.style?.collapsedLabel || block.block_type}
                </button>
              )}
              <div className={`block-collapsible-wrap ${(!isCollapsible || !isCollapsed) ? 'block-collapsible-wrap--open' : ''}`}><div>
              {block.block_type === 'text' && (
                <div dangerouslySetInnerHTML={{ __html: block.content.html || '' }} />
              )}
              {block.block_type === 'image' && block.content.url && (
                <figure style={{ textAlign: (block.content.alignment || 'center') as any, margin: '1.5rem 0' }}>
                  <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                  {block.content.caption && <figcaption style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem' }}>{block.content.caption}</figcaption>}
                </figure>
              )}
              {block.block_type === 'video' && block.content.url && (
                <div style={{ margin: '1.5rem 0' }}>
                  <iframe src={convertToEmbedUrl(block.content.url)} style={{ width: '100%', aspectRatio: '16/9', border: 'none', borderRadius: '8px' }} allowFullScreen />
                  {block.content.caption && <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem', textAlign: 'center' }}>{block.content.caption}</p>}
                </div>
              )}
              {block.block_type === 'callout' && (
                <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`}>
                  <span dangerouslySetInnerHTML={{ __html: block.content.text || '' }} />
                </div>
              )}
              {block.block_type === 'highlight' && (
                <div className={`block-highlight block-highlight--${block.content.style || 'blue'}`}>
                  <span dangerouslySetInnerHTML={{ __html: block.content.text || '' }} />
                </div>
              )}
              {block.block_type === 'key_takeaways' && (
                <div className="block-takeaways">
                  <h4 className="block-takeaways__title">{block.content.title || 'Key Takeaways'}</h4>
                  <ul className="block-takeaways__list">
                    {(block.content.items || []).map((item: string, i: number) => (
                      <li key={i} className="block-takeaways__item">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {block.block_type === 'equation' && (
                <div className={`lesson-builder__equation ${block.content.display === 'inline' ? 'lesson-builder__equation--inline' : ''}`}>
                  <div className="lesson-builder__equation-rendered" dangerouslySetInnerHTML={{ __html: renderLatex(block.content.latex || '') }} />
                  {block.content.label && <div className="lesson-builder__equation-label">{block.content.label}</div>}
                </div>
              )}
              {block.block_type === 'tabs' && (
                <div className="block-tabs">
                  <div className="block-tabs__header">
                    {(block.content.tabs || []).map((tab: any, ti: number) => (
                      <button key={ti} className={`block-tabs__tab ${(previewTabIndexes[block.id] ?? 0) === ti ? 'block-tabs__tab--active' : ''}`} onClick={() => setPreviewTabIndexes(prev => ({ ...prev, [block.id]: ti }))}>{tab.title || `Tab ${ti + 1}`}</button>
                    ))}
                  </div>
                  <div className="block-tabs__content" dangerouslySetInnerHTML={{ __html: (block.content.tabs || [])[previewTabIndexes[block.id] ?? 0]?.content || '' }} />
                </div>
              )}
              {block.block_type === 'accordion' && (
                <div className="block-accordion">
                  {(block.content.sections || []).map((sec: any, si: number) => {
                    const key = `${block.id}-${si}`;
                    const isOpen = previewAccordionOpen[key] ?? sec.open;
                    return (
                      <div key={si} className="block-accordion__section">
                        <button className="block-accordion__header" onClick={() => setPreviewAccordionOpen(prev => ({ ...prev, [key]: !isOpen }))}>
                          <span className="block-accordion__arrow">{isOpen ? '▾' : '▸'}</span>
                          <span className="block-accordion__title">{sec.title || `Section ${si + 1}`}</span>
                        </button>
                        {isOpen && <div className="block-accordion__content" dangerouslySetInnerHTML={{ __html: sec.content || '' }} />}
                      </div>
                    );
                  })}
                </div>
              )}
              {block.block_type === 'columns' && (
                <div className="block-columns" style={{ gridTemplateColumns: `repeat(${block.content.columnCount || 2}, 1fr)` }}>
                  {(block.content.columns || []).map((col: any, ci: number) => (
                    <div key={ci} className="block-columns__col" dangerouslySetInnerHTML={{ __html: col.html || '' }} />
                  ))}
                </div>
              )}
              {block.block_type === 'divider' && <hr style={{ border: 'none', borderTop: '2px solid #E5E7EB', margin: '2rem 0' }} />}
              {block.block_type === 'embed' && block.content.url && (
                <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: '1px solid #E5E7EB', borderRadius: '8px', margin: '1.5rem 0' }} />
              )}
              {block.block_type === 'table' && (
                <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
                  <table className="lesson-builder__preview-table">
                    <thead>
                      <tr>{(block.content.headers || []).map((h: string, i: number) => <th key={i} dangerouslySetInnerHTML={{ __html: h }} />)}</tr>
                    </thead>
                    <tbody>
                      {(block.content.rows || []).map((row: string[], ri: number) => (
                        <tr key={ri}>{row.map((cell, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: cell }} />)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {block.block_type === 'quiz' && (() => {
                const qKey = block.id;
                const selected = quizAnswers[qKey] ?? null;
                const revealed = quizRevealed[qKey] || false;
                return (
                  <div className="block-quiz" style={{ margin: '1.5rem 0' }}>
                    <div className="block-quiz__question">{block.content.question}</div>
                    <div className="block-quiz__options">
                      {(block.content.options || []).map((opt: string, i: number) => {
                        const isCorrect = i === block.content.correct;
                        const isSelected = selected === i;
                        let cls = 'block-quiz__option';
                        if (revealed && isCorrect) cls += ' block-quiz__option--correct';
                        else if (revealed && isSelected) cls += ' block-quiz__option--wrong';
                        else if (isSelected) cls += ' block-quiz__option--selected';
                        return (
                          <button key={i} className={cls} onClick={() => { if (!revealed) setQuizAnswers(prev => ({ ...prev, [qKey]: i })); }} disabled={revealed}>
                            <span className="block-quiz__option-letter">{String.fromCharCode(65 + i)}</span>
                            <span className="block-quiz__option-text">{opt}</span>
                            {revealed && isCorrect && <span className="block-quiz__option-icon">&#x2713;</span>}
                            {revealed && isSelected && !isCorrect && <span className="block-quiz__option-icon">&#x2717;</span>}
                          </button>
                        );
                      })}
                    </div>
                    {selected !== null && !revealed && (
                      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setQuizRevealed(prev => ({ ...prev, [qKey]: true }))} style={{ marginTop: '.75rem' }}>Check Answer</button>
                    )}
                    {revealed && (
                      <div className={`block-quiz__result ${selected === block.content.correct ? 'block-quiz__result--correct' : 'block-quiz__result--wrong'}`}>
                        <strong>{selected === block.content.correct ? 'Correct!' : 'Incorrect.'}</strong>
                        {block.content.explanation && <p style={{ margin: '.35rem 0 0' }}>{block.content.explanation}</p>}
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => { setQuizAnswers(prev => ({ ...prev, [qKey]: null })); setQuizRevealed(prev => ({ ...prev, [qKey]: false })); }} style={{ marginTop: '.5rem' }}>Try Again</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {block.block_type === 'file' && block.content.url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#F8F9FA', borderRadius: '8px', margin: '1.5rem 0', border: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: '1.5rem' }}>📎</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{block.content.name || 'File'}</div>
                    {block.content.size > 0 && <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{formatFileSize(block.content.size)}</div>}
                  </div>
                  <a href={block.content.url} download={block.content.name} className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginLeft: 'auto' }}>Download</a>
                </div>
              )}
              {block.block_type === 'slideshow' && (block.content.images || []).length > 0 && (
                <div className="lesson-builder__slideshow-preview" style={{ margin: '1.5rem 0' }}>
                  {(() => {
                    const images = block.content.images || [];
                    const idx = slideshowIndexes[block.id] || 0;
                    const img = images[idx];
                    if (!img) return null;
                    return (
                      <div style={{ position: 'relative', textAlign: 'center' }}>
                        <img src={img.url} alt={img.alt || ''} style={{ maxWidth: '100%', maxHeight: '500px', borderRadius: '8px', objectFit: 'contain' }} />
                        {img.caption && <p style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem' }}>{img.caption}</p>}
                        {images.length > 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'prev', images.length)}>&larr;</button>
                            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{idx + 1} / {images.length}</span>
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => slideshowNav(block.id, 'next', images.length)}>&rarr;</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              {block.block_type === 'html' && (
                <div dangerouslySetInnerHTML={{ __html: block.content.code || '' }} style={{ margin: '1.5rem 0' }} />
              )}
              {block.block_type === 'audio' && block.content.url && (
                <div style={{ margin: '1.5rem 0' }}>
                  {block.content.title && <p style={{ fontWeight: 600, marginBottom: '.5rem' }}>{block.content.title}</p>}
                  <audio controls src={block.content.url} style={{ width: '100%' }}>Your browser does not support audio.</audio>
                </div>
              )}
              {block.block_type === 'link_reference' && (block.content.links || []).length > 0 && (
                <div className="lesson-resources" style={{ margin: '1.5rem 0' }}>
                  <div className="lesson-resources__list">
                    {(block.content.links || []).map((link: any, i: number) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="lesson-resources__link">
                        {link.type === 'pdf' ? '📄' : link.type === 'website' ? '🌐' : link.type === 'quiz' ? '❓' : link.type === 'practice' ? '🎯' : '📎'} {link.title || link.url}
                        {link.description && <span style={{ fontSize: '.78rem', color: '#9CA3AF', marginLeft: '.5rem' }}>{link.description}</span>}
                        <span className="lesson-resources__arrow">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {block.block_type === 'flashcard' && (block.content.cards || []).length > 0 && (() => {
                const cards = block.content.cards || [];
                const cardIdx = flashcardIndexes[block.id] || 0;
                const card = cards[cardIdx];
                const isFlipped = flippedCards[block.id] || false;
                return (
                  <div className="block-flashcard" style={{ margin: '1.5rem 0' }}>
                    <div className={`block-flashcard__card ${isFlipped ? 'block-flashcard__card--flipped' : ''}`} onClick={() => setFlippedCards(prev => ({ ...prev, [block.id]: !isFlipped }))}>
                      <div className="block-flashcard__face block-flashcard__front">
                        <span className="block-flashcard__label">FRONT</span>
                        <p className="block-flashcard__text">{card?.front || ''}</p>
                        <span className="block-flashcard__hint">Click to flip</span>
                      </div>
                      <div className="block-flashcard__face block-flashcard__back">
                        <span className="block-flashcard__label">BACK</span>
                        <p className="block-flashcard__text">{card?.back || ''}</p>
                        <span className="block-flashcard__hint">Click to flip</span>
                      </div>
                    </div>
                    {cards.length > 1 && (
                      <div className="block-flashcard__nav">
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx <= 0 ? cards.length - 1 : cardIdx - 1 })); }}>&larr;</button>
                        <span style={{ fontSize: '.82rem', color: '#6B7280' }}>{cardIdx + 1} / {cards.length}</span>
                        <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={(e) => { e.stopPropagation(); setFlippedCards(prev => ({ ...prev, [block.id]: false })); setFlashcardIndexes(prev => ({ ...prev, [block.id]: cardIdx >= cards.length - 1 ? 0 : cardIdx + 1 })); }}>&rarr;</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {block.block_type === 'popup_article' && (
                <div className="block-popup-article" style={{ margin: '1.5rem 0' }}>
                  <div className="block-popup-article__header" onClick={() => setExpandedPopups(prev => ({ ...prev, [block.id]: !prev[block.id] }))}>
                    <div>
                      <h4 className="block-popup-article__title">{block.content.title || 'Article'}</h4>
                      <p className="block-popup-article__summary">{block.content.summary || ''}</p>
                    </div>
                    <span className={`block-popup-article__chevron ${expandedPopups[block.id] ? 'block-popup-article__chevron--open' : ''}`}>&#x25BC;</span>
                  </div>
                  <div className={`block-popup-article__body ${expandedPopups[block.id] ? 'block-popup-article__body--open' : ''}`}>
                    <div className="block-popup-article__content" dangerouslySetInnerHTML={{ __html: block.content.full_content || '' }} />
                  </div>
                </div>
              )}
              {block.block_type === 'backend_link' && (
                <div className="block-backend-link" style={{ margin: '1.5rem 0' }}>
                  <span className="block-backend-link__icon">{block.content.icon || '📖'}</span>
                  <div className="block-backend-link__info">
                    <span className="block-backend-link__title">{block.content.title || 'Page'}</span>
                    {block.content.description && <span className="block-backend-link__desc">{block.content.description}</span>}
                  </div>
                  <span className="block-backend-link__arrow">→</span>
                </div>
              )}
              {isHidden && !isCollapsed && (
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setCollapsedBlocks(prev => ({ ...prev, [block.id]: true }))} style={{ marginTop: '.5rem', fontSize: '.78rem' }}>Hide</button>
              )}
              </div></div>
            </div>
            );
          })}
          {blocks.length === 0 && (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '3rem' }}>No content blocks yet. Switch to Edit mode to add blocks.</p>
          )}
        </div>
      ) : (
        /* Edit Mode */
        <div className="lesson-builder__canvas">
          {/* Multi-select bulk actions bar */}
          {multiSelect.size > 1 && (
            <div className="lesson-builder__bulk-bar">
              <span style={{ fontWeight: 600, fontSize: '.82rem' }}>{multiSelect.size} blocks selected</span>
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                  setSaveTemplateName('');
                  setSaveTemplateDesc('');
                  setShowSaveTemplate(true);
                  // Save multi-selected blocks (override single selection logic temporarily)
                  setSelectedBlockId(null);
                }}>Save as Template</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                  // Duplicate all selected blocks
                  const selectedBlocks = blocks.filter(b => multiSelect.has(b.id));
                  const copies = selectedBlocks.map((b, i) => ({
                    id: `temp-${Date.now()}-dup-${i}`,
                    block_type: b.block_type,
                    content: JSON.parse(JSON.stringify(b.content)),
                    order_index: blocks.length + i,
                    style: b.style ? JSON.parse(JSON.stringify(b.style)) : undefined,
                  }));
                  setBlocks([...blocks, ...copies].map((b, i) => ({ ...b, order_index: i })));
                  setMultiSelect(new Set());
                }}>Duplicate All</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm lesson-builder__block-btn--danger" style={{ color: '#DC2626' }} onClick={() => {
                  setBlocks(blocks.filter(b => !multiSelect.has(b.id)).map((b, i) => ({ ...b, order_index: i })));
                  setMultiSelect(new Set());
                  setSelectedBlockId(null);
                }}>Delete All</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setMultiSelect(new Set())}>Clear</button>
              </div>
            </div>
          )}
          {blocks.length === 0 && (
            <div className="lesson-builder__empty">
              <p>This lesson has no content blocks yet.</p>
              <button className="admin-btn admin-btn--primary" onClick={() => { setInsertIdx(0); setShowBlockPicker(true); }}>
                + Add First Block
              </button>
            </div>
          )}

          {blocks.map((block, idx) => (
            <div key={block.id}>
              {/* Drop indicator above block */}
              {dragBlockId && dragBlockId !== block.id && (
                <div
                  className={`lesson-builder__drop-indicator ${dragOverIdx === idx ? 'lesson-builder__drop-indicator--active' : ''}`}
                  onDragOver={e => onBlockDragOver(e, idx)}
                  onDrop={e => onBlockDrop(e, idx)}
                />
              )}
            <div
              className={`lesson-builder__block ${selectedBlockId === block.id ? 'lesson-builder__block--selected' : ''} ${multiSelect.has(block.id) ? 'lesson-builder__block--multi-selected' : ''} ${dragBlockId === block.id ? 'lesson-builder__block--dragging' : ''}`}
              onClick={(e) => {
                if (e.shiftKey && selectedBlockId) {
                  // Shift+click: range select between current and target
                  const startIdx = blocks.findIndex(b => b.id === selectedBlockId);
                  const endIdx = blocks.findIndex(b => b.id === block.id);
                  if (startIdx >= 0 && endIdx >= 0) {
                    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                    const newSet = new Set(multiSelect);
                    for (let i = lo; i <= hi; i++) newSet.add(blocks[i].id);
                    setMultiSelect(newSet);
                  }
                } else if (e.ctrlKey || e.metaKey) {
                  // Ctrl/Cmd+click: toggle individual selection
                  const newSet = new Set(multiSelect);
                  if (newSet.has(block.id)) newSet.delete(block.id); else newSet.add(block.id);
                  setMultiSelect(newSet);
                } else {
                  setSelectedBlockId(block.id);
                  setMultiSelect(new Set());
                }
              }}
              draggable
              onDragStart={e => onBlockDragStart(e, block.id)}
              onDragEnd={onBlockDragEnd}
              onDragOver={e => onBlockDragOver(e, idx)}
              onDrop={e => onBlockDrop(e, idx)}
            >
              {/* Block Toolbar */}
              <div className="lesson-builder__block-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  <span className="lesson-builder__drag-handle" title="Drag to reorder">⠿</span>
                  <span className="lesson-builder__block-type">
                    {block.block_type}
                    {block.style?.collapsible && <span style={{ marginLeft: '.35rem', fontSize: '.6rem', background: '#DBEAFE', color: '#1E40AF', padding: '.1rem .3rem', borderRadius: '3px' }}>COLLAPSIBLE</span>}
                    {block.style?.hidden && <span style={{ marginLeft: '.35rem', fontSize: '.6rem', background: '#FEF3C7', color: '#92400E', padding: '.1rem .3rem', borderRadius: '3px' }}>HIDDEN</span>}
                  </span>
                </div>
                <div className="lesson-builder__block-actions">
                  <button className="lesson-builder__block-btn" onClick={(e) => { e.stopPropagation(); setShowStylePanel(showStylePanel === block.id ? null : block.id); }} title="Style" style={showStylePanel === block.id ? { borderColor: '#1D3095', color: '#1D3095' } : undefined}>🎨</button>
                  <button className="lesson-builder__block-btn" onClick={() => moveBlock(block.id, 'up')} disabled={idx === 0} title="Move up">↑</button>
                  <button className="lesson-builder__block-btn" onClick={() => moveBlock(block.id, 'down')} disabled={idx === blocks.length - 1} title="Move down">↓</button>
                  <button className="lesson-builder__block-btn" onClick={() => duplicateBlock(block.id)} title="Duplicate">⧉</button>
                  <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => removeBlock(block.id)} title="Remove">✕</button>
                </div>
              </div>

              {/* Block Editor Content */}
              <div className="lesson-builder__block-content">
                {block.block_type === 'text' && (
                  <TipTapEditor
                    content={block.content.html || ''}
                    onChange={(html: string) => updateBlockContent(block.id, { html })}
                  />
                )}

                {block.block_type === 'image' && (
                  <div className="lesson-builder__image-block">
                    <div
                      className={`lesson-builder__drop-zone ${dragOverBlockId === block.id ? 'lesson-builder__drop-zone--active' : ''}`}
                      onDragOver={e => handleDragOver(e, block.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, block.id, 'url')}
                      onClick={() => triggerFileUpload(block.id, 'url', 'image/*')}
                    >
                      {block.content.url ? (
                        <img src={block.content.url} alt={block.content.alt || ''} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '6px', objectFit: 'contain' }} />
                      ) : (
                        <div className="lesson-builder__drop-zone-text">
                          <span style={{ fontSize: '2rem' }}>🖼</span>
                          <p>Drag & drop an image here, or click to browse</p>
                          <p style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Or paste a URL below</p>
                        </div>
                      )}
                    </div>
                    <input className="fc-form__input" placeholder="Image URL (or upload above)" value={block.content.url?.startsWith('data:') ? '(uploaded file)' : block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Alt text (for accessibility)" value={block.content.alt || ''} onChange={e => updateBlockContent(block.id, { ...block.content, alt: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Caption (optional)" value={block.content.caption || ''} onChange={e => updateBlockContent(block.id, { ...block.content, caption: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <select className="fc-form__input" value={block.content.alignment || 'center'} onChange={e => updateBlockContent(block.id, { ...block.content, alignment: e.target.value })} style={{ marginTop: '0.5rem' }}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                )}

                {block.block_type === 'video' && (
                  <div>
                    <input className="fc-form__input" placeholder="YouTube or Vimeo URL (e.g. https://youtube.com/watch?v=...)" value={block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} />
                    <input className="fc-form__input" placeholder="Caption (optional)" value={block.content.caption || ''} onChange={e => updateBlockContent(block.id, { ...block.content, caption: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    {block.content.url && (
                      <div style={{ marginTop: '0.75rem', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                        <iframe
                          src={convertToEmbedUrl(block.content.url)}
                          style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
                          allowFullScreen
                          title="Video preview"
                        />
                      </div>
                    )}
                  </div>
                )}

                {block.block_type === 'callout' && (
                  <div>
                    <select className="fc-form__input" value={block.content.type || 'info'} onChange={e => updateBlockContent(block.id, { ...block.content, type: e.target.value })} style={{ marginBottom: '0.5rem' }}>
                      <option value="info">Info (blue accent)</option>
                      <option value="warning">Warning (amber)</option>
                      <option value="tip">Tip / Success (green)</option>
                      <option value="danger">Danger / Important (red)</option>
                      <option value="formula">Formula / Definition (dark)</option>
                      <option value="example">Example / Worked Problem (yellow)</option>
                      <option value="note">Note (blue left border)</option>
                      <option value="key_concept">Key Concept (blue bubble)</option>
                    </select>
                    <textarea className="fc-form__textarea" value={block.content.text || ''} onChange={e => updateBlockContent(block.id, { ...block.content, text: e.target.value })} rows={3} placeholder="Callout text... (supports basic text)" />
                    {block.content.type === 'formula' && (
                      <p style={{ fontSize: '.72rem', color: '#9CA3AF', marginTop: '.25rem' }}>Use &lt;sub&gt; for subscripts, &lt;sup&gt; for superscripts in formulas.</p>
                    )}
                    <div className={`lesson-builder__callout lesson-builder__callout--${block.content.type || 'info'}`} style={{ marginTop: '0.5rem' }}>
                      <span dangerouslySetInnerHTML={{ __html: block.content.text || 'Preview...' }} />
                    </div>
                  </div>
                )}

                {block.block_type === 'divider' && (
                  <hr style={{ border: 'none', borderTop: '2px dashed #D1D5DB', margin: '0.5rem 0' }} />
                )}

                {block.block_type === 'quiz' && (
                  <div>
                    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => showQbPicker === block.id ? setShowQbPicker(null) : fetchQuestionBank(block.id)}>
                        {showQbPicker === block.id ? 'Close' : 'Import from Question Bank'}
                      </button>
                      {block.content.source_question_id && (
                        <span style={{ fontSize: '.72rem', color: '#059669', fontWeight: 600 }}>Linked to QB #{block.content.source_question_id.slice(0, 8)}</span>
                      )}
                    </div>
                    {showQbPicker === block.id && (
                      <div className="lesson-builder__qb-picker">
                        {qbLoading && <p style={{ fontSize: '.82rem', color: '#9CA3AF', padding: '.5rem' }}>Loading questions...</p>}
                        {!qbLoading && qbQuestions.length === 0 && (
                          <p style={{ fontSize: '.82rem', color: '#9CA3AF', padding: '.5rem' }}>No multiple-choice questions found for this lesson. Add questions in the Question Bank first.</p>
                        )}
                        {qbQuestions.map((q: any) => (
                          <button key={q.id} className="lesson-builder__qb-question" onClick={() => importQuestion(block.id, q)}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#0F1419', marginBottom: '.2rem' }}>{q.question_text}</div>
                              <div style={{ fontSize: '.72rem', color: '#6B7280' }}>{q.question_type} &middot; {q.difficulty} &middot; {(q.options || []).length} options</div>
                            </div>
                            <span style={{ fontSize: '.72rem', color: '#1D3095', fontWeight: 600, flexShrink: 0 }}>Import</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <input className="fc-form__input" placeholder="Question" value={block.content.question || ''} onChange={e => updateBlockContent(block.id, { ...block.content, question: e.target.value })} />
                    <div style={{ marginTop: '0.5rem' }}>
                      {(block.content.options || []).map((opt: string, oi: number) => (
                        <div key={oi} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                          <input
                            type="radio"
                            name={`quiz-${block.id}`}
                            checked={block.content.correct === oi}
                            onChange={() => updateBlockContent(block.id, { ...block.content, correct: oi })}
                          />
                          <input className="fc-form__input" value={opt} onChange={e => {
                            const opts = [...(block.content.options || [])];
                            opts[oi] = e.target.value;
                            updateBlockContent(block.id, { ...block.content, options: opts });
                          }} placeholder={`Option ${oi + 1}`} style={{ flex: 1 }} />
                          {(block.content.options || []).length > 2 && (
                            <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                              const opts = (block.content.options || []).filter((_: any, i: number) => i !== oi);
                              const correct = block.content.correct >= opts.length ? opts.length - 1 : block.content.correct;
                              updateBlockContent(block.id, { ...block.content, options: opts, correct });
                            }}>✕</button>
                          )}
                        </div>
                      ))}
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                        const opts = [...(block.content.options || []), ''];
                        updateBlockContent(block.id, { ...block.content, options: opts });
                      }}>+ Add Option</button>
                    </div>
                    <textarea className="fc-form__textarea" placeholder="Explanation (shown after answer)" value={block.content.explanation || ''} onChange={e => updateBlockContent(block.id, { ...block.content, explanation: e.target.value })} rows={2} style={{ marginTop: '0.5rem' }} />
                  </div>
                )}

                {block.block_type === 'embed' && (
                  <div>
                    <input className="fc-form__input" placeholder="Embed URL" value={block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} />
                    <input className="fc-form__input" type="number" placeholder="Height (px)" value={block.content.height || 400} onChange={e => updateBlockContent(block.id, { ...block.content, height: parseInt(e.target.value) || 400 })} style={{ marginTop: '0.5rem', maxWidth: '150px' }} />
                    {block.content.url && (
                      <iframe src={block.content.url} style={{ width: '100%', height: `${block.content.height || 400}px`, border: '1px solid #E5E7EB', borderRadius: '8px', marginTop: '0.75rem' }} title="Embed preview" />
                    )}
                  </div>
                )}

                {block.block_type === 'table' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {(block.content.headers || []).map((h: string, hi: number) => (
                            <th key={hi} style={{ padding: '0.4rem', border: '1px solid #E5E7EB' }}>
                              <input className="fc-form__input" value={h} onChange={e => {
                                const headers = [...(block.content.headers || [])];
                                headers[hi] = e.target.value;
                                updateBlockContent(block.id, { ...block.content, headers });
                              }} style={{ fontWeight: 600 }} />
                            </th>
                          ))}
                          <th style={{ width: '40px' }}>
                            <button className="lesson-builder__block-btn" onClick={() => {
                              const headers = [...(block.content.headers || []), `Col ${(block.content.headers || []).length + 1}`];
                              const rows = (block.content.rows || []).map((r: string[]) => [...r, '']);
                              updateBlockContent(block.id, { ...block.content, headers, rows });
                            }}>+</button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(block.content.rows || []).map((row: string[], ri: number) => (
                          <tr key={ri}>
                            {row.map((cell: string, ci: number) => (
                              <td key={ci} style={{ padding: '0.4rem', border: '1px solid #E5E7EB' }}>
                                <input className="fc-form__input" value={cell} onChange={e => {
                                  const rows = [...(block.content.rows || [])];
                                  rows[ri] = [...rows[ri]];
                                  rows[ri][ci] = e.target.value;
                                  updateBlockContent(block.id, { ...block.content, rows });
                                }} />
                              </td>
                            ))}
                            <td style={{ width: '40px' }}>
                              <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                                const rows = (block.content.rows || []).filter((_: any, i: number) => i !== ri);
                                updateBlockContent(block.id, { ...block.content, rows });
                              }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ marginTop: '0.5rem' }} onClick={() => {
                      const colCount = (block.content.headers || []).length;
                      const rows = [...(block.content.rows || []), new Array(colCount).fill('')];
                      updateBlockContent(block.id, { ...block.content, rows });
                    }}>+ Add Row</button>
                  </div>
                )}

                {block.block_type === 'file' && (
                  <div>
                    <div
                      className={`lesson-builder__drop-zone ${dragOverBlockId === block.id ? 'lesson-builder__drop-zone--active' : ''}`}
                      onDragOver={e => handleDragOver(e, block.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverBlockId(null);
                        const files = e.dataTransfer.files;
                        if (!files || files.length === 0) return;
                        const file = files[0];
                        const reader = new FileReader();
                        reader.onload = () => {
                          updateBlockContent(block.id, { ...block.content, url: reader.result as string, name: file.name, size: file.size, type: file.type });
                        };
                        reader.readAsDataURL(file);
                      }}
                      onClick={() => triggerFileUpload(block.id, 'file', '*/*')}
                      style={{ minHeight: '80px' }}
                    >
                      {block.content.url ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📎</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{block.content.name || 'Uploaded file'}</div>
                            {block.content.size > 0 && <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{formatFileSize(block.content.size)}</div>}
                          </div>
                        </div>
                      ) : (
                        <div className="lesson-builder__drop-zone-text">
                          <span style={{ fontSize: '2rem' }}>📎</span>
                          <p>Drag & drop a file here, or click to browse</p>
                        </div>
                      )}
                    </div>
                    <input className="fc-form__input" placeholder="Or enter file URL" value={block.content.url?.startsWith('data:') ? '(uploaded file)' : block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} style={{ marginTop: '0.5rem' }} />
                    <input className="fc-form__input" placeholder="Display name" value={block.content.name || ''} onChange={e => updateBlockContent(block.id, { ...block.content, name: e.target.value })} style={{ marginTop: '0.5rem' }} />
                  </div>
                )}

                {block.block_type === 'slideshow' && (
                  <div>
                    <div className="lesson-builder__slideshow-images">
                      {(block.content.images || []).map((img: any, ii: number) => (
                        <div key={ii} className="lesson-builder__slideshow-item">
                          <div className="lesson-builder__slideshow-thumb">
                            {img.url ? (
                              <img src={img.url} alt={img.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                            ) : (
                              <div
                                className={`lesson-builder__drop-zone ${dragOverBlockId === `${block.id}-${ii}` ? 'lesson-builder__drop-zone--active' : ''}`}
                                onDragOver={e => { e.preventDefault(); setDragOverBlockId(`${block.id}-${ii}`); }}
                                onDragLeave={handleDragLeave}
                                onDrop={e => {
                                  e.preventDefault();
                                  setDragOverBlockId(null);
                                  const files = e.dataTransfer.files;
                                  if (!files || files.length === 0) return;
                                  const file = files[0];
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const images = [...(block.content.images || [])];
                                    images[ii] = { ...images[ii], url: reader.result as string, alt: file.name };
                                    updateBlockContent(block.id, { ...block.content, images });
                                  };
                                  reader.readAsDataURL(file);
                                }}
                                onClick={() => {
                                  setFileUploadTarget({ blockId: block.id, field: `slideshow-${ii}` });
                                  if (fileInputRef.current) {
                                    fileInputRef.current.accept = 'image/*';
                                    fileInputRef.current.click();
                                  }
                                }}
                                style={{ width: '100%', height: '100%', minHeight: '80px' }}
                              >
                                <div className="lesson-builder__drop-zone-text" style={{ padding: '0.5rem' }}>
                                  <span>🖼</span>
                                  <p style={{ fontSize: '0.72rem' }}>Drop image</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <input className="fc-form__input" placeholder={`Slide ${ii + 1} URL`} value={img.url?.startsWith('data:') ? '(uploaded)' : img.url || ''} onChange={e => {
                            const images = [...(block.content.images || [])];
                            images[ii] = { ...images[ii], url: e.target.value };
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ fontSize: '0.78rem' }} />
                          <input className="fc-form__input" placeholder="Caption" value={img.caption || ''} onChange={e => {
                            const images = [...(block.content.images || [])];
                            images[ii] = { ...images[ii], caption: e.target.value };
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ fontSize: '0.78rem' }} />
                          <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                            const images = (block.content.images || []).filter((_: any, i: number) => i !== ii);
                            updateBlockContent(block.id, { ...block.content, images });
                          }} style={{ alignSelf: 'flex-start' }}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                        const images = [...(block.content.images || []), { url: '', alt: '', caption: '' }];
                        updateBlockContent(block.id, { ...block.content, images });
                      }}>+ Add Slide (URL)</button>
                      <button className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => triggerFileUpload(block.id, 'slideshow-add', 'image/*')}>
                        + Upload Image
                      </button>
                    </div>
                  </div>
                )}

                {/* HTML Block */}
                {block.block_type === 'html' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#6B7280' }}>Raw HTML</span>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => updateBlockContent(block.id, { ...block.content, showPreview: !block.content.showPreview })}>
                        {block.content.showPreview ? 'Edit' : 'Preview'}
                      </button>
                    </div>
                    {block.content.showPreview ? (
                      <div className="lesson-builder__html-preview" dangerouslySetInnerHTML={{ __html: block.content.code || '' }} />
                    ) : (
                      <textarea
                        className="fc-form__textarea"
                        value={block.content.code || ''}
                        onChange={e => updateBlockContent(block.id, { ...block.content, code: e.target.value })}
                        rows={12}
                        style={{ fontFamily: 'monospace', fontSize: '.82rem', whiteSpace: 'pre', tabSize: 2 }}
                        placeholder="<div>Your HTML code here...</div>"
                      />
                    )}
                  </div>
                )}

                {/* Audio Block */}
                {block.block_type === 'audio' && (
                  <div>
                    <input className="fc-form__input" placeholder="Audio URL (MP3, WAV, or external link)" value={block.content.url || ''} onChange={e => updateBlockContent(block.id, { ...block.content, url: e.target.value })} />
                    <input className="fc-form__input" placeholder="Title (optional)" value={block.content.title || ''} onChange={e => updateBlockContent(block.id, { ...block.content, title: e.target.value })} style={{ marginTop: '.5rem' }} />
                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => triggerFileUpload(block.id, 'url', 'audio/*')}>Upload Audio File</button>
                    </div>
                    {block.content.url && (
                      <div style={{ marginTop: '.75rem' }}>
                        <audio controls src={block.content.url} style={{ width: '100%' }}>Your browser does not support audio.</audio>
                      </div>
                    )}
                  </div>
                )}

                {/* Link / Reference Block */}
                {block.block_type === 'link_reference' && (
                  <div>
                    {(block.content.links || []).map((link: any, li: number) => (
                      <div key={li} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', marginBottom: '.5rem', padding: '.5rem', background: '#F9FAFB', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                          <input className="fc-form__input" placeholder="Link title" value={link.title || ''} onChange={e => {
                            const links = [...(block.content.links || [])];
                            links[li] = { ...links[li], title: e.target.value };
                            updateBlockContent(block.id, { ...block.content, links });
                          }} />
                          <input className="fc-form__input" placeholder="URL" value={link.url || ''} onChange={e => {
                            const links = [...(block.content.links || [])];
                            links[li] = { ...links[li], url: e.target.value };
                            updateBlockContent(block.id, { ...block.content, links });
                          }} />
                          <div style={{ display: 'flex', gap: '.5rem' }}>
                            <select className="fc-form__input" value={link.type || 'reference'} onChange={e => {
                              const links = [...(block.content.links || [])];
                              links[li] = { ...links[li], type: e.target.value };
                              updateBlockContent(block.id, { ...block.content, links });
                            }} style={{ flex: '0 0 140px' }}>
                              <option value="reference">Reference</option>
                              <option value="website">Website</option>
                              <option value="pdf">PDF</option>
                              <option value="article">Article</option>
                              <option value="practice">Practice</option>
                              <option value="quiz">Quiz</option>
                              <option value="lesson">Lesson Link</option>
                              <option value="module">Module Link</option>
                            </select>
                            <input className="fc-form__input" placeholder="Description (optional)" value={link.description || ''} onChange={e => {
                              const links = [...(block.content.links || [])];
                              links[li] = { ...links[li], description: e.target.value };
                              updateBlockContent(block.id, { ...block.content, links });
                            }} style={{ flex: 1 }} />
                          </div>
                        </div>
                        <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                          const links = (block.content.links || []).filter((_: any, i: number) => i !== li);
                          updateBlockContent(block.id, { ...block.content, links });
                        }}>✕</button>
                      </div>
                    ))}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      const links = [...(block.content.links || []), { title: '', url: '', type: 'reference', description: '' }];
                      updateBlockContent(block.id, { ...block.content, links });
                    }}>+ Add Link</button>
                  </div>
                )}

                {/* Flashcard Block */}
                {block.block_type === 'flashcard' && (
                  <div>
                    <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '.5rem', display: 'block' }}>Flashcard Deck ({(block.content.cards || []).length} cards)</span>
                    {(block.content.cards || []).map((card: any, ci: number) => (
                      <div key={ci} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', marginBottom: '.5rem', padding: '.5rem', background: '#F9FAFB', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '.72rem', fontWeight: 600, color: '#1D3095', minWidth: '40px' }}>Front</span>
                            <input className="fc-form__input" placeholder="Term or question" value={card.front || ''} onChange={e => {
                              const cards = [...(block.content.cards || [])];
                              cards[ci] = { ...cards[ci], front: e.target.value };
                              updateBlockContent(block.id, { ...block.content, cards });
                            }} />
                          </div>
                          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '.72rem', fontWeight: 600, color: '#059669', minWidth: '40px' }}>Back</span>
                            <input className="fc-form__input" placeholder="Definition or answer" value={card.back || ''} onChange={e => {
                              const cards = [...(block.content.cards || [])];
                              cards[ci] = { ...cards[ci], back: e.target.value };
                              updateBlockContent(block.id, { ...block.content, cards });
                            }} />
                          </div>
                        </div>
                        {(block.content.cards || []).length > 1 && (
                          <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                            const cards = (block.content.cards || []).filter((_: any, i: number) => i !== ci);
                            updateBlockContent(block.id, { ...block.content, cards });
                          }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      const cards = [...(block.content.cards || []), { front: '', back: '' }];
                      updateBlockContent(block.id, { ...block.content, cards });
                    }}>+ Add Card</button>
                  </div>
                )}

                {/* Popup Article Block */}
                {block.block_type === 'popup_article' && (
                  <div>
                    <input className="fc-form__input" placeholder="Article title" value={block.content.title || ''} onChange={e => updateBlockContent(block.id, { ...block.content, title: e.target.value })} />
                    <textarea className="fc-form__textarea" placeholder="Summary text (shown collapsed)" value={block.content.summary || ''} onChange={e => updateBlockContent(block.id, { ...block.content, summary: e.target.value })} rows={2} style={{ marginTop: '.5rem' }} />
                    <div style={{ marginTop: '.5rem' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: '.35rem' }}>Full Content (HTML supported)</span>
                      <textarea
                        className="fc-form__textarea"
                        value={block.content.full_content || ''}
                        onChange={e => updateBlockContent(block.id, { ...block.content, full_content: e.target.value })}
                        rows={8}
                        style={{ fontFamily: 'monospace', fontSize: '.82rem' }}
                        placeholder="<p>Full article content here...</p>"
                      />
                    </div>
                  </div>
                )}

                {/* Backend Link Block */}
                {block.block_type === 'backend_link' && (
                  <div>
                    <input className="fc-form__input" placeholder="Page path (e.g. /admin/learn/modules/...)" value={block.content.path || ''} onChange={e => updateBlockContent(block.id, { ...block.content, path: e.target.value })} />
                    <input className="fc-form__input" placeholder="Link title" value={block.content.title || ''} onChange={e => updateBlockContent(block.id, { ...block.content, title: e.target.value })} style={{ marginTop: '.5rem' }} />
                    <input className="fc-form__input" placeholder="Description" value={block.content.description || ''} onChange={e => updateBlockContent(block.id, { ...block.content, description: e.target.value })} style={{ marginTop: '.5rem' }} />
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.5rem' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#6B7280' }}>Icon:</span>
                      {['📖', '📝', '🎯', '📊', '🏠', '⚙', '🔬', '📐'].map(emoji => (
                        <button key={emoji} className={`admin-btn admin-btn--ghost admin-btn--sm ${block.content.icon === emoji ? 'admin-btn--active' : ''}`}
                          onClick={() => updateBlockContent(block.id, { ...block.content, icon: emoji })}
                          style={{ padding: '.2rem .4rem', fontSize: '1.1rem', border: block.content.icon === emoji ? '2px solid #1D3095' : undefined }}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {/* Preview */}
                    <div className="block-backend-link" style={{ marginTop: '.75rem' }}>
                      <span className="block-backend-link__icon">{block.content.icon || '📖'}</span>
                      <div className="block-backend-link__info">
                        <span className="block-backend-link__title">{block.content.title || 'Page Title'}</span>
                        {block.content.description && <span className="block-backend-link__desc">{block.content.description}</span>}
                      </div>
                      <span className="block-backend-link__arrow">→</span>
                    </div>
                  </div>
                )}

                {/* Highlight / Key Term Block */}
                {block.block_type === 'highlight' && (
                  <div>
                    <select className="fc-form__input" value={block.content.style || 'blue'} onChange={e => updateBlockContent(block.id, { ...block.content, style: e.target.value })} style={{ marginBottom: '.5rem' }}>
                      <option value="blue">Blue Bubble</option>
                      <option value="dark">Dark / Formula</option>
                      <option value="green">Green / Success</option>
                      <option value="amber">Amber / Highlight</option>
                      <option value="red">Red / Important</option>
                      <option value="purple">Purple / Definition</option>
                    </select>
                    <textarea className="fc-form__textarea" value={block.content.text || ''} onChange={e => updateBlockContent(block.id, { ...block.content, text: e.target.value })} rows={2} placeholder="Key term, formula, or important concept... (HTML supported for sub/sup)" />
                    <div className={`block-highlight block-highlight--${block.content.style || 'blue'}`} style={{ marginTop: '.5rem' }}>
                      <span dangerouslySetInnerHTML={{ __html: block.content.text || 'Preview...' }} />
                    </div>
                  </div>
                )}

                {/* Key Takeaways Block */}
                {block.block_type === 'key_takeaways' && (
                  <div>
                    <input className="fc-form__input" placeholder="Section title" value={block.content.title || ''} onChange={e => updateBlockContent(block.id, { ...block.content, title: e.target.value })} style={{ marginBottom: '.5rem' }} />
                    {(block.content.items || []).map((item: string, ii: number) => (
                      <div key={ii} style={{ display: 'flex', gap: '.5rem', marginBottom: '.35rem', alignItems: 'center' }}>
                        <span style={{ color: '#10B981', fontSize: '.9rem', flexShrink: 0 }}>&#x2713;</span>
                        <input className="fc-form__input" value={item} onChange={e => {
                          const items = [...(block.content.items || [])];
                          items[ii] = e.target.value;
                          updateBlockContent(block.id, { ...block.content, items });
                        }} placeholder={`Takeaway ${ii + 1}`} style={{ flex: 1 }} />
                        {(block.content.items || []).length > 1 && (
                          <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                            const items = (block.content.items || []).filter((_: any, i: number) => i !== ii);
                            updateBlockContent(block.id, { ...block.content, items });
                          }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      const items = [...(block.content.items || []), ''];
                      updateBlockContent(block.id, { ...block.content, items });
                    }}>+ Add Takeaway</button>
                  </div>
                )}

                {block.block_type === 'equation' && (
                  <div>
                    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                      <select className="fc-form__select" value={block.content.display || 'block'} onChange={e => updateBlockContent(block.id, { ...block.content, display: e.target.value })} style={{ width: 'auto' }}>
                        <option value="block">Block (centered)</option>
                        <option value="inline">Inline</option>
                      </select>
                      <input className="fc-form__input" placeholder="Label (e.g. Equation 1)" value={block.content.label || ''} onChange={e => updateBlockContent(block.id, { ...block.content, label: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <textarea className="fc-form__textarea lesson-builder__equation-input" placeholder="LaTeX: e.g. E = mc^2  or  \frac{a}{b}" value={block.content.latex || ''} onChange={e => updateBlockContent(block.id, { ...block.content, latex: e.target.value })} rows={3} spellCheck={false} />
                    {block.content.latex && (
                      <div className="lesson-builder__equation-preview">
                        <span style={{ fontSize: '.68rem', fontWeight: 600, color: '#6B7280', marginBottom: '.25rem', display: 'block' }}>Preview</span>
                        <div className="lesson-builder__equation-rendered" dangerouslySetInnerHTML={{ __html: renderLatex(block.content.latex || '') }} />
                      </div>
                    )}
                  </div>
                )}

                {block.block_type === 'tabs' && (
                  <div>
                    {(block.content.tabs || []).map((tab: any, ti: number) => (
                      <div key={ti} className="lesson-builder__container-section">
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.35rem' }}>
                          <input className="fc-form__input" value={tab.title || ''} onChange={e => {
                            const tabs = [...(block.content.tabs || [])];
                            tabs[ti] = { ...tabs[ti], title: e.target.value };
                            updateBlockContent(block.id, { ...block.content, tabs });
                          }} placeholder={`Tab ${ti + 1} title`} style={{ flex: 1, fontWeight: 600 }} />
                          {(block.content.tabs || []).length > 1 && (
                            <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                              const tabs = (block.content.tabs || []).filter((_: any, i: number) => i !== ti);
                              updateBlockContent(block.id, { ...block.content, tabs });
                            }}>✕</button>
                          )}
                        </div>
                        <textarea className="fc-form__textarea" value={tab.content || ''} onChange={e => {
                          const tabs = [...(block.content.tabs || [])];
                          tabs[ti] = { ...tabs[ti], content: e.target.value };
                          updateBlockContent(block.id, { ...block.content, tabs });
                        }} placeholder="Tab content (HTML supported)" rows={3} />
                      </div>
                    ))}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      const tabs = [...(block.content.tabs || []), { title: `Tab ${(block.content.tabs || []).length + 1}`, content: '' }];
                      updateBlockContent(block.id, { ...block.content, tabs });
                    }}>+ Add Tab</button>
                  </div>
                )}

                {block.block_type === 'accordion' && (
                  <div>
                    {(block.content.sections || []).map((sec: any, si: number) => (
                      <div key={si} className="lesson-builder__container-section">
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.35rem' }}>
                          <label style={{ fontSize: '.75rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '.25rem', flexShrink: 0 }}>
                            <input type="checkbox" checked={sec.open || false} onChange={e => {
                              const sections = [...(block.content.sections || [])];
                              sections[si] = { ...sections[si], open: e.target.checked };
                              updateBlockContent(block.id, { ...block.content, sections });
                            }} /> Open
                          </label>
                          <input className="fc-form__input" value={sec.title || ''} onChange={e => {
                            const sections = [...(block.content.sections || [])];
                            sections[si] = { ...sections[si], title: e.target.value };
                            updateBlockContent(block.id, { ...block.content, sections });
                          }} placeholder={`Section ${si + 1} title`} style={{ flex: 1, fontWeight: 600 }} />
                          {(block.content.sections || []).length > 1 && (
                            <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => {
                              const sections = (block.content.sections || []).filter((_: any, i: number) => i !== si);
                              updateBlockContent(block.id, { ...block.content, sections });
                            }}>✕</button>
                          )}
                        </div>
                        <textarea className="fc-form__textarea" value={sec.content || ''} onChange={e => {
                          const sections = [...(block.content.sections || [])];
                          sections[si] = { ...sections[si], content: e.target.value };
                          updateBlockContent(block.id, { ...block.content, sections });
                        }} placeholder="Section content (HTML supported)" rows={3} />
                      </div>
                    ))}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => {
                      const sections = [...(block.content.sections || []), { title: `Section ${(block.content.sections || []).length + 1}`, content: '', open: false }];
                      updateBlockContent(block.id, { ...block.content, sections });
                    }}>+ Add Section</button>
                  </div>
                )}

                {block.block_type === 'columns' && (
                  <div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.65rem' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151' }}>Columns:</span>
                      {[2, 3].map(n => (
                        <button key={n} className={`admin-btn admin-btn--sm ${(block.content.columnCount || 2) === n ? 'admin-btn--primary' : 'admin-btn--ghost'}`} onClick={() => {
                          const cols = [...(block.content.columns || [])];
                          while (cols.length < n) cols.push({ html: '' });
                          updateBlockContent(block.id, { ...block.content, columnCount: n, columns: cols.slice(0, n) });
                        }}>{n}</button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.content.columnCount || 2}, 1fr)`, gap: '.65rem' }}>
                      {(block.content.columns || []).map((col: any, ci: number) => (
                        <textarea key={ci} className="fc-form__textarea" value={col.html || ''} onChange={e => {
                          const columns = [...(block.content.columns || [])];
                          columns[ci] = { ...columns[ci], html: e.target.value };
                          updateBlockContent(block.id, { ...block.content, columns });
                        }} placeholder={`Column ${ci + 1} (HTML supported)`} rows={4} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Block Style Panel */}
              {showStylePanel === block.id && (
                <div className="lesson-builder__style-panel">
                  <div className="lesson-builder__style-panel-header">
                    <span style={{ fontWeight: 600, fontSize: '.82rem' }}>Block Styling</span>
                    <button className="lesson-builder__block-btn" onClick={() => setShowStylePanel(null)}>✕</button>
                  </div>
                  <div className="lesson-builder__style-panel-body">
                    <div className="lesson-builder__style-row">
                      <label>Width</label>
                      <select className="fc-form__input" value={block.style?.width || 'full'} onChange={e => updateBlockStyle(block.id, { width: e.target.value as BlockStyle['width'] })}>
                        <option value="full">Full width</option>
                        <option value="wide">Wide (80%)</option>
                        <option value="half">Half (50%)</option>
                        <option value="third">Third (33%)</option>
                      </select>
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>Background</label>
                      <input type="color" value={block.style?.backgroundColor || '#ffffff'} onChange={e => updateBlockStyle(block.id, { backgroundColor: e.target.value })} style={{ width: '40px', height: '30px', border: 'none', cursor: 'pointer' }} />
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => updateBlockStyle(block.id, { backgroundColor: undefined })} style={{ fontSize: '.68rem' }}>Clear</button>
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>Border</label>
                      <input type="color" value={block.style?.borderColor || '#e5e7eb'} onChange={e => updateBlockStyle(block.id, { borderColor: e.target.value, borderWidth: block.style?.borderWidth || 1 })} style={{ width: '40px', height: '30px', border: 'none', cursor: 'pointer' }} />
                      <input type="number" className="fc-form__input" value={block.style?.borderWidth || 0} onChange={e => updateBlockStyle(block.id, { borderWidth: parseInt(e.target.value) || 0 })} style={{ width: '60px' }} min={0} max={10} />
                      <span style={{ fontSize: '.72rem', color: '#9CA3AF' }}>px</span>
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>Radius</label>
                      <input type="number" className="fc-form__input" value={block.style?.borderRadius ?? 8} onChange={e => updateBlockStyle(block.id, { borderRadius: parseInt(e.target.value) || 0 })} style={{ width: '60px' }} min={0} max={50} />
                      <span style={{ fontSize: '.72rem', color: '#9CA3AF' }}>px</span>
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>Shadow</label>
                      <select className="fc-form__input" value={block.style?.boxShadow || 'none'} onChange={e => updateBlockStyle(block.id, { boxShadow: e.target.value })}>
                        <option value="none">None</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                        <option value="xl">Extra Large</option>
                      </select>
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>
                        <input type="checkbox" checked={block.style?.collapsible || false} onChange={e => updateBlockStyle(block.id, { collapsible: e.target.checked })} /> Collapsible
                      </label>
                      {block.style?.collapsible && (
                        <input className="fc-form__input" placeholder="Collapsed label" value={block.style?.collapsedLabel || ''} onChange={e => updateBlockStyle(block.id, { collapsedLabel: e.target.value })} style={{ flex: 1 }} />
                      )}
                    </div>
                    <div className="lesson-builder__style-row">
                      <label>
                        <input type="checkbox" checked={block.style?.hidden || false} onChange={e => updateBlockStyle(block.id, { hidden: e.target.checked })} /> Hidden until clicked
                      </label>
                      {block.style?.hidden && (
                        <input className="fc-form__input" placeholder="Reveal button label" value={block.style?.hiddenLabel || ''} onChange={e => updateBlockStyle(block.id, { hiddenLabel: e.target.value })} style={{ flex: 1 }} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Insert point between blocks */}
              <div className="lesson-builder__insert-point">
                <button className="lesson-builder__insert-btn" onClick={() => { setInsertIdx(idx + 1); setShowBlockPicker(true); }}>
                  + Add Block
                </button>
              </div>
            </div>
            {/* Trailing drop indicator for last block */}
            {dragBlockId && dragBlockId !== block.id && idx === blocks.length - 1 && (
              <div
                className={`lesson-builder__drop-indicator ${dragOverIdx === blocks.length ? 'lesson-builder__drop-indicator--active' : ''}`}
                onDragOver={e => onBlockDragOver(e, blocks.length)}
                onDrop={e => onBlockDrop(e, blocks.length)}
              />
            )}
            </div>
          ))}
        </div>
      )}

      {/* Block Picker Modal */}
      {showBlockPicker && (
        <div className="admin-modal-overlay" onClick={() => { setShowBlockPicker(false); setBlockPickerSearch(''); setBlockPickerTab('blocks'); }}>
          <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Add Content Block</h3>
              <button className="admin-modal__close" onClick={() => { setShowBlockPicker(false); setBlockPickerSearch(''); setBlockPickerTab('blocks'); }}>✕</button>
            </div>
            {/* Tabs: Blocks | Templates */}
            <div className="lesson-builder__picker-tabs">
              <button className={`lesson-builder__picker-tab ${blockPickerTab === 'blocks' ? 'lesson-builder__picker-tab--active' : ''}`} onClick={() => setBlockPickerTab('blocks')}>Blocks</button>
              <button className={`lesson-builder__picker-tab ${blockPickerTab === 'templates' ? 'lesson-builder__picker-tab--active' : ''}`} onClick={() => { setBlockPickerTab('templates'); loadTemplates(); }}>Templates</button>
            </div>
            <div className="admin-modal__body">
              {blockPickerTab === 'blocks' && (
                <>
                  <input className="fc-form__input lesson-builder__picker-search" placeholder="Search blocks..." value={blockPickerSearch} onChange={e => setBlockPickerSearch(e.target.value)} autoFocus />
                  {['Content', 'Media', 'Layout', 'Interactive'].map(group => {
                    const search = blockPickerSearch.toLowerCase();
                    const groupTypes = BLOCK_TYPES.filter(bt => bt.group === group && (!search || bt.label.toLowerCase().includes(search) || bt.description.toLowerCase().includes(search) || bt.type.includes(search)));
                    if (groupTypes.length === 0) return null;
                    return (
                      <div key={group} style={{ marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '.78rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '.5rem' }}>{group}</h4>
                        <div className="lesson-builder__block-picker">
                          {groupTypes.map((bt) => (
                            <button key={bt.type} className="lesson-builder__block-option" onClick={() => { addBlock(bt.type); setBlockPickerSearch(''); }}>
                              <span className="lesson-builder__block-option-icon">{bt.icon}</span>
                              <div>
                                <div className="lesson-builder__block-option-label">{bt.label}</div>
                                <div className="lesson-builder__block-option-desc">{bt.description}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {blockPickerSearch && BLOCK_TYPES.filter(bt => { const s = blockPickerSearch.toLowerCase(); return bt.label.toLowerCase().includes(s) || bt.description.toLowerCase().includes(s) || bt.type.includes(s); }).length === 0 && (
                    <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '.85rem', padding: '1rem 0' }}>No blocks match &ldquo;{blockPickerSearch}&rdquo;</p>
                  )}
                </>
              )}
              {blockPickerTab === 'templates' && (
                <div>
                  {templatesLoading && <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>Loading templates...</p>}
                  {!templatesLoading && savedTemplates.length === 0 && (
                    <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>No templates yet. Save blocks as a template to reuse them!</p>
                  )}
                  {['content', 'interactive', 'layout', 'assessment', 'custom'].map(cat => {
                    const catTemplates = savedTemplates.filter(t => t.category === cat);
                    if (catTemplates.length === 0) return null;
                    return (
                      <div key={cat} style={{ marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '.78rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '.5rem' }}>{cat}</h4>
                        {catTemplates.map((t: any) => (
                          <div key={t.id} className="lesson-builder__template-item">
                            <button className="lesson-builder__template-btn" onClick={() => insertTemplate(t)}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#0F1419' }}>{t.name} {t.is_builtin && <span style={{ fontSize: '.6rem', background: '#DBEAFE', color: '#1E40AF', padding: '.1rem .3rem', borderRadius: '3px', marginLeft: '.25rem' }}>BUILT-IN</span>}</div>
                                <div style={{ fontSize: '.72rem', color: '#6B7280' }}>{t.description || `${(t.blocks || []).length} block${(t.blocks || []).length !== 1 ? 's' : ''}`}</div>
                              </div>
                            </button>
                            {!t.is_builtin && (
                              <button className="lesson-builder__block-btn lesson-builder__block-btn--danger" onClick={() => deleteTemplate(t.id)} title="Delete template" style={{ flexShrink: 0 }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplate && (
        <div className="admin-modal-overlay" onClick={() => setShowSaveTemplate(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="admin-modal__header">
              <h3 className="admin-modal__title">Save as Template</h3>
              <button className="admin-modal__close" onClick={() => setShowSaveTemplate(false)}>✕</button>
            </div>
            <div className="admin-modal__body">
              <p style={{ fontSize: '.82rem', color: '#6B7280', marginBottom: '.75rem' }}>
                {selectedBlockId ? 'Save the selected block as a reusable template.' : `Save all ${blocks.length} blocks as a reusable template.`}
              </p>
              <input className="fc-form__input" placeholder="Template name" value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} autoFocus style={{ marginBottom: '.5rem' }} />
              <input className="fc-form__input" placeholder="Description (optional)" value={saveTemplateDesc} onChange={e => setSaveTemplateDesc(e.target.value)} style={{ marginBottom: '.5rem' }} />
              <select className="fc-form__select" value={saveTemplateCat} onChange={e => setSaveTemplateCat(e.target.value)} style={{ marginBottom: '.75rem' }}>
                <option value="custom">Custom</option>
                <option value="content">Content</option>
                <option value="interactive">Interactive</option>
                <option value="layout">Layout</option>
                <option value="assessment">Assessment</option>
              </select>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button className="admin-btn admin-btn--ghost" onClick={() => setShowSaveTemplate(false)}>Cancel</button>
                <button className="admin-btn admin-btn--primary" onClick={saveAsTemplate} disabled={!saveTemplateName.trim()}>Save Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Linked Content Panel */}
      {showLinkedPanel && (
        <div className="lesson-builder__linked-panel">
          <div className="lesson-builder__linked-header">
            <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.92rem', fontWeight: 700, color: '#1D3095', margin: 0 }}>Linked Content</h3>
            <button className="lesson-builder__block-btn" onClick={() => setShowLinkedPanel(false)}>{'\u2715'}</button>
          </div>
          <div className="lesson-builder__linked-body">
            {/* Module reference */}
            {lesson?.module_id && (
              <div className="lesson-builder__linked-section">
                <h4 className="lesson-builder__linked-section-title">Parent Module</h4>
                <Link href={`/admin/learn/modules/${lesson.module_id}`} className="lesson-builder__linked-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 600, color: '#1D3095' }}>{'\u{1F4DA}'} View Module</span>
                  <span style={{ fontSize: '.72rem', color: '#6B7280' }}>{'\u2192'}</span>
                </Link>
              </div>
            )}

            {/* Questions */}
            <div className="lesson-builder__linked-section">
              <h4 className="lesson-builder__linked-section-title">{'\u2753'} Questions ({linkedContent.questions.length})</h4>
              {linkedContent.questions.length === 0 && <p className="lesson-builder__linked-empty">No questions linked to this lesson.</p>}
              {linkedContent.questions.map((q: any) => (
                <div key={q.id} className="lesson-builder__linked-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0F1419' }}>{(q.question_text || '').slice(0, 80)}{(q.question_text || '').length > 80 ? '...' : ''}</div>
                    <div style={{ fontSize: '.68rem', color: '#6B7280' }}>
                      <span className="manage__qtype-badge">{(q.question_type || '').replace('_', ' ')}</span>
                      <span className={`manage__diff-badge manage__diff-badge--${q.difficulty}`}>{q.difficulty}</span>
                    </div>
                  </div>
                  <Link href="/admin/learn/manage/question-builder" style={{ fontSize: '.72rem', color: '#0891B2', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
                </div>
              ))}
              <Link href="/admin/learn/manage/question-builder" style={{ display: 'block', fontSize: '.72rem', color: '#1D3095', textDecoration: 'none', textAlign: 'center', padding: '.35rem', marginTop: '.25rem' }}>
                + Add Question
              </Link>
            </div>

            {/* Flashcards */}
            <div className="lesson-builder__linked-section">
              <h4 className="lesson-builder__linked-section-title">{'\u{1F0CF}'} Flashcards ({linkedContent.flashcards.length})</h4>
              {linkedContent.flashcards.length === 0 && <p className="lesson-builder__linked-empty">No flashcards linked to this lesson.</p>}
              {linkedContent.flashcards.map((fc: any) => (
                <div key={fc.id} className="lesson-builder__linked-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0F1419' }}>{fc.term}</div>
                    <div style={{ fontSize: '.68rem', color: '#6B7280' }}>{(fc.definition || '').slice(0, 60)}</div>
                  </div>
                  <Link href="/admin/learn/flashcard-bank" style={{ fontSize: '.72rem', color: '#D97706', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
                </div>
              ))}
              <Link href="/admin/learn/flashcard-bank" style={{ display: 'block', fontSize: '.72rem', color: '#1D3095', textDecoration: 'none', textAlign: 'center', padding: '.35rem', marginTop: '.25rem' }}>
                + Add Flashcard
              </Link>
            </div>

            {/* Articles */}
            <div className="lesson-builder__linked-section">
              <h4 className="lesson-builder__linked-section-title">{'\u{1F4F0}'} Articles ({linkedContent.articles.length})</h4>
              {linkedContent.articles.length === 0 && <p className="lesson-builder__linked-empty">No articles linked to this lesson.</p>}
              {linkedContent.articles.map((art: any) => (
                <div key={art.id} className="lesson-builder__linked-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0F1419' }}>{art.title}</div>
                    <div style={{ fontSize: '.68rem', color: '#6B7280' }}>{art.category || 'General'}{art.estimated_minutes ? ` \u00B7 ${art.estimated_minutes} min` : ''}</div>
                  </div>
                  <Link href={`/admin/learn/manage/article-editor/${art.id}`} style={{ fontSize: '.72rem', color: '#DC2626', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Edit</Link>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '.72rem', color: '#9CA3AF', textAlign: 'center', marginTop: '.75rem' }}>
              Lesson: {lessonId?.slice(0, 8)}
              {lesson?.module_id && <> &middot; Module: {lesson.module_id.slice(0, 8)}</>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
