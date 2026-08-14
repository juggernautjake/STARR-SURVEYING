// lib/phone/notify.ts — slice L3 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Telling somebody a voicemail arrived.
//
// ── WHY THIS IS NOT `notifyJobEvent` ────────────────────────────────────────────────────────────
//
// That notifier routes to a job's crew and lead surveyor. A new voicemail has no job — that is the
// entire premise of the feature — so there is no crew to route to. It goes to the admins, who are
// the people who answer the phone.
//
// ── IT NOTIFIES AFTER THE SUMMARY, NOT ON PICK-UP ───────────────────────────────────────────────
//
// A notification saying "voicemail from +15125550143" is a prompt to go and listen to something.
// One saying "Mary Smith wants a boundary survey before her closing on the 30th" is the actual
// information, and it arrives on a phone. Waiting the extra few seconds for the summary is what
// makes the alert worth receiving — so this is called after transcription, not from the webhook.
//
// The exception is a call the AI could not read: those still notify, with what is known, because a
// voicemail nobody is told about is strictly worse than an unhelpful alert.
import { supabaseAdmin } from '@/lib/supabase';
import { notifyMany } from '@/lib/notifications';
import { formatPhoneForHumans } from './format';
import type { CallSummary } from './summary';

/** Everyone who should hear about a new message. */
async function phoneAdmins(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('email, roles, status')
    .eq('status', 'approved');
  if (error || !data) return [];
  return (data as Array<{ email: string; roles: string[] | null }>)
    .filter((u) => Array.isArray(u.roles) && u.roles.includes('admin'))
    .map((u) => u.email)
    .filter(Boolean);
}

export interface VoicemailNotice {
  callId: string;
  fromNumber: string | null;
  callerName: string | null;
  summary: CallSummary | null;
}

/**
 * Tell the office about a voicemail. Never throws — a notification failure must not roll back a
 * transcript that succeeded.
 */
export async function notifyVoicemail(notice: VoicemailNotice): Promise<{ notified: number }> {
  try {
    const admins = await phoneAdmins();
    if (admins.length === 0) return { notified: 0 };

    const who =
      notice.summary?.caller ??
      notice.callerName ??
      formatPhoneForHumans(notice.fromNumber);

    // An empty recording is announced as such rather than dressed up with a summary of nothing.
    const body = notice.summary?.isEmpty
      ? 'The recording had no message in it.'
      : notice.summary?.summary ?? 'A voicemail was left. No summary is available yet.';

    // Urgency maps to the escalation the push layer already understands, so an urgent message can
    // break through where a routine one waits.
    const escalation =
      notice.summary?.urgency === 'urgent' ? 'high'
        : notice.summary?.urgency === 'soon' ? 'normal'
          : 'low';

    await notifyMany(admins, {
      type: 'voicemail',
      title: `Voicemail from ${who}`,
      body,
      icon: 'voicemail',
      link: `/admin/phone?call=${notice.callId}`,
      source_type: 'call',
      source_id: notice.callId,
      escalation_level: escalation,
      // One thread per call, so a re-run summary updates the conversation rather than adding a
      // second alert about the same message.
      thread_id: `call:${notice.callId}`,
    });

    return { notified: admins.length };
  } catch (err) {
    console.error('[phone/notify] could not notify about a voicemail', err);
    return { notified: 0 };
  }
}
