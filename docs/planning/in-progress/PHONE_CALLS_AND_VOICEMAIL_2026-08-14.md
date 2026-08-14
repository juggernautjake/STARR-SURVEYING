# The business phone: recorded, transcribed, summarised, and answerable from the app

**Started 2026-08-14. Active.**

Owner, 2026-08-14:

> *"I want to make it so that when business calls come through, they are transcribed and recorded and
> there is a summary created. I want to be able to set the hours for calling and if calls come outside
> of the specified hours, they go to voice mail. I want a clean and easy way to call customers back
> from the app from the number from twilio on the app. I want it so that we can assign calls to
> specific jobs, or we can use a call to create a new job."*

Five things. Two of them are mostly plumbing over machinery that already exists, two are genuinely
new, and one is a decision the owner has to make before any of it is worth building.

---

## What is actually there today

Measured 2026-08-14 against the code, the seeds and `.env.local`.

| Thing | State |
|---|---|
| Twilio npm package | **Not installed.** Neither root nor `worker/`. Both existing integrations are hand-rolled `fetch` against the REST API. |
| Twilio credentials | **Present** in `.env.local` and `.env.vercel.local`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. |
| Twilio SMS | Two independent adapters — `lib/saas/notifications/sms.ts` and `worker/src/services/notification-service.ts`. **Neither has ever sent a message** (see below). |
| Twilio Voice | Nothing. No TwiML, no `<Say>`/`<Dial>`/`<Record>`, no voice webhook route. |
| Call / voicemail tables | **None.** No `calls`, `call_log`, `voicemails`, `call_recordings` anywhere in 396 seed files. |
| Speech-to-text | **Real and working** — `worker/src/services/voice-transcription.ts`, OpenAI Whisper, over field voice memos in the `starr-field-voice` bucket, with per-call cost tracking. |
| AI summarisation | `lib/ai/client.ts` → `callAi({ role, surface, system, messages })`, Anthropic, `claude-opus-5`. |
| Business hours | **Nothing stored.** `AFTER_HOUR = 18` is a constant in one cron route; the public hours are static JSX on `/contact`. |
| Settings storage | `app_settings` (key → JSONB) exists. `ALLOWED_KEYS` is `{ general, company }` — anything else 400s. |
| Phone-number storage | `leads.phone`, `contacts.phone`, `jobs.client_phone`, `customers.primary_phone` (+ `phone_sha256`), `organizations.phone`. **`registered_users` has no phone column.** |

### Three things that will bite immediately

**1. The env var name does not match the code.** Every code path reads **`TWILIO_FROM_NUMBER`**;
`.env.local` defines **`TWILIO_PHONE_NUMBER`**. So even with valid credentials the SMS adapter takes
its "no creds configured" branch — and that branch **returns `true`**, i.e. it reports success
without sending. Any voice work that copies that pattern inherits a silent no-op.

**2. Nothing has ever actually sent an SMS**, so "the Twilio integration works" is untested in the
strongest sense. The channel is registered, but the dispatch guard requires a `smsTemplate` on the
event definition and a `phone` on the recipient; **no event defines one and no recipient carries
one**. Voice cannot lean on any of it as proven.

**3. Whisper runs on the droplet, not on Vercel.** `OPENAI_API_KEY` is **not** in `.env.local` —
the transcription pipeline is a worker concern. So "transcribe the call" cannot simply be called
from a Next route today. That is decision **D2** below and it needs the owner.

---

## Decisions to take before building

### D1 — A Twilio webhook is a public URL, so its signature is not optional

`/api/twilio/*` will be reachable by anyone who guesses it. Without verifying the
`X-Twilio-Signature` header, anybody can POST a fabricated call: create call records, trigger
callbacks, and cause outbound dials on the firm's account. Every Twilio-facing route validates the
signature against `TWILIO_AUTH_TOKEN` before it does anything, and **P0 ships that helper first** —
not as a later hardening pass, because the window between "the webhook works" and "the webhook is
verified" is the window in which it is live and open.

### D2 — Where transcription runs is the owner's call ⚠️ **BLOCKING for P2**

Three real options, and this plan does not pick one silently:

| Option | Cost | What it needs | Trade-off |
|---|---|---|---|
| **Whisper on the worker** (reuse `voice-transcription.ts`) | ~$0.006/min | Nothing new — the droplet already has the key and the batch runner | Transcripts arrive on the worker's polling cadence, not instantly |
| **Whisper from Vercel** | same | `OPENAI_API_KEY` added to Vercel | Duplicates a pipeline that already exists |
| **Twilio Voice Intelligence** | ~$0.05/min | A Twilio add-on enabled | No new vendor key, arrives as a webhook; ~8× the cost |

**Recommendation: reuse the worker.** It exists, it tracks cost, and the owner is not waiting on a
transcript in real time — the point of this feature is reading it later. A call recording lands in a
bucket and the existing batch picks it up.

### D3 — Calling back: the bridge, not the browser

Two ways to place an outbound call showing the Twilio number:

- **Dial-me-first bridge** — the app asks Twilio to ring *your* phone; when you answer, Twilio dials
  the customer and joins you. The customer sees the business number. Works on a truck, on any
  handset, with no app permissions and no WebRTC.
- **In-browser calling** — the Twilio Voice SDK, access tokens, a TwiML App, microphone permission,
  and a browser tab that must stay open.

**v1 is the bridge.** It is a single REST call, it works from the field, and it does not require the
person to be at a desk. Browser calling is a later slice if the office wants a headset.

### D4 — Business hours are data, not a constant

`AFTER_HOUR = 18` in a cron route is not "set the hours for calling". Hours go in `app_settings`
under a new `phone` key (which means adding it to `ALLOWED_KEYS` — the table itself needs no
migration), as per-weekday open/close in **America/Chicago**, plus a holiday list and an
after-hours greeting.

The rule that decides open-vs-closed is a **pure function with tests**, because every one of its
edge cases is a silent wrong answer: a call at 4:59pm on a day that closes at 5, a Saturday with no
row, a holiday, and the two days a year when the clocks move.

### D5 — Say that the call is recorded

Texas is a one-party-consent state, so recording a call the firm is party to is lawful without an
announcement. It is still announced, for two reasons that are not legal: callers from two-party
states exist, and a recording nobody was told about is the kind of thing that becomes a problem
exactly once. It is one line of TwiML and it removes the question.

### D6 — A call is a first-class record, not a note on a job

`calls` is its own table. A call exists before anybody knows which job it belongs to — that is the
whole point of *"we can use a call to create a new job"* — so it cannot start life as a child of
one. It is linked to a job afterwards, or a job is created from it, and the link is nullable
throughout.

### D7 — Match the caller to who we already know, by E.164

An inbound number is only useful if it resolves to a lead, a contact or a customer. Four different
phone helpers exist in this repo and they disagree; `normalizePhone` in
`lib/integrations/google/hash.ts` is the real canonicaliser (US-assumed, returns **null** rather
than guessing). Matching uses that one, and the match is a *suggestion* the office confirms —
`jobs.client_phone` is free text and two people share a number more often than you would like.

---

## Group P0 — foundations

### P0a — Reconcile the credentials and prove them
Settle on **one** env var name, fix the two adapters, and add a health probe that reports whether
voice is actually configured — modelled on `/api/admin/receipts/ai-health`, which is the pattern in
this repo for "can this deployment do the thing at all". Remove the dev short-circuit that returns
success without sending.

**Done when:** a single admin screen says truthfully whether calls can be received and placed.

### P0b — Signature verification (D1)
A tested helper that validates `X-Twilio-Signature` over the exact URL and body Twilio signed.

**Done when:** an unsigned or wrongly-signed POST to any `/api/twilio/*` route is rejected, and a
correctly-signed one is not.

### P0c — The schema
`calls` (direction, from/to in E.164, status, started/answered/ended, duration, recording path,
transcript, summary, `job_id`, `lead_id`, `contact_id`, handled-by, voicemail flag), plus
`call_events` for the raw webhook trail — because reconstructing why a call did what it did, months
later, from a single mutable row is not possible.

**Done when:** a call can be recorded end to end in the database with nothing hand-written.

---

## Group I — inbound

### I1 — Business hours, stored and editable (D4)
The `phone` settings key, a pure `isOpenAt(when, hours)` with tests, and a screen to set it.

### I2 — Answer the call
The voice webhook: announce recording (D5), and inside hours ring the office; outside hours go
straight to the greeting and record.

### I3 — Voicemail
Record, store in a bucket (`starr-field-*` naming), register the call, notify.

**Done when:** a call at 9pm reaches voicemail, and the office is told about it.

---

## Group T — transcript and summary

### T1 — Get the recording into our storage
Twilio holds recordings; we fetch and store our own copy so the record survives the account.

### T2 — Transcribe (D2 — **blocked on the owner's choice**)

### T3 — Summarise
`callAi` over the transcript: what was wanted, who it was, what was promised, what to do next.
Structured, so "what did they ask for" is a field and not a paragraph to re-read.

**Done when:** a voicemail left overnight is readable as three lines the next morning.

---

## Group S — the screens

### S1 — The calls list
Filter by direction, by date, by whether it is voicemail, by job, by who handled it. Search the
transcript.

### S2 — One call
Player, transcript, summary, who it matched to, and the actions: assign to a job, create a job,
call back.

### S3 — Call back (D3)
One button. Confirms which of your numbers to ring first.

---

## Group L — link it to the work

### L1 — Assign a call to a job
### L2 — Create a job from a call
Prefilled from the summary and the matched contact — the same shape as the lead → job conversion,
which already carries contacts, quote and attachments across.

### L3 — Tell the right people
A new `JobEventKind` (`call_linked`), which is the whole cost of notifying about it.

---

## Ledger

| Slice | State |
|---|---|
| P0a Credentials + health | ⬜ |
| P0b Signature verification | ⬜ |
| P0c Schema | ⬜ |
| I1 Business hours | ⬜ |
| I2 Answer | ⬜ |
| I3 Voicemail | ⬜ |
| T1 Store the recording | ⬜ |
| T2 Transcribe | ⛔ blocked on D2 |
| T3 Summarise | ⬜ |
| S1 Calls list | ⬜ |
| S2 One call | ⬜ |
| S3 Call back | ⬜ |
| L1 Assign to a job | ⬜ |
| L2 Create a job | ⬜ |
| L3 Notify | ⬜ |

**Order:** P0 first and completely — a webhook without signature verification is a live open door.
Then I1–I3, which is the owner's most concrete ask and works with no AI at all. T after that. S and L
last, over data that already exists.

**Owner actions this needs:** a Twilio number configured to point its Voice webhook at the deployed
URL, the D2 transcription decision, and the office phone number(s) to ring.
