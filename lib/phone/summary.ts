// lib/phone/summary.ts — slice T3 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"there is a summary created."*
//
// The pure half of that: building the prompt and reading the model's answer back. Kept separate from
// the call that spends money so the parsing can be tested exhaustively — the failure that matters
// here is not "the API was down", it is "the model returned something slightly different and we
// wrote nonsense into a business record".
//
// ── WHY THE OUTPUT IS STRUCTURED AND NOT A PARAGRAPH ────────────────────────────────────────────
//
// A prose summary reads well once and is useless in a list. The screen needs to show "what did they
// want" as a column across forty calls, and re-parsing a paragraph to get it is how you end up with
// a regex over model output. So the model is asked for fields, and the prose summary is one of them.
//
// ── AND WHY EVERY FIELD IS OPTIONAL ─────────────────────────────────────────────────────────────
//
// Most voicemails do not contain a callback number, a promise, or a deadline. A schema that demands
// them gets them invented — which is the specific failure that makes an AI summary worse than no
// summary, because a fabricated "they said Tuesday" is indistinguishable from a real one.

export interface CallSummary {
  /** Two or three sentences. The thing a person reads first. */
  summary: string;
  /** Who called, as best the transcript says. Null when they never said. */
  caller: string | null;
  /** What they wanted, in a few words — the list column. */
  wanted: string | null;
  /** A callback number IF SPOKEN in the message. Not the caller ID. */
  callbackNumber: string | null;
  /** Anything the caller was promised, or asked us to do. */
  nextStep: string | null;
  /** Whether this needs attention today. */
  urgency: 'routine' | 'soon' | 'urgent';
  /** A property, address or job number mentioned — the hook for filing it. */
  referencedJob: string | null;
  /** True when the transcript carries no real content (silence, a hang-up, a wrong number). */
  isEmpty: boolean;
}

export const SUMMARY_SYSTEM_PROMPT = `You summarise voicemails and recorded phone calls for a land-surveying firm's office staff.

Return ONLY what the transcript actually says. This summary is filed as a business record and acted
on by staff who will not listen to the audio, so an invented detail is worse than a missing one.

Rules:
- If the caller never gave their name, caller is null. Do not guess it from the transcript's tone or
  from a company name they mentioned.
- callbackNumber is a number the caller SPOKE ALOUD in the message. It is not the number they called
  from — that is already known and does not need extracting.
- nextStep is only what was explicitly asked for or promised. If the caller just left information,
  it is null.
- urgency: "urgent" only for a stated deadline, a closing date, a safety issue, or an explicit
  request to be called back today. "soon" for a live job or a waiting customer. Otherwise "routine".
  Most calls are routine, and marking everything urgent makes the field meaningless.
- referencedJob is any address, subdivision, property description or job number mentioned.
- If the recording contains no speech, or only noise, a hang-up or a wrong number, set isEmpty true
  and keep every other field null with a one-line summary saying so.`;

/** The user-side prompt. Metadata is labelled so the model does not mistake it for spoken content. */
export function buildSummaryPrompt(input: {
  transcript: string;
  fromNumber?: string | null;
  callerName?: string | null;
  durationSeconds?: number | null;
  isVoicemail?: boolean;
}): string {
  const lines: string[] = [];
  lines.push(input.isVoicemail ? 'This is a voicemail.' : 'This is a recorded phone call.');
  if (input.fromNumber) lines.push(`Caller ID number: ${input.fromNumber}`);
  if (input.callerName) lines.push(`Caller ID name: ${input.callerName}`);
  if (input.durationSeconds) lines.push(`Length: ${input.durationSeconds} seconds`);
  lines.push('', 'Transcript:', '"""', input.transcript.slice(0, 20_000), '"""');
  return lines.join('\n');
}

/** JSON Schema for the structured response. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    caller: { type: ['string', 'null'] },
    wanted: { type: ['string', 'null'] },
    callbackNumber: { type: ['string', 'null'] },
    nextStep: { type: ['string', 'null'] },
    urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'] },
    referencedJob: { type: ['string', 'null'] },
    isEmpty: { type: 'boolean' },
  },
  required: ['summary', 'urgency', 'isEmpty'],
  additionalProperties: false,
} as const;

/**
 * Whisper's hallucinations on silence.
 *
 * These are not a theory — a silent or noise-only recording reliably produces one of them, because
 * the model is trained to emit text and there is nothing to emit. They are longer than a length
 * heuristic can catch (`[BLANK_AUDIO]` survives any threshold short enough to keep "Call me back"),
 * so they are matched by name.
 */
const WHISPER_SILENCE_ARTEFACTS = [
  'blankaudio', 'inaudible', 'silence', 'nospeech', 'musicplaying', 'music',
  'thankyou', 'thanksforwatching', 'youyou', 'you', 'bye', 'thankyouforwatching',
  'subtitlesbytheamaraorgcommunity',
];

/** A transcript with nothing in it. Checked before spending anything on a model call. */
export function isBlankTranscript(transcript: string | null | undefined): boolean {
  if (!transcript) return true;
  const cleaned = transcript.replace(/[^a-z0-9]/gi, '').toLowerCase();
  // Anything under a handful of real characters is noise. "Call me back" is 10, so the threshold
  // stays low and the named artefacts above do the rest of the work.
  if (cleaned.length < 8) return true;
  return WHISPER_SILENCE_ARTEFACTS.includes(cleaned);
}

/** The summary used for a recording with no speech, without asking a model about it. */
export function emptyCallSummary(): CallSummary {
  return {
    summary: 'No message was left — the recording contains no speech.',
    caller: null,
    wanted: null,
    callbackNumber: null,
    nextStep: null,
    urgency: 'routine',
    referencedJob: null,
    isEmpty: true,
  };
}

/**
 * Read a model response into a `CallSummary`, however it came back.
 *
 * Tolerant on purpose. The model is asked for strict JSON and usually obliges, but a summary that
 * throws on a stray code fence loses a voicemail — and the voicemail is the thing of value, not the
 * formatting.
 */
export function parseCallSummary(raw: unknown): CallSummary | null {
  let obj: Record<string, unknown> | null = null;

  if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    obj = extractJsonObject(raw);
  }
  if (!obj) return null;

  const str = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    // Models spell absence as the word "null", "none", "n/a" or "unknown" surprisingly often, and
    // storing those literally puts the string "unknown" in a caller-name column.
    if (!t || /^(null|none|n\/a|na|unknown|not specified|not stated)$/i.test(t)) return null;
    return t;
  };

  const summary = str(obj.summary);
  if (!summary) return null; // Without the one required field there is nothing worth storing.

  const urgencyRaw = typeof obj.urgency === 'string' ? obj.urgency.toLowerCase().trim() : '';
  const urgency: CallSummary['urgency'] =
    urgencyRaw === 'urgent' || urgencyRaw === 'soon' ? urgencyRaw : 'routine';

  return {
    summary,
    caller: str(obj.caller),
    wanted: str(obj.wanted),
    callbackNumber: str(obj.callbackNumber),
    nextStep: str(obj.nextStep),
    urgency,
    referencedJob: str(obj.referencedJob),
    isEmpty: obj.isEmpty === true,
  };
}

/** Pull the first balanced JSON object out of text that may be fenced or prefaced. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    const direct = JSON.parse(trimmed);
    return direct && typeof direct === 'object' ? (direct as Record<string, unknown>) : null;
  } catch {
    // Fall through to scanning.
  }
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  // Brace-count rather than regex: a nested object or a brace inside a string breaks any regex that
  // tries to match to the last `}`.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(trimmed.slice(start, i + 1));
          return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** One line for a list row. */
export function summaryHeadline(s: CallSummary): string {
  if (s.isEmpty) return 'No message';
  return s.wanted ?? s.summary.split(/(?<=[.!?])\s/)[0] ?? s.summary;
}
