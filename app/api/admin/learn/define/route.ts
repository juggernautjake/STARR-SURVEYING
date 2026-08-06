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
import { modelFor } from '@/lib/ai/models';

export const maxDuration = 30;
const MODEL = process.env.CAD_AI_MODEL ?? modelFor('extraction').model;

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
      {
        model: MODEL,
        // 220 before, which was sized for the answer alone. On Claude Opus 5 `max_tokens` caps
        // thinking AND the response together, and a measured request spent 158 of 220 on thinking
        // and stopped at `max_tokens` mid-sentence. 1000 leaves room for both; a 1–3 sentence
        // definition uses a fraction of it, so this costs nothing on a normal request.
        max_tokens: 1000,
        // A tooltip that appears on click should not deliberate. Low effort keeps adaptive thinking
        // brief rather than switching it off: `thinking: {type:'disabled'}` is the other lever, but
        // on this model disabling it can leak `<thinking>` tags into the visible answer — which in
        // a definition popup would be the user's problem, not ours.
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: `Define: ${term}` }],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    // ── READ EVERY BLOCK, NOT `content[0]` (fixed 2026-08-06) ─────────────────────────────────
    //
    // This used to be `const block = response.content[0]`, and that one index is the whole bug the
    // owner reported as *"no definitions are being supplied… is claude api not hooked up
    // correctly?"*. It was: the key is valid, the model is current, the call succeeds, and Claude
    // returns a perfectly good definition — in `content[1]`.
    //
    // On Claude Opus 5 **thinking is on by default**. Omitting the `thinking` parameter used to
    // mean "no thinking"; on this model it means adaptive thinking, so the response arrives as
    // `[thinking, text]` and `content[0]` is a thinking block whose text is empty (`display`
    // defaults to `"omitted"`). The old check asked "is block 0 text?", got false, and returned
    // 502 "No definition returned" while holding the answer.
    //
    // Measured 2026-08-06 against the live API: identical requests returned `[text]` on one call
    // and `[thinking, text]` on the next — adaptive thinking decides per request. That is why this
    // failed intermittently first and then apparently completely, and why it could never be
    // reproduced by checking the API key.
    const definition = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!definition) {
      // Thinking and the answer share one `max_tokens` budget on this model, so a tight cap can be
      // spent entirely on thinking and truncate before any prose. Say which of the two happened —
      // "no definition" sent somebody looking at the API key for the wrong reason once already.
      const reason = response.stop_reason === 'max_tokens'
        ? 'The definition was cut off before it started. Try again.'
        : 'No definition returned';
      return NextResponse.json({ error: reason }, { status: 502 });
    }
    return NextResponse.json({ definition });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Definition request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { routeName: 'admin/learn/define#post' });
