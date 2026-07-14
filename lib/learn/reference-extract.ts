// lib/learn/reference-extract.ts — pull plain text out of an uploaded reference document
// so it can be chunked + embedded for the grounded FS tutor. Handles digital PDFs
// (pdf-parse), scanned PDFs + images (Claude OCR), Word docs (mammoth), and plain text.
// Mirrors the approach already proven in lib/research/document.service.ts, kept
// self-contained so the learn feature doesn't depend on the research_documents schema.
import Anthropic from '@anthropic-ai/sdk';

const OCR_MODEL = process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const PDF_TEXT_MIN_CHARS = 100; // below this, treat the PDF as scanned and OCR it
const IMG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export type RefKind = 'pdf' | 'docx' | 'text' | 'image';

export interface ExtractResult {
  text: string;
  kind: RefKind;
  method: string;
}

export function kindFor(mime: string, filename: string): RefKind {
  const n = filename.toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return 'docx';
  if (IMG_MIME.has(mime) || /\.(png|jpe?g|webp|gif)$/i.test(n)) return 'image';
  return 'text';
}

async function ocr(content: Anthropic.MessageParam['content']): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured (needed to OCR scans/images).');
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: OCR_MODEL,
    max_tokens: 8000,
    system:
      'You are a precise OCR/transcription engine for land-surveying study material. Transcribe ALL text ' +
      'from the document EXACTLY as written — preserve headings, formulas, numbers, tables (as Markdown), ' +
      'bearings, and units. Do not summarize, explain, or add commentary. Output only the transcribed text.',
    messages: [{ role: 'user', content }],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
}

export async function extractReferenceText(buffer: Buffer, mime: string, filename: string): Promise<ExtractResult> {
  const kind = kindFor(mime, filename);

  if (kind === 'text') {
    return { text: buffer.toString('utf8'), kind, method: 'utf8' };
  }

  if (kind === 'docx') {
    const mammoth = (await import('mammoth')) as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value || '', kind, method: 'mammoth' };
  }

  if (kind === 'image') {
    const media_type = (IMG_MIME.has(mime) ? mime : 'image/png') as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    const text = await ocr([
      { type: 'image', source: { type: 'base64', media_type, data: buffer.toString('base64') } },
      { type: 'text', text: 'Transcribe all text from this image.' },
    ]);
    return { text, kind, method: 'claude-vision' };
  }

  // PDF: fast text-layer extraction first, OCR fallback for scans.
  // pdf-parse@2 is class-based: `new PDFParse({ data }).getText()` → { text }.
  let pdfText = '';
  try {
    const { PDFParse } = (await import('pdf-parse')) as unknown as {
      PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> };
    };
    const parser = new PDFParse({ data: buffer });
    try {
      pdfText = (await parser.getText()).text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch {
    /* encrypted/corrupted text layer — fall through to OCR */
  }
  if (pdfText.replace(/\s/g, '').length >= PDF_TEXT_MIN_CHARS) {
    return { text: pdfText, kind, method: 'pdf-parse' };
  }
  const text = await ocr([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
    { type: 'text', text: 'Transcribe all text from every page of this PDF.' },
  ]);
  return { text, kind, method: 'claude-pdf-ocr' };
}

/** Split extracted text into overlapping passages (~800 words, ~120-word overlap) on
 *  paragraph boundaries. Overlap keeps a concept from being cut across a chunk edge. */
export function chunkText(text: string, opts: { maxWords?: number; overlapWords?: number } = {}): string[] {
  const maxWords = opts.maxWords ?? 800;
  const overlapWords = opts.overlapWords ?? 120;
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];

  // Break into paragraphs, then greedily pack them into word-bounded chunks.
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur: string[] = [];
  let curWords = 0;
  const flush = () => {
    if (!cur.length) return;
    chunks.push(cur.join('\n\n'));
    // Carry the tail of this chunk into the next for overlap.
    const words = cur.join(' ').split(/\s+/);
    const tail = words.slice(Math.max(0, words.length - overlapWords)).join(' ');
    cur = tail ? [tail] : [];
    curWords = tail ? tail.split(/\s+/).length : 0;
  };
  for (const p of paras) {
    const w = p.split(/\s+/).length;
    // A single huge paragraph: hard-split it by words.
    if (w > maxWords) {
      flush();
      if (cur.length) flush();
      const words = p.split(/\s+/);
      for (let i = 0; i < words.length; i += maxWords - overlapWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
      }
      continue;
    }
    if (curWords + w > maxWords) flush();
    cur.push(p);
    curWords += w;
  }
  if (cur.length) chunks.push(cur.join('\n\n'));
  // De-dupe accidental empties and cap chunk length for embedding safety.
  return chunks.map((c) => c.trim()).filter(Boolean).map((c) => c.slice(0, 6000));
}
