// app/api/dnd/homebrew/ingest/route.ts — read a document and fill the form from it (P6-16).
//
// Stateless, like `assist`, and for the same reason: this is most useful *before* the piece exists. It
// returns field values; the builder applies them to the form, where the author sees every one before
// anything is saved. Nothing is written here — which is what makes "you review it first" structural rather
// than a promise.
//
// PDFs and images go to the model as native content blocks rather than being text-extracted first. A class
// PDF's layout carries meaning (a level table is a table), and OCR-to-plaintext is exactly where a
// twenty-level ladder turns into mush.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { checkRateLimit, rateLimitSubject, rateLimitHeaders } from '@/lib/dnd/rate-limit';
import { isHomebrewKind } from '@/lib/dnd/homebrew/model';
import { normalizeContentSystem } from '@/lib/dnd/homebrew/kinds';
import {
  INGEST_SYSTEM_PROMPT, INGEST_MIME, ingestUserPrompt, normalizeIngest,
} from '@/lib/dnd/homebrew/ingest';

// Anthropic's own request ceiling is what binds here, not our storage — the file is never stored, it is
// read once and discarded.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI import is not configured on this deployment.' }, { status: 503 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 }); }

  const kind = String(form.get('kind') ?? '');
  if (!isHomebrewKind(kind)) return NextResponse.json({ error: 'Unknown content kind.' }, { status: 400 });
  const system = normalizeContentSystem(kind, form.get('system'));

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  const mode = INGEST_MIME[file.type];
  if (!mode) {
    return NextResponse.json({ error: 'Use a PDF, an image, or a text file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File must be 10 MB or smaller.' }, { status: 400 });

  const limit = await checkRateLimit('ai', rateLimitSubject({ userId: session.userId }));
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.message }, { status: 429, headers: rateLimitHeaders(limit, 'ai') });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const instruction = ingestUserPrompt(kind, system);

    // Built as content BLOCKS. A PDF or an image goes to the model as itself; only a genuine text file is
    // inlined as a string. The document comes first and the instruction last, which is what keeps a long
    // attachment from pushing the instruction out of the model's attention.
    const content =
      mode === 'text'
        ? [{ type: 'text' as const, text: `${bytes.toString('utf8').slice(0, 200_000)}\n\n---\n\n${instruction}` }]
        : mode === 'document'
          ? [
            { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } },
            { type: 'text' as const, text: instruction },
          ]
          : [
            { type: 'image' as const, source: { type: 'base64' as const, media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: bytes.toString('base64') } },
            { type: 'text' as const, text: instruction },
          ];

    const raw = await dndCompleteJSON<unknown>({
      system: INGEST_SYSTEM_PROMPT,
      user: [{ role: 'user', content }],
      maxTokens: 4000,
      // Near-zero: this is transcription. A creative temperature here produces a paraphrase, and a
      // paraphrased rule is a different rule.
      temperature: 0.1,
    });

    const result = normalizeIngest(kind, raw);
    if (!Object.keys(result.values).length) {
      return NextResponse.json({
        error: 'Nothing usable could be read from that file. If it is a scan, try a clearer image or paste the text instead.',
      }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that file.' }, { status: 502 });
  }
}
