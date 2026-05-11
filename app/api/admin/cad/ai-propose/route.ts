// app/api/admin/cad/ai-propose/route.ts
//
// POST /api/admin/cad/ai-propose
//
// Phase 6 §32.13 Slice 6 — server entry point for the COPILOT
// proposal queue. The client POSTs the surveyor's prompt + the
// current project context; the route runs Claude with the tool
// registry exposed as tools, returns the resulting proposals
// (and any narrative caveats) for the client to drop into
// `useAIStore.proposalQueue`.
//
// Auth: admin / equipment_manager — mirrors the other AI routes.
// Missing API key → 503 with a friendly message; the chat panel
// surfaces it as a banner so the surveyor knows AI is offline.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { proposeFromPrompt } from '@/lib/cad/ai/claude-proposer';
import { MissingApiKeyError } from '@/lib/cad/ai-engine/claude-deed-parser';
import type { ProjectContext } from '@/lib/cad/ai/system-prompt';

// 60 s envelope. The proposer caps the SDK call at 45 s; the
// extra headroom covers auth + JSON parsing.
export const maxDuration = 60;

interface ProposeRequest {
  prompt: string;
  context: ProjectContext;
}

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

  const body = (await req.json().catch(() => null)) as ProposeRequest | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object with `prompt` and `context`.' },
      { status: 400 }
    );
  }
  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return NextResponse.json(
      { error: '`prompt` must be a non-empty string.' },
      { status: 400 }
    );
  }
  if (!body.context || typeof body.context !== 'object') {
    return NextResponse.json(
      { error: '`context` must be a ProjectContext object.' },
      { status: 400 }
    );
  }

  try {
    const result = await proposeFromPrompt(body.prompt, body.context);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: 'AI is offline — ANTHROPIC_API_KEY is not configured.' },
        { status: 503 }
      );
    }
    throw err;
  }
});
