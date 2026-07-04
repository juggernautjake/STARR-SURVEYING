// app/api/admin/learn/define/route.ts
//
// POST /api/admin/learn/define  { term, context? }  → { definition }
//
// AI fallback for the term-definition popups: when a clicked term isn't in the
// curated FS glossary, ask Claude for a short, accurate definition. Kept tight
// (1–3 sentences, no fabrication) so it reads like a tooltip.
//
// Auth: any signed-in user. ANTHROPIC_API_KEY missing → 503.

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const maxDuration = 30;
const MODEL = process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Definitions are offline — ANTHROPIC_API_KEY is not configured.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { term?: string; context?: string } | null;
  const term = body?.term?.trim();
  if (!term) return NextResponse.json({ error: 'term required' }, { status: 400 });
  if (term.length > 120) return NextResponse.json({ error: 'term too long' }, { status: 400 });

  const system = [
    'You define terms for a student studying for the NCEES Fundamentals of Surveying (FS) exam and land surveying generally.',
    'Give a SHORT, accurate definition of the requested term as used in surveying/geomatics/boundary law — 1 to 3 sentences, plain language.',
    'Be precise. If the term is ambiguous, define the surveying meaning. Never invent formulas, values, or citations. Do not add headings, labels, or markdown — return only the definition text.',
    body?.context ? `Context: the student is in "${String(body.context).slice(0, 120)}".` : '',
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await client.messages.create(
      { model: MODEL, max_tokens: 220, system, messages: [{ role: 'user', content: `Define: ${term}` }] },
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    const block = response.content[0];
    const definition = block && block.type === 'text' ? block.text.trim() : '';
    if (!definition) return NextResponse.json({ error: 'No definition returned' }, { status: 502 });
    return NextResponse.json({ definition });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Definition request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { routeName: 'admin/learn/define#post' });
