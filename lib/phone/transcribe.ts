// lib/phone/transcribe.ts — slices T2/T3 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Turning a stored recording into a transcript and then a summary.
//
// ── D2, RESOLVED AS AN ADAPTER RATHER THAN A DECISION ───────────────────────────────────────────
//
// The plan called "where does transcription run" a blocking decision: the worker owns
// OPENAI_API_KEY and a Whisper batch runner, the Vercel app does not. Treating that as blocking
// would park a finished recording pipeline behind a preference.
//
// So it is a capability check, not a choice. If `OPENAI_API_KEY` is present here, the transcript is
// produced in-process. If it is not, the call is left `queued` with its `recording_path` set, which
// is exactly the shape the worker already polls for. Both paths write the same columns, so nothing
// downstream knows which ran — and the owner's decision becomes "set the key in Vercel or don't"
// instead of a code change.
//
// The default with nothing configured is the worker, which is what D2 recommended.
//
// ── WHY THE TWO STAGES ARE SEPARATE ─────────────────────────────────────────────────────────────
//
// Transcription can succeed while summarisation fails, and re-running a $0.006 Whisper call because
// a model call 502'd is paying twice for work that already succeeded. `transcript_status` and
// `summary_status` move independently for exactly that reason.
import { supabaseAdmin } from '@/lib/supabase';
import { callAi, aiConfigured } from '@/lib/ai/client';
import { CALL_RECORDING_BUCKET } from './calls';
import { notifyVoicemail } from './notify';
import {
  SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt, parseCallSummary,
  isBlankTranscript, emptyCallSummary, type CallSummary,
} from './summary';

/** Whisper bills per second; this is the published rate at $0.006/minute. */
const WHISPER_CENTS_PER_SECOND = 0.01;
const WHISPER_MODEL = process.env.STARR_FIELD_WHISPER_MODEL ?? 'whisper-1';

/** Can this deployment produce a transcript itself, or must it defer to the worker? */
export function canTranscribeInProcess(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export interface TranscribeResult {
  status: 'done' | 'queued' | 'failed' | 'skipped';
  transcript?: string | null;
  summary?: CallSummary | null;
  costCents?: number;
  detail?: string;
}

/**
 * Transcribe one call's recording and summarise it.
 *
 * Returns `queued` — not an error — when this deployment cannot transcribe. That is a normal,
 * expected outcome meaning "the worker will do it", and reporting it as a failure would light up an
 * error screen for a correctly configured system.
 */
export async function transcribeCall(callId: string): Promise<TranscribeResult> {
  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('id, provider_call_sid, recording_path, recording_seconds, from_number, caller_name, is_voicemail, transcript, summary_status')
    .eq('id', callId)
    .maybeSingle();

  if (error || !data) return { status: 'failed', detail: 'No such call.' };
  const call = data as {
    id: string; recording_path: string | null; recording_seconds: number | null;
    from_number: string | null; caller_name: string | null; is_voicemail: boolean;
    transcript: string | null; summary_status: string;
  };

  // A call that already had a summary is being RE-read, which means somebody is looking at it right
  // now. Sending the alert again would notify the whole office because one person pressed a button.
  const alreadyNotified = call.summary_status === 'done';

  if (!call.recording_path) return { status: 'skipped', detail: 'This call has no recording.' };

  // An existing transcript is reused rather than re-bought. Re-running the summary over it is
  // cheap and is the usual reason somebody asks for a re-run.
  let transcript = call.transcript ?? null;
  let costCents = 0;

  if (!transcript) {
    if (!canTranscribeInProcess()) {
      await supabaseAdmin.from('calls').update({ transcript_status: 'queued' }).eq('id', callId);
      return { status: 'queued', detail: 'Left for the worker, which holds the transcription key.' };
    }
    const got = await runWhisper(call.recording_path, call.recording_seconds ?? null);
    if (got.error) {
      await supabaseAdmin.from('calls').update({ transcript_status: 'failed' }).eq('id', callId);
      return { status: 'failed', detail: got.error };
    }
    transcript = got.text ?? '';
    costCents += got.costCents;
  }

  const summary = await summariseTranscript(transcript, {
    fromNumber: call.from_number,
    callerName: call.caller_name,
    durationSeconds: call.recording_seconds,
    isVoicemail: call.is_voicemail,
  });

  await supabaseAdmin
    .from('calls')
    .update({
      transcript,
      transcript_status: 'done',
      transcript_cost_cents: costCents || null,
      summary: summary?.summary ?? null,
      summary_json: summary ?? null,
      summary_status: summary ? 'done' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', callId);

  // The alert goes out now rather than when the call was picked up, so it can carry what the caller
  // actually wanted instead of just a number. See lib/phone/notify.ts.
  if (call.is_voicemail && !alreadyNotified) {
    await notifyVoicemail({
      callId,
      fromNumber: call.from_number,
      callerName: call.caller_name,
      summary,
    });
  }

  return { status: 'done', transcript, summary, costCents };
}

/** Summarise a transcript. Never throws — a failed summary must not lose the transcript. */
export async function summariseTranscript(
  transcript: string,
  meta: { fromNumber?: string | null; callerName?: string | null; durationSeconds?: number | null; isVoicemail?: boolean },
): Promise<CallSummary | null> {
  // Silence is answered without a model call. See `isBlankTranscript`.
  if (isBlankTranscript(transcript)) return emptyCallSummary();
  if (!aiConfigured()) return null;

  try {
    const result = await callAi({
      role: 'extraction',
      surface: 'phone/call-summary',
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `${buildSummaryPrompt({ transcript, ...meta })}\n\n` +
            'Reply with a single JSON object and nothing else, with keys: summary, caller, wanted, ' +
            'callbackNumber, nextStep, urgency, referencedJob, isEmpty.',
        },
      ],
      maxTokens: 1024,
    });
    return parseCallSummary(result.text);
  } catch (err) {
    console.error('[phone/transcribe] summary failed', err);
    return null;
  }
}

/** Fetch the stored audio and send it to Whisper. */
async function runWhisper(
  path: string,
  seconds: number | null,
): Promise<{ text?: string; costCents: number; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(CALL_RECORDING_BUCKET).download(path);
    if (error || !data) return { costCents: 0, error: `Could not read the recording: ${error?.message ?? 'missing'}` };

    const form = new FormData();
    form.append('file', new Blob([await data.arrayBuffer()], { type: 'audio/mpeg' }), 'call.mp3');
    form.append('model', WHISPER_MODEL);
    // English is pinned rather than auto-detected: on a noisy or near-silent recording, language
    // detection is where Whisper invents a sentence in another language, which then gets summarised
    // as though somebody said it.
    form.append('language', 'en');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      return { costCents: 0, error: `Transcription service replied ${res.status}.` };
    }
    const body = (await res.json()) as { text?: string };
    return {
      text: body.text ?? '',
      costCents: seconds ? Number((seconds * WHISPER_CENTS_PER_SECOND).toFixed(4)) : 0,
    };
  } catch (err) {
    return { costCents: 0, error: `Transcription failed: ${(err as Error).message}` };
  }
}
