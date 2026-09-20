// lib/receptionist/intake-extract.ts — reading facts out of what the caller actually said.
//
// Owner, 2026-09-21: "Once they have said their message, the AI will evaluate what they say in real
// time. Then it will determine if there is any information that might be useful that they did not
// provide in their message."
//
// ── THE MODEL REPORTS CONFIDENCE, AND THAT IS THE WHOLE INTERFACE ───────────────────────────────
//
// Extraction that returns only values is useless here, because the decision this feeds is not "what
// did they say" but "do I need to ask". A name extracted at 40% certainty and a name extracted at
// 98% lead to completely different calls: one gets spelled back, the other does not.
//
// So the tool schema demands a confidence for every field, and `mergeExtraction` turns the number
// into the three states `intake.ts` reasons about. The thresholds live here, in one place, with the
// reasoning next to them.
//
// ── THE MODEL IS NEVER ASKED TO DECIDE WHAT TO ASK ──────────────────────────────────────────────
//
// It reads; `intake.ts` decides. That split is deliberate. A model asked to run the interview will
// occasionally skip the phone number, or ask for the address twice, or decide on its own that
// seven minutes is a guideline — and none of those failures are reproducible or testable. A model
// asked only "what did you hear, and how sure are you" is doing the one job it is better at than
// code, and everything downstream of it is a pure function somebody can read.
//
// The merge is pure and tested. The call is a thin wrapper around it.

import { callAi, aiConfigured } from '@/lib/ai/client';
import {
  impliedFrom, needsSpelling, COMMON_FIRST_NAMES, COMMON_LAST_NAMES,
  type FieldId, type IntakeFacts, type FieldValue,
} from './intake';

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE MODEL HANDS BACK
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ExtractedField {
  value: string;
  /** 0 to 1. How sure the model is that this is what was said AND that it is spelled right. */
  confidence: number;
}

export type Extraction = Partial<Record<FieldId, ExtractedField>>;

/**
 * Above this, a value is taken as heard and never queried.
 *
 * 0.85 rather than something higher because every field also passes the `needsSpelling` check
 * below, which is the real guard on names. Setting this at 0.95 would send confident, ordinary
 * answers back for confirmation and make the call twice as long for no gain.
 */
export const CONFIDENT = 0.85;

/**
 * Below this, a value is not worth confirming — it is treated as never having been said.
 *
 * Reading back a guess this poor is worse than asking cleanly. "Did you say your name was
 * Bachmann?" when they said something else entirely wastes a turn and makes the agent sound like
 * it was not listening.
 */
export const TOO_VAGUE = 0.35;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// TURNING A NUMBER INTO A DECISION
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Merge what the model heard into what we already know.
 *
 * Existing `known` facts win. A later turn may IMPROVE a field (they spelled their name, so it goes
 * from `unsure` to `known`) but it may never downgrade one: a caller who has already confirmed
 * their number must not be asked again because a later mumble scored low.
 *
 * Pure. Tested in __tests__/twilio/intake-extract.test.ts.
 */
export function mergeExtraction(
  facts: IntakeFacts,
  extraction: Extraction,
  spokenText: string,
): IntakeFacts {
  const out: IntakeFacts = { ...facts };

  for (const [key, got] of Object.entries(extraction) as Array<[FieldId, ExtractedField]>) {
    if (!got || typeof got.value !== 'string') continue;
    const value = got.value.trim();
    if (!value) continue;

    const existing = out[key];
    // Never downgrade. A field already settled stays settled.
    if (existing && (existing.confidence === 'known' || existing.confidence === 'refused')) continue;

    const score = Number(got.confidence);
    if (!Number.isFinite(score) || score < TOO_VAGUE) continue;

    let confidence: FieldValue['confidence'] = score >= CONFIDENT ? 'known' : 'unsure';

    // Names get the extra check, because a confidently-transcribed unusual name is still a name
    // nobody has spelled. This is the owner's "if their last name is something weird" rule, and it
    // is applied to the EXTRACTION rather than left to the interview, so the interview only ever
    // sees three clean states.
    if (key === 'firstName' && needsSpelling(value, score >= CONFIDENT, COMMON_FIRST_NAMES)) {
      confidence = 'unsure';
    }
    if (key === 'lastName' && needsSpelling(value, score >= CONFIDENT, COMMON_LAST_NAMES)) {
      confidence = 'unsure';
    }
    // An email is spelled back unless the model was very sure, because one wrong character makes it
    // undeliverable and nobody finds out until the estimate never arrives.
    if (key === 'email' && score < 0.95) confidence = 'unsure';

    out[key] = { value, confidence, source: 'heard' };
  }

  // What their words settle without anyone asking. Applied AFTER the extraction so an explicit
  // answer always beats an inference drawn from the same sentence.
  for (const imp of impliedFrom(spokenText)) {
    const existing = out[imp.field];
    if (existing && existing.confidence !== 'missing') continue;
    out[imp.field] = { value: imp.value, confidence: 'implied', source: imp.because };
  }

  return out;
}

/** Everything still worth asking about, as a plain list — for the test bench and the call record. */
export function outstanding(facts: IntakeFacts): FieldId[] {
  const ids = Object.keys(facts) as FieldId[];
  return ids.filter((id) => {
    const f = facts[id];
    return !f || f.confidence === 'missing' || f.confidence === 'unsure';
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE MODEL CALL
// ════════════════════════════════════════════════════════════════════════════════════════════════

const FIELD_GUIDE = `
firstName        the caller's given name, as spoken
lastName         the caller's family name, as spoken
phone            a callback number; digits only if you can
email            an email address
callerRole       owner, title company, realtor, land developer, builder, attorney, family member, other
propertyAddress  street address, or as much of the location as they gave (a city alone counts)
acreage          the size, as they said it ("about two acres", "half an acre", "a quarter section")
structures       what is on the land, or "none" if they said it is vacant
surveyType       boundary, ALTA, topographic, elevation certificate, lot split, staking, "not sure"
surveyPurpose    what it is for: fence, sale, loan, building permit, dispute, subdivision
documents        what paperwork they have: plat, deed, previous survey, title commitment, or "none"
`.trim();

export const EXTRACT_TOOL = {
  name: 'record_what_you_heard',
  description:
    'Record the facts the caller stated, with an honest confidence for each. Only include a field '
    + 'the caller actually addressed. Do not guess, do not infer a value from what is typical, and '
    + 'do not fill a field because it seems useful to have.',
  input_schema: {
    type: 'object' as const,
    properties: Object.fromEntries(
      ([
        'firstName', 'lastName', 'phone', 'email', 'callerRole',
        'propertyAddress', 'acreage', 'structures', 'surveyType', 'surveyPurpose', 'documents',
      ] as FieldId[]).map((id) => [id, {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'What the caller said, tidied but not invented.' },
          confidence: {
            type: 'number',
            description:
              '0 to 1. How sure you are BOTH that this is what they said and that the spelling is '
              + 'right. A name you heard clearly but could spell two ways is not above 0.8.',
          },
        },
        required: ['value', 'confidence'],
      }]),
    ),
  },
};

const SYSTEM = `You are reading a transcript of what somebody said to a land surveying company's
answering service. Record only what they actually stated.

${FIELD_GUIDE}

Rules that matter more than completeness:

· Leave a field out entirely rather than guess at it. A missing field gets asked; a wrong one does
  not, and ends up on a quote.
· Confidence is about the SPELLING as much as the words. "Smith" heard clearly is 0.95. An unusual
  surname heard clearly is not above 0.7, because you cannot know how it is written.
· A city with no street address still goes in propertyAddress. Partial location is useful.
· If they say the property is vacant, empty, raw or open land, that is structures: "none".
· Never put a value in a field the caller did not address, even if it seems obvious.`;

export interface ExtractResult {
  extraction: Extraction;
  /** Present when the model could not be reached; the caller is then simply asked everything. */
  error?: string;
}

/**
 * Ask the model what it heard.
 *
 * Failure is NOT thrown. A model outage during a phone call must degrade into asking the caller
 * every question, which is a worse call and still a working one — throwing here would drop a
 * customer mid-sentence.
 */
export async function extractFromSpeech(text: string, surface = 'receptionist/intake'): Promise<ExtractResult> {
  if (!text.trim()) return { extraction: {} };
  if (!aiConfigured()) return { extraction: {}, error: 'AI is not configured' };

  try {
    const res = await callAi({
      // 'extraction', not 'voice'. The voice tier is tuned for a model that is about to speak
      // into a live call, where every second is dead air. This runs while the caller is finishing
      // their message, so it can afford the tier that is actually good at pulling structured
      // fields out of prose — which is the whole job here.
      role: 'extraction',
      surface,
      system: SYSTEM,
      cacheSystem: true,
      maxTokens: 1024,
      messages: [{ role: 'user', content: `Transcript:\n\n${text}` }],
      tools: [EXTRACT_TOOL],
      toolChoice: { type: 'tool', name: EXTRACT_TOOL.name },
    });

    const block = res.message?.content?.find((c) => c.type === 'tool_use');
    if (!block || block.type !== 'tool_use') return { extraction: {} };
    return { extraction: (block.input ?? {}) as Extraction };
  } catch (err) {
    console.error('[intake] extraction failed — the caller will be asked everything:', err);
    return { extraction: {}, error: err instanceof Error ? err.message : String(err) };
  }
}
