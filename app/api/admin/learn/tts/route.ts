// app/api/admin/learn/tts/route.ts
//
// POST /api/admin/learn/tts  { text, voice? }  → audio/mpeg
//
// Provider-agnostic text-to-speech for the AI tutor's read-aloud / conversation
// mode. Uses ElevenLabs when TTS_PROVIDER=elevenlabs (or only an ElevenLabs key
// is present), otherwise OpenAI. When NO provider key is configured it returns
// 503 so the client silently falls back to the free browser voice.
//
// Env:
//   OPENAI_API_KEY        + optional OPENAI_TTS_VOICE (default 'nova'), OPENAI_TTS_MODEL (default 'tts-1')
//   ELEVENLABS_API_KEY    + optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (default 'eleven_turbo_v2_5')
//   TTS_PROVIDER          'openai' | 'elevenlabs' (optional override)
//
// Auth: any signed-in user.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const maxDuration = 30;

const AUDIO_HEADERS = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' };

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: string; voice?: string } | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const input = text.slice(0, 4000);

  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const provider = (process.env.TTS_PROVIDER || '').toLowerCase();
  const useEleven = elevenKey && (provider === 'elevenlabs' || !openaiKey);

  try {
    if (useEleven) {
      const voiceId = body?.voice || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // "Rachel"
      // Optional native pronunciation dictionary (alias/phoneme rules) — a
      // persistent, tunable backstop for the in-app speakable normalizer. Set
      // ELEVENLABS_PRONUNCIATION_DICTIONARY_ID (and optionally _VERSION_ID) to
      // enable; absent → omitted, so behavior is unchanged until you add one.
      const dictId = process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_ID;
      const elevenBody: Record<string, unknown> = {
        text: input,
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
      };
      if (dictId) {
        elevenBody.pronunciation_dictionary_locators = [{
          pronunciation_dictionary_id: dictId,
          version_id: process.env.ELEVENLABS_PRONUNCIATION_DICTIONARY_VERSION_ID || 'latest',
        }];
      }
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey as string, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(elevenBody),
      });
      if (!r.ok) return NextResponse.json({ error: `ElevenLabs error ${r.status}` }, { status: 502 });
      return new NextResponse(await r.arrayBuffer(), { headers: AUDIO_HEADERS });
    }

    if (openaiKey) {
      const voice = body?.voice || process.env.OPENAI_TTS_VOICE || 'nova';
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'tts-1', voice, input, response_format: 'mp3' }),
      });
      if (!r.ok) return NextResponse.json({ error: `OpenAI error ${r.status}` }, { status: 502 });
      return new NextResponse(await r.arrayBuffer(), { headers: AUDIO_HEADERS });
    }

    // No premium provider configured — the client falls back to the browser voice.
    return NextResponse.json({ error: 'No premium TTS provider configured' }, { status: 503 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'TTS request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}, { routeName: 'admin/learn/tts#post' });
