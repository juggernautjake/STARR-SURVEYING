// app/api/admin/research/testing/ai-analyze/route.ts
// AI analysis endpoint — OCR, classification, explanation, and validation.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isDeveloper } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import Anthropic from '@anthropic-ai/sdk';

const TIMEOUT_MS = 30_000;
const MODEL = process.env.RESEARCH_AI_MODEL || 'claude-sonnet-4-5-20250929';

interface AnalyzeRequest {
  type: 'ocr' | 'classify' | 'explain' | 'validate';
  content: string;
  context?: string;
}

interface AnalyzeResponse {
  analysis: string;
  suggestions?: string[];
  confidence: number;
  type: string;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  ocr: 'You are an OCR specialist. Extract all visible text from the provided image exactly as it appears, preserving layout where possible. For surveying documents, pay special attention to bearings, distances, acreages, parcel IDs, legal descriptions, and owner names.',
  classify: 'You are a document classification specialist for Texas real estate and surveying. Classify the provided image as one of: aerial, plat, deed, topo, survey, tax-record, legal-description, sketch, photo, or unknown. Respond with the classification, a confidence score (0-1), and a brief justification.',
  explain: 'You are a surveying and property research expert. Explain the provided code or data in the context of Texas land surveying, CAD portal scraping, and property boundary analysis. Be concise and developer-focused.',
  validate: 'You are a data validation expert for Texas property research pipelines. Review the provided JSON data and identify any anomalies, missing fields, suspicious values, or data quality issues. List specific problems and suggest fixes.',
};

async function handler(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email || !isDeveloper(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const resp: AnalyzeResponse = {
      analysis: 'AI analysis requires ANTHROPIC_API_KEY to be configured.',
      confidence: 0,
      type: 'error',
    };
    return NextResponse.json(resp);
  }

  const body = (await req.json()) as AnalyzeRequest;
  const { type, content, context } = body;

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = SYSTEM_PROMPTS[type] ?? SYSTEM_PROMPTS.explain;

  // Build message content
  let userContent: Anthropic.MessageCreateParams['messages'][0]['content'];

  if ((type === 'ocr' || type === 'classify') && content.startsWith('data:image')) {
    // base64 image
    const match = content.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const imageData = match[2];
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
        { type: 'text', text: context ? `Context: ${context}\n\nPlease analyze this image.` : 'Please analyze this image.' },
      ];
    } else {
      userContent = content;
    }
  } else {
    const text = context ? `Context: ${context}\n\n${content}` : content;
    userContent = text;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const message = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      { signal: controller.signal },
    );

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    // Extract suggestions if the response contains a numbered list
    const suggestions: string[] = [];
    const listRe = /^\s*\d+[.)]\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = listRe.exec(raw)) !== null) {
      suggestions.push(m[1].trim());
    }

    const resp: AnalyzeResponse = {
      analysis: raw,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      confidence: 0.9,
      type,
    };
    return NextResponse.json(resp);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ analysis: msg, confidence: 0, type: 'error' } satisfies AnalyzeResponse);
  } finally {
    clearTimeout(timer);
  }
}

export const POST = withErrorHandler(handler);
