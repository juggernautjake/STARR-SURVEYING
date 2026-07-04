# AI tutor — premium (natural) voice output

> **Created** 2026-07-03. Self-editing plan. Branch `claude/sit-prep-buildout-2026-07-02`.
> Builds on the shipped tutor voice (browser Web Speech). User picked a
> **provider-agnostic** build: OpenAI **or** ElevenLabs via one adapter, defaulting
> to OpenAI, with automatic fallback to the free browser voice when no key is set.

## Goal
Replace the robotic browser TTS with a natural cloud voice **when a provider key
is configured**, transparently — the tutor's read-aloud + conversation mode use it
if available and silently fall back to `speechSynthesis` otherwise. No behavior
change until a key is added; the student never sees an error.

## Design
- **Route** `POST /api/admin/learn/tts` `{ text, voice? }` → `audio/mpeg` bytes.
  Adapter: if `TTS_PROVIDER=elevenlabs` (or only an ElevenLabs key exists) →
  ElevenLabs `/v1/text-to-speech/{voice}`; else if `OPENAI_API_KEY` → OpenAI
  `/v1/audio/speech` (model `tts-1`, voice `nova`). No key → **503** so the client
  falls back. Auth = any signed-in user; text clipped to ~4k chars.
- **Client** (`DeeperLearningTutor.speakText`): try the route first → play the mp3
  via an `Audio` element (its `onended` drives conversation-mode auto-listen); on
  503/error/blocked-autoplay → browser `speechSynthesis`. Cache availability after
  the first try to avoid repeat 503s. `stopSpeaking()` stops both audio + synth.
- **Env (documented)**: `OPENAI_API_KEY` (+ optional `OPENAI_TTS_VOICE`,
  `OPENAI_TTS_MODEL`) or `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`,
  `ELEVENLABS_MODEL`, `TTS_PROVIDER=elevenlabs`).

## Slices
| # | What | Status |
|---|---|---|
| **TTS1** | `POST /api/admin/learn/tts` provider-agnostic route (OpenAI + ElevenLabs adapter; 503 when unconfigured). | **DONE** — OpenAI+ElevenLabs adapter; 503 when unconfigured |
| **TTS2** | Client: premium-first `speakText` with browser fallback + availability cache; `stopSpeaking` stops audio too; conversation-mode `onended` wiring. | **DONE** — premium-first speakText, browser fallback, availability cache |
| **TTS3** | Document env vars (`.env.example` / route header) + note the tradeoffs. | **DONE** — .env.example documents both providers |
