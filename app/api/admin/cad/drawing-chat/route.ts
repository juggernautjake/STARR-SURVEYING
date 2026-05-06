// app/api/admin/cad/drawing-chat/route.ts
//
// POST /api/admin/cad/drawing-chat
//
// Phase 7 §4 — server entry point for the persistent drawing-
// level chat panel. Mirrors the §30.4 element-chat route but
// at whole-drawing scope: the body carries the active
// document + the current chat transcript, and the response
// is the reply + an optional structured DrawingChatAction.
//
// Auth: admin / equipment_manager. ANTHROPIC_API_KEY missing
// → 503 with a friendly message.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  handleDrawingChat,
  type DrawingChatRequest,
} from '@/lib/cad/ai-engine/drawing-chat';
import { MissingApiKeyError } from '@/lib/cad/ai-engine/claude-deed-parser';

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
    | (DrawingChatRequest & { signal?: never })
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object matching DrawingChatRequest.' },
      { status: 400 }
    );
  }
  if (!body.doc || typeof body.doc !== 'object') {
    return NextResponse.json(
      { error: 'Body must include a `doc` (DrawingDocument snapshot).' },
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
    const response = await handleDrawingChat({
      doc: body.doc,
      history: body.history,
    });
    console.log('[admin/cad/drawing-chat] ok', {
      doc_id: body.doc.id,
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
            'Drawing chat is offline — ANTHROPIC_API_KEY is not set on ' +
            'the server. Configure it in the environment to enable AI ' +
            'chat.',
        },
        { status: 503 }
      );
    }
    throw err;
  }
}, { routeName: 'admin/cad/drawing-chat#post' });
