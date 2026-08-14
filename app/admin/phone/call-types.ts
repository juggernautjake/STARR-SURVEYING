// app/admin/phone/call-types.ts — the shapes the phone screens read.
//
// Mirrors the columns app/api/admin/phone/calls returns. Kept in its own file so the list and the
// detail panel cannot drift into two slightly different ideas of what a call is.

export interface CallSummaryJson {
  summary?: string | null;
  caller?: string | null;
  wanted?: string | null;
  callbackNumber?: string | null;
  nextStep?: string | null;
  urgency?: 'routine' | 'soon' | 'urgent' | null;
  referencedJob?: string | null;
  isEmpty?: boolean;
}

export interface AdminCallRow {
  id: string;
  provider_call_sid: string | null;
  direction: 'inbound' | 'outbound' | string;
  status: string;
  from_number: string | null;
  to_number: string | null;
  caller_name: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  is_voicemail: boolean;
  voicemail_reason: string | null;
  recording_path: string | null;
  recording_seconds: number | null;
  transcript: string | null;
  transcript_status: string;
  summary: string | null;
  summary_json: CallSummaryJson | null;
  summary_status: string;
  job_id: string | null;
  matched_kind: string | null;
  matched_id: string | null;
  matched_label: string | null;
  handled_by: string | null;
  assigned_to: string | null;
  notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

/**
 * A US number as a person reads it.
 *
 * Falls back to the raw string rather than showing nothing: an unparseable number is still the only
 * record of who rang, and hiding it to keep the formatting tidy loses the actual information.
 */
export function formatPhone(e164: string | null): string {
  if (!e164) return 'Unknown';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

/** "3:42" — mm:ss, because call lengths are read in minutes and seconds, not "222 seconds". */
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A short, local, unambiguous timestamp. */
export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  // "Today" is what somebody scanning a queue wants; a date they have to compare to today's is not.
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

/** Why a call went to voicemail, in words rather than a status enum. */
export function voicemailReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'outside_hours': return 'after hours';
    case 'day_closed': return 'closed that day';
    case 'holiday': return 'holiday';
    case 'disabled': return 'calls were set to voicemail';
    case 'no_answer': return 'nobody answered';
    default: return 'voicemail';
  }
}

export const URGENCY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  soon: 'Soon',
  routine: 'Routine',
};
