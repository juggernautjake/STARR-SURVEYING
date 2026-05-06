// app/api/admin/cad/element-chat/route.ts
//
// POST /api/admin/cad/element-chat
//
// Phase 6 §30.4 — server entry point for the per-element chat
// dialog. The popup posts the in-flight transcript + the
// element context and gets back Claude's reply plus an
// optional structured ElementChatAction the client can apply
// (or just display, when the action is NO_ACTION).
//
// Auth: admin / equipment_manager (mirrors the rest of the
// /admin/cad/* routes). ANTHROPIC_API_KEY missing → 503 with
// a friendly message; the popup surfaces it as a banner so
// the surveyor knows chat is offline.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  handleElementChat,
  type ElementChatRequest,
} from '@/lib/cad/ai-engine/element-chat';
import { MissingApiKeyError } from '@/lib/cad/ai-engine/claude-deed-parser';

// 60 s — single-call envelope; the handler itself caps at 45 s.
export const maxDuration = 60;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles =
    (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | (ElementChatRequest & { signal?: never })
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object matching ElementChatRequest.' },
      { status: 400 }
    );
  }
  if (!body.feature || !body.feature.id) {
    return NextResponse.json(
      { error: 'Body must include a `feature` with an id.' },
      { status: 400 }
    );
  }
  if (!body.explanation || body.explanation.featureId !== body.feature.id) {
    return NextResponse.json(
      {
        error:
          '`explanation.featureId` must match `feature.id` to keep ' +
          'chat scoped to the right element.',
      },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.history) || body.history.length === 0) {
    return NextResponse.json(
      { error: '`history` must be a non-empty array of chat messages.' },
      { status: 400 }
    );
  }
  const last = body.history[body.history.length - 1];
  if (!last || last.role !== 'USER' || typeof last.content !== 'string') {
    return NextResponse.json(
      {
        error:
          'The last entry in `history` must be the user message ' +
          '(role=USER, non-empty content).',
      },
      { status: 400 }
    );
  }

  try {
    const response = await handleElementChat({
      feature: body.feature,
      explanation: body.explanation,
      history: body.history,
    });
    console.log('[admin/cad/element-chat] ok', {
      feature_id: body.feature.id,
      model: response.model,
      action: response.action?.type ?? 'NONE',
      latency_ms: response.latencyMs,
      actor_email: session.user.email,
    });
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        {
          error:
            'Element chat is offline — ANTHROPIC_API_KEY is not set ' +
            'on the server. Configure it in the environment to enable ' +
            'AI chat for this drawing.',
        },
        { status: 503 }
      );
    }
    throw err;
  }
}, { routeName: 'admin/cad/element-chat#post' });
