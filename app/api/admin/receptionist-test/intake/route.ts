// app/api/admin/receptionist-test/intake/route.ts — run the voicemail interview without a phone.
//
// Owner, 2026-09-21: "I want to test all of this on the admin backend before we make it live. So
// build all of this out and make it available for me to test on the backend for now, and leave the
// current messaging system in place so that it just asks the customer to leave a message."
//
// ── NOTHING HERE TOUCHES THE LIVE LINE ──────────────────────────────────────────────────────────
//
// This route is not wired into any Twilio webhook and no TwiML points at it. The business number
// still reaches the answering machine exactly as it did. The only way to reach this is signed in as
// an admin on /admin/dev/receptionist, which is what "test it on the backend first" means.
//
// It also writes nothing: no phone_calls row, no lead, no notification. A test conversation that
// created a lead would put a fictional customer in front of whoever works the queue on Monday.
//
// ── ONE TURN PER REQUEST, STATE CARRIED BY THE CLIENT ───────────────────────────────────────────
//
// The whole interview is a pure function of (state, what they just said), so the server needs no
// session and no store. The page holds the state and posts it back. That also means the tester can
// edit the state — jump the clock to six and a half minutes, mark a name as doubtful — and watch
// what the agent does, which is the thing that is otherwise impossible to rehearse.
import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { BUSINESS_NAME, EMAIL, SITE_URL } from '@/lib/seo/business';
import { OWNER_NAME } from '@/lib/receptionist/knowledge';
import {
  configureIntakeLines, nextStep, intakeLines, openFields,
  CALL_BUDGET_MS, WIND_DOWN_MS, elapsedMs,
  type IntakeState, type IntakeFacts, type Phase,
} from '@/lib/receptionist/intake';
import { extractFromSpeech, mergeExtraction } from '@/lib/receptionist/intake-extract';

export const dynamic = 'force-dynamic';

configureIntakeLines({
  business: BUSINESS_NAME,
  owner: OWNER_NAME,
  email: EMAIL,
  website: SITE_URL.replace(/^https?:\/\//, ''),
});

interface TurnRequest {
  /** The caller's words this turn: their voicemail, or their answer to the last question. */
  said?: string;
  /** Where the call is. Omitted on the first request, which starts at the greeting. */
  state?: Partial<IntakeState>;
  /** Minutes into the call, so a tester can reach the seven-minute wind-down without waiting. */
  elapsedSeconds?: number;
  /** They answered "no" to the request for a few questions. */
  declined?: boolean;
}

function hydrate(partial: Partial<IntakeState> | undefined, elapsedSeconds: number): IntakeState {
  // `startedAt` is derived from the elapsed seconds the page sends rather than from a real clock,
  // which is what lets the tester stand at 6:45 and watch the wind-down fire.
  const startedAt = Date.now() - Math.max(0, elapsedSeconds) * 1000;
  return {
    phase: (partial?.phase as Phase) ?? 'greeting',
    facts: (partial?.facts as IntakeFacts) ?? {},
    asked: Array.isArray(partial?.asked) ? partial!.asked : [],
    declined: Boolean(partial?.declined),
    invitedQuestions: Boolean(partial?.invitedQuestions),
    startedAt,
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: TurnRequest = {};
  try {
    body = (await request.json()) as TurnRequest;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const said = (body.said ?? '').trim();
  const state = hydrate(body.state, body.elapsedSeconds ?? 0);
  if (body.declined) state.declined = true;

  // ── read what they said ─────────────────────────────────────────────────────────────────────
  //
  // The extraction runs on every turn, not only on the voicemail, because "it's just a field behind
  // my house" settles `structures` on question six as well as it would have in the message.
  let extractionError: string | undefined;
  if (said) {
    const { extraction, error } = await extractFromSpeech(said, 'receptionist/intake-test');
    extractionError = error;
    state.facts = mergeExtraction(state.facts, extraction, said);
  }

  const now = Date.now();
  const step = nextStep(state, now);
  if (step.field && !state.asked.includes(step.field)) state.asked = [...state.asked, step.field];

  const next: IntakeState = { ...state, phase: step.phase };

  return NextResponse.json({
    say: step.say,
    end: Boolean(step.end),
    field: step.field ?? null,
    state: { phase: next.phase, facts: next.facts, asked: next.asked, declined: next.declined },
    // Everything the tester needs to see WHY it said what it said. Without this the bench is a
    // chat window, and the whole point is watching the decision rather than the sentence.
    debug: {
      elapsedMs: elapsedMs(state, now),
      budgetMs: CALL_BUDGET_MS,
      windDownMs: WIND_DOWN_MS,
      stillToAsk: openFields(next).map((f) => f.id),
      extractionError: extractionError ?? null,
    },
  });
}

/** The fixed lines, so the page can show exactly what every caller hears. */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ lines: intakeLines(), budgetMs: CALL_BUDGET_MS, windDownMs: WIND_DOWN_MS });
}
