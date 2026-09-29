-- seeds/663_phone_calls_outcome.sql — what actually happened to a call, with Twilio's own codes.
--
-- Owner, 2026-09-29: "It seems like for every single call that she answers, there is no response
-- and no transcription and no recording at all." Working that out took a day of serverless logs
-- (kept for one day) and a hand-written query. Four of the calls labelled as the receptionist's had
-- never reached her: the caller hung up while Hank's phone was ringing. The rest ended seconds into
-- her greeting. None of that was written down anywhere.
--
-- `outcome` is one of lib/receptionist/call-outcome.ts CallOutcomeKind:
--   hung-up-while-holding | hung-up-before-agent | agent-no-connect | agent-ended-early
--   | caller-left-agent-early | agent-completed
-- `outcome_detail` carries Twilio's DialCallStatus, DialCallDuration, CallStatus,
-- DialSipResponseCode and ErrorCode as they arrived.
--
-- Written by a SEPARATE update from every other column (recordOutcome), so a deployment that runs
-- before this is applied loses only the outcome, never the rest of the row. Additive and nullable:
-- safe to apply at any time, and safe to apply twice.

BEGIN;

ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.phone_calls ADD COLUMN IF NOT EXISTS outcome_detail jsonb;

CREATE INDEX IF NOT EXISTS idx_phone_calls_outcome ON public.phone_calls (outcome) WHERE outcome IS NOT NULL;

COMMIT;
