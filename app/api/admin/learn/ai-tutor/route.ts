// app/api/admin/learn/ai-tutor/route.ts
//
// POST /api/admin/learn/ai-tutor
//
// "Deeper learning with AI" — a focused tutoring conversation about a passage
// the student highlighted while studying. The client posts the highlighted text
// + module context + the running transcript; we build an accuracy-first tutor
// system prompt, look up RELATED practice problems on this platform, ask Claude,
// and return { reply, relatedProblems }.
//
// Auth: any signed-in user (learners). ANTHROPIC_API_KEY missing → 503.

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const maxDuration = 60;
const MODEL = process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 1400;

interface TutorMessage { role: 'user' | 'assistant'; content: string }
interface RelatedProblem { id: string; question_text: string; difficulty: string }

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI tutor is offline — ANTHROPIC_API_KEY is not configured on the server.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    highlightedText?: string;
    moduleId?: string;
    moduleNumber?: number;
    moduleTitle?: string;
    sectionTitle?: string;
    messages?: TutorMessage[];
  } | null;

  if (!body || typeof body.highlightedText !== 'string' || !body.highlightedText.trim()) {
    return NextResponse.json({ error: 'highlightedText is required.' }, { status: 400 });
  }
  const highlighted = body.highlightedText.trim().slice(0, 4000);
  const messages = Array.isArray(body.messages) ? body.messages : [];

  // ── Related practice problems on this platform (same module, keyword-matched) ──
  let relatedProblems: RelatedProblem[] = [];
  try {
    const keywords = highlighted.toLowerCase().match(/[a-z]{4,}/g) || [];
    const uniq = [...new Set(keywords)].slice(0, 10);
    let q = supabaseAdmin
      .from('question_bank')
      .select('id, question_text, difficulty, module_id')
      .eq('is_published', true)
      .limit(40);
    if (body.moduleId) q = q.eq('module_id', body.moduleId);
    const { data } = await q;
    type Row = { id: string; question_text: string; difficulty: string; module_id: string };
    relatedProblems = ((data || []) as Row[])
      .map((r: Row) => {
        const t = String(r.question_text || '').toLowerCase();
        return { r, score: uniq.reduce((s: number, w: string) => s + (t.includes(w) ? 1 : 0), 0) };
      })
      .filter((s: { score: number }) => s.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 4)
      .map((s: { r: Row }) => ({
        id: String(s.r.id),
        question_text: String(s.r.question_text || '').slice(0, 140),
        difficulty: String(s.r.difficulty || ''),
      }));
  } catch {
    /* related-problem lookup is best-effort; never fail the chat over it */
  }

  const system = [
    'You are an expert tutor in land surveying, geomatics, boundary law, and the NCEES Fundamentals of Surveying (FS) exam (the Texas Surveyor-In-Training path). Adapt to the module/course context given below.',
    'A student is studying and has HIGHLIGHTED a passage they want to understand more deeply. Have a focused, encouraging, back-and-forth learning conversation about exactly that.',
    '',
    'RULES:',
    '- Accuracy first. Only state what you are confident is correct. If something is uncertain, disputed, or varies by state/jurisdiction, SAY SO plainly. Never invent formulas, numeric values, code/statute sections, or citations.',
    '- Teach: explain at an appropriate level, show worked steps with concrete numbers where useful, and define terms.',
    '- Point to REPUTABLE resources by name (the NCEES FS Reference Handbook; NGS/NOAA; USGS; the Texas Board of Professional Engineers and Land Surveyors (TBPELS); Ghilani & Wolf, "Elementary Surveying"; Kavanagh). Describe how to find them; do NOT fabricate URLs.',
    '- Note Texas nuances where relevant (metes-and-bounds, the vara, TBPELS rules) but distinguish Texas practice from national FS content.',
    '- If practice problems on THIS platform relate to the topic (listed below), encourage the student to try them — the UI shows them as clickable links.',
    '- Keep replies focused and readable: short paragraphs, bullet lists, and a guiding follow-up question when it aids learning.',
    '',
    `MODULE CONTEXT: ${body.moduleTitle ? `Module ${body.moduleNumber ?? ''} — ${body.moduleTitle}` : 'general study'}${body.sectionTitle ? ` (section: ${body.sectionTitle})` : ''}.`,
    '',
    'HIGHLIGHTED TEXT the student wants to explore:',
    '"""',
    highlighted,
    '"""',
    relatedProblems.length
      ? `\nRELATED PRACTICE PROBLEMS on this platform (reference them naturally; the UI lists them as links):\n${relatedProblems.map((p, i) => `${i + 1}. ${p.question_text} [${p.difficulty}]`).join('\n')}`
      : '',
  ].join('\n');

  // Seed the very first turn so the tutor opens the conversation itself.
  const convo: TutorMessage[] = messages.length > 0
    ? messages
    : [{ role: 'user', content: 'Please explain the highlighted text and help me understand it deeply.' }];
  const windowed = convo.slice(-16).filter((m) => m.content?.trim());

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: windowed.map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    const block = response.content[0];
    const reply = block && block.type === 'text' ? block.text.trim() : 'Sorry — I could not generate a response. Please try again.';
    return NextResponse.json({ reply, relatedProblems, model: response.model });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { routeName: 'admin/learn/ai-tutor#post' });
