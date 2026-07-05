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
import { splitTutorReply } from '@/lib/learn/tutor-script';

export const maxDuration = 60;
const MODEL = process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
// Higher than before because each turn now emits two channels — the display
// reply AND a spoken teaching script.
const MAX_TOKENS = 2600;

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
    '- FORMATTING: write in Markdown. Wrap ALL math in LaTeX with dollar-sign delimiters — inline math as $ ... $ and displayed equations as $$ ... $$ (never \\( \\) or \\[ \\], never bare unicode like x̄). Example: the mean is $\\bar{x} = \\frac{\\sum x_i}{n}$. Use Markdown pipe tables for tabular comparisons and ### for sub-headings. Do NOT wrap the whole reply in a code block.',
    '- FIGURE CAPTIONS: whenever you include a Markdown table, put a caption on the very next line in the exact form: "*Figure: <one concise sentence saying what the table shows or proves>*" (you may use "*Chart: ...*" or "*Spreadsheet: ...*" instead when that word fits better). One caption per table.',
    '',
    'TWO OUTPUTS — you MUST produce BOTH, in this exact order and structure:',
    '(1) The DISPLAY REPLY: the full teaching answer in Markdown exactly as described above (LaTeX math, tables with *Figure:* captions, headings, lists).',
    `(2) A line containing ONLY the marker: ${'==='}VOICE_SCRIPT${'==='}`,
    '(3) The VOICE SCRIPT: a spoken lesson that teaches the BIG PICTURE of the display reply for a text-to-speech tutor. It is HEARD, never seen.',
    '',
    'VOICE SCRIPT — PURPOSE: Your one job here is to help the student UNDERSTAND and ABSORB the material — the core idea, the intuition, and why it matters. You are a teacher talking them through the concept, NOT a narrator reading the page. Assume the student can see the reply and can read its numbers and equations perfectly well on their own; you do not need to relay them. Give them the mental model; let the screen hold the details.',
    '',
    'VOICE SCRIPT RULES (follow all of them):',
    '- Lead with the big idea. Open with what this is really about and why it matters, then build intuition. Favor plain-English understanding and mental models over mechanics. If you can only get one thing across, make it the concept.',
    '- Do NOT recite. Never read numbers, coordinates, table cells, or equations symbol-by-symbol. Point at them and say what they MEAN: e.g. "the formula on screen captures a simple idea — precision improves as you add measurements, but with diminishing returns." The equations and numbers are on screen for the student to read; your value is the interpretation.',
    '- Refer to visuals by pointing, at a glance. For each table/chart/spreadsheet in the display reply, insert the token [[FIG1]] for the first, [[FIG2]] for the second, and so on IN ORDER, and say what it reveals as a whole — e.g. "[[FIG1]] makes the trade-off obvious: after about thirty measurements you are barely gaining anything." Never walk through its rows.',
    '- Stay out of the weeds. Skip step-by-step arithmetic, derivations, and edge cases unless that detail IS the concept. When something is a detail the student can just read, leave it on screen and move on.',
    '- Aim for absorption, not coverage. It is better to make one idea click than to mention every point in the reply. Keep it short — often just a few sentences to two short paragraphs; shorter when the idea is simple.',
    '- Offer depth on demand instead of giving it unprompted. Where useful, signal that specifics are available ("if you want, I can walk through the exact numbers or that derivation") — but only actually dig into a specific value, equation, or step when the student asks for it.',
    '- Delivery: warm, encouraging, second person, plain spoken words. NO Markdown, headings, bullets, or LaTeX. Say "feet" not "ft", "equals" not "=", and name variables in words ("the number of measurements") rather than a bare letter like n. Short sentences that are easy to follow by ear.',
    '- EXCEPTION: if the student explicitly asked you to read a specific equation, table, or value out in full, then do read that part out in the voice script.',
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
    const raw = block && block.type === 'text' ? block.text.trim() : 'Sorry — I could not generate a response. Please try again.';
    // Split the two channels: the Markdown display reply + the spoken teaching
    // script. If the marker is absent, voiceScript is null and the client falls
    // back to normalizing the reply for read-aloud.
    const { reply, voiceScript } = splitTutorReply(raw);
    return NextResponse.json({ reply, voiceScript, relatedProblems, model: response.model });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { routeName: 'admin/learn/ai-tutor#post' });
