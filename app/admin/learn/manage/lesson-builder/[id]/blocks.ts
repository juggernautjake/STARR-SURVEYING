// app/admin/learn/manage/lesson-builder/[id]/blocks.ts — the block catalogue and its helpers.
//
// Lifted out of page.tsx for platform audit item 18 (2,545 lines). The 23 block types, the shapes
// they store, and the four pure functions that convert between an author's input and what gets
// saved. All of it was already free of the builder's state — which is what made it the part worth
// moving first.
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight, Calculator, Code2, Columns3, ExternalLink, HelpCircle, Image as ImageIcon, Images,
  Layers, LayoutPanelTop, Lightbulb, Link2, Minus, Newspaper, Paperclip, Play, Rows3, Sigma,
  Sparkles, Table, Target, Type, Volume2,
} from 'lucide-react';
import { renderMath } from '@/lib/learn/math';

export type BlockType = 'text' | 'image' | 'video' | 'callout' | 'divider' | 'quiz' | 'embed' | 'table' | 'file' | 'slideshow' | 'html' | 'audio' | 'link_reference' | 'flashcard' | 'popup_article' | 'backend_link' | 'highlight' | 'key_takeaways' | 'equation' | 'tabs' | 'accordion' | 'columns' | 'practice_problem';

export interface BlockStyle {
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
  rowGroup?: string; // blocks with same rowGroup render side-by-side (1-4 per row)
}

export interface LessonBlock {
  id: string;
  block_type: BlockType;
  content: Record<string, any>;
  order_index: number;
  style?: BlockStyle;
}

export interface LessonMeta {
  id: string;
  title: string;
  status: string;
  module_id: string;
  estimated_minutes: number;
  content?: string; // Legacy HTML content for seeded lessons
}

export const BLOCK_TYPES: { type: BlockType; label: string; Icon: LucideIcon; description: string; group?: string }[] = [
  { type: 'text', label: 'Text', Icon: Type, description: 'Rich text with formatting', group: 'Content' },
  { type: 'html', label: 'HTML', Icon: Code2, description: 'Raw HTML code block', group: 'Content' },
  { type: 'image', label: 'Image', Icon: ImageIcon, description: 'Upload or link an image', group: 'Media' },
  { type: 'video', label: 'Video', Icon: Play, description: 'YouTube/Vimeo embed', group: 'Media' },
  { type: 'audio', label: 'Audio', Icon: Volume2, description: 'Audio player / podcast', group: 'Media' },
  { type: 'callout', label: 'Callout', Icon: Lightbulb, description: 'Styled info/warning/formula box', group: 'Content' },
  { type: 'highlight', label: 'Highlight', Icon: Sparkles, description: 'Key term or concept bubble', group: 'Content' },
  { type: 'key_takeaways', label: 'Takeaways', Icon: Target, description: 'Key takeaways checklist', group: 'Content' },
  { type: 'divider', label: 'Divider', Icon: Minus, description: 'Visual separator', group: 'Layout' },
  { type: 'quiz', label: 'Quiz', Icon: HelpCircle, description: 'Inline quiz question', group: 'Interactive' },
  { type: 'embed', label: 'Embed', Icon: ExternalLink, description: 'External content via URL', group: 'Media' },
  { type: 'table', label: 'Table', Icon: Table, description: 'Data table', group: 'Content' },
  { type: 'file', label: 'File', Icon: Paperclip, description: 'Downloadable attachment', group: 'Media' },
  { type: 'slideshow', label: 'Slideshow', Icon: Images, description: 'Image slideshow/carousel', group: 'Media' },
  { type: 'link_reference', label: 'Links / Refs', Icon: Link2, description: 'Curated links & references', group: 'Interactive' },
  { type: 'flashcard', label: 'Flashcards', Icon: Layers, description: 'Flip-card study deck', group: 'Interactive' },
  { type: 'popup_article', label: 'Popup Article', Icon: Newspaper, description: 'Expandable summary / article', group: 'Interactive' },
  { type: 'backend_link', label: 'Page Link', Icon: ArrowRight, description: 'Link card to app page', group: 'Interactive' },
  { type: 'equation', label: 'Equation', Icon: Sigma, description: 'Math formula (LaTeX)', group: 'Content' },
  { type: 'tabs', label: 'Tabs', Icon: LayoutPanelTop, description: 'Tabbed content panels', group: 'Layout' },
  { type: 'accordion', label: 'Accordion', Icon: Rows3, description: 'Collapsible FAQ sections', group: 'Layout' },
  { type: 'columns', label: 'Columns', Icon: Columns3, description: '2-3 column layout', group: 'Layout' },
  { type: 'practice_problem', label: 'Practice Problem', Icon: Calculator, description: 'Step-by-step worked problem', group: 'Interactive' },
];

export function convertToEmbedUrl(url: string): string {
  if (!url) return '';
  // YouTube: convert watch URLs to embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo: convert standard URLs to embed
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// Equation-block preview — render the stored LaTeX with KaTeX (display mode),
// stripping a single wrapping $$…$$ / \[…\] if the author typed the delimiters.
export function renderLatex(tex: string): string {
  if (!tex) return '';
  const stripped = tex.trim()
    .replace(/^\$\$([\s\S]*?)\$\$$/, '$1')
    .replace(/^\\\[([\s\S]*?)\\\]$/, '$1')
    .trim();
  return renderMath(stripped, true);
}

// Smart HTML-to-blocks parser: splits seeded lesson HTML into discrete block types
export function parseHtmlToBlocks(htmlStr: string): LessonBlock[] {
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

/** What a freshly-inserted block of each type starts as.
 *
 *  Pure, and moved out of the builder component for platform audit item 18: it is a 24-case lookup
 *  that reads nothing from the page, and it is the one place that decides what "an empty table" or
 *  "an empty practice problem" means. Keeping it beside BLOCK_TYPES means adding a block type is
 *  one file, not two. */
export function getDefaultContent(type: BlockType): Record<string, any> {
  switch (type) {
    case 'text': return { html: '' };
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
    case 'flashcard': return { cards: [{ front: 'Term or question', back: 'Definition or answer' }], layout: 'single' };
    case 'popup_article': return { summary: 'Click to read more...', title: 'Article Title', full_content: '<p>Full article content here...</p>' };
    case 'backend_link': return { path: '/admin/learn', title: 'Page Title', description: 'Click to navigate', icon: '📖' };
    case 'highlight': return { items: [{ text: 'Key term or concept', style: 'blue' }] };
    case 'key_takeaways': return { title: 'Key Takeaways', items: ['First takeaway', 'Second takeaway'] };
    case 'equation': return { latex: 'E = mc^2', label: '', display: 'block' };
    case 'tabs': return { tabs: [{ title: 'Tab 1', content: '<p>Content for tab 1</p>' }, { title: 'Tab 2', content: '<p>Content for tab 2</p>' }], activeTab: 0 };
    case 'accordion': return { sections: [{ title: 'Section 1', content: '<p>Content for section 1</p>', open: true }, { title: 'Section 2', content: '<p>Content for section 2</p>', open: false }] };
    case 'columns': return { columnCount: 2, columns: [{ html: '<p>Left column content</p>' }, { html: '<p>Right column content</p>' }] };
    case 'practice_problem': return {
      title: '',
      problem_statement: '',
      difficulty: 'medium',
      category: '',
      steps: [{ label: 'Step 1', content: '', hint: '' }],
      final_answer: '',
      explanation: '',
    };
    default: return {};
  }
}
