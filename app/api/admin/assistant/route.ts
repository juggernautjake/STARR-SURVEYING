// app/api/admin/assistant/route.ts — one assistant, everywhere (audit §5, Phase 3 item 14).
//
// §5's target: *"One assistant, everywhere — a persistent dock that knows the current page, the
// user's role, and their live context, and can act via tools."*
//
// POST { messages, page?, confirmedTool? } → { reply, toolCalls, pendingConfirmation? }
//
// ── THE TOOL LOOP RUNS SERVER-SIDE, AND STOPS ───────────────────────────────────────────────────
//
// The model calls a tool, the server runs it, the result goes back, repeat — up to a hard cap. The
// cap is not defensive decoration: a model that keeps searching for a job that does not exist will
// do so until something stops it, and each turn is a paid request. Six is enough for "find the job,
// check its equipment, check the calibration" and short enough that a loop is bounded in seconds.
//
// ── CONFIRMATION IS A ROUND TRIP, NOT A FLAG ────────────────────────────────────────────────────
//
// A tool marked `confirm` does not execute. The route returns the pending call and stops; the client
// shows what will happen and sends it back with `confirmedTool`. That is D4's approval gate — *"if
// they approve, the AI runs…"* — and it is a round trip rather than a client-side flag because a
// flag is set by the client, and the client is not the thing being trusted.
import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { auth, type UserRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { orgIdForSession } from '@/lib/saas/org-scope-context';
import { callAi, aiConfigured, userMessageFor } from '@/lib/ai/client';
import { buildAssistantContext, renderContext } from '@/lib/ai/context';
import { requiresConfirmation, runTool, toolDefinitionsFor } from '@/lib/ai/tools';
import { routeLabel, findRoute } from '@/lib/admin/route-registry';

const MAX_TOOL_TURNS = 6;

const BEHAVIOUR = `
You help the people who work at this surveying firm use their own software and do their jobs.

How to answer:
- Answer from the grounding facts and from tools. If neither has it, say so plainly. Never invent a
  job number, a customer name, a measurement, a price, or a date — a made-up job number in a
  surveying firm sends a crew to the wrong property.
- Use a tool rather than asking the user for something a tool can look up. If they mention a job,
  find it.
- Be brief. These are people working, often on a phone, often outdoors.
- You can answer general and technical surveying questions too — boundary law, traverse adjustment,
  Texas practice. Say when something needs a licensed surveyor's judgement rather than answering as
  if it were settled.
- You are not a lawyer and not the surveyor of record. Never state a boundary opinion as fact.
`.trim();

interface Body {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  page?: { path: string };
  /** A previously-returned tool call the user approved. */
  confirmedTool?: { id: string; name: string; input: Record<string, unknown> };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  if (!aiConfigured()) {
    // Said plainly rather than failing as a generic error. "The assistant is broken" and "nobody has
    // set up an API key" get very different responses from the person reading it.
    return NextResponse.json({ error: 'The AI assistant is not set up on this system yet.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const turns = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (turns.length === 0) return NextResponse.json({ error: 'No message.' }, { status: 400 });

  const roles = (session.user.roles ?? ['employee']) as UserRole[];
  const email = session.user.email;

  const route = body.page?.path ? findRoute(body.page.path) : null;
  const ctx = await buildAssistantContext({
    email,
    name: session.user.name,
    roles,
    orgId: orgIdForSession(session),
    page: body.page?.path
      ? { path: body.page.path, label: route?.label ?? routeLabel(body.page.path), description: route?.description }
      : undefined,
  });

  const system = `${renderContext(ctx)}\n\n${BEHAVIOUR}`;
  const tools = toolDefinitionsFor(roles);

  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const executed: Array<{ name: string; input: unknown; result: unknown }> = [];

  // A tool the user just approved runs first, and its result is seeded into the conversation as if
  // the model had called it — which, on the previous request, it did.
  if (body.confirmedTool) {
    const { name, input, id } = body.confirmedTool;
    const { result } = await runTool(name, input ?? {}, { email, roles });
    executed.push({ name, input, result });
    messages.push(
      { role: 'assistant', content: [{ type: 'tool_use', id, name, input: input ?? {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) }] },
    );
  }

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const { message, text } = await callAi({
        role: 'assistant',
        surface: 'assistant',
        system,
        messages,
        tools,
        userEmail: email,
      });

      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (toolUses.length === 0) {
        return NextResponse.json({ reply: text, toolCalls: executed });
      }

      // Anything needing approval stops the loop and asks. Checked before ANY tool in the batch runs
      // — running the harmless ones first and then asking would leave the user approving a change
      // that has already half happened.
      const needsConfirm = toolUses.find((t) => requiresConfirmation(t.name));
      if (needsConfirm) {
        return NextResponse.json({
          reply: text,
          toolCalls: executed,
          pendingConfirmation: {
            id: needsConfirm.id,
            name: needsConfirm.name,
            input: needsConfirm.input,
          },
        });
      }

      messages.push({ role: 'assistant', content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const { result } = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>, { email, roles });
        executed.push({ name: t.name, input: t.input, result });
        results.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(result) });
      }
      // All results in ONE user message. Splitting them across messages teaches the model to stop
      // making parallel calls, which makes every later answer slower.
      messages.push({ role: 'user', content: results });
    }

    // Hit the cap. Said out loud rather than returning the last partial text as if it were an answer.
    return NextResponse.json({
      reply: 'I looked into that but could not finish — I hit my limit on lookups for one question. Try asking for one thing at a time.',
      toolCalls: executed,
      truncated: true,
    });
  } catch (err) {
    return NextResponse.json({ error: userMessageFor(err), toolCalls: executed }, { status: 502 });
  }
});
