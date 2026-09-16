// app/api/admin/receptionist-test/voice-sample/route.ts — hear a voice before switching to it.
//
//   GET ?voice=<voiceId>  → audio/mpeg of the receptionist's real first line in that voice
//
// The sample speaks what a caller actually hears, not a stock sentence, so the audition is the thing
// itself. Generated through the text-to-speech key (the Conversational AI key deliberately has no
// speech permissions) and cached in the running instance, so auditioning the same voice twice costs
// nothing the second time.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { agentVoiceById } from '@/lib/receptionist/agent-voices';
import { agentFirstMessage } from '@/lib/receptionist/agent-prompt';

export const dynamic = 'force-dynamic';

const cache = new Map<string, ArrayBuffer>();

const audioResponse = (audio: ArrayBuffer): NextResponse =>
  new NextResponse(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=3600' } });

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const voice = agentVoiceById(new URL(req.url).searchParams.get('voice'));
  if (!voice) return NextResponse.json({ error: 'Unknown voice.' }, { status: 400 });

  const cached = cache.get(voice.id);
  if (cached) return audioResponse(cached);

  const key = (process.env.ELEVENLABS_API_KEY ?? '').trim();
  if (!key) return NextResponse.json({ error: 'No ElevenLabs speech key on this deployment.' }, { status: 503 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    // flash_v2_5 for the sample: the agent speaks through the expressive model, which the
    // text-to-speech endpoint does not serve. Same voice, a shade less inflection.
    body: JSON.stringify({ text: agentFirstMessage(), model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 0.95 } }),
  });
  if (!res.ok) return NextResponse.json({ error: `Could not make the sample (HTTP ${res.status}).` }, { status: 502 });

  const audio = await res.arrayBuffer();
  if (cache.size > 40) cache.clear();
  cache.set(voice.id, audio);
  return audioResponse(audio);
}, { routeName: 'admin/receptionist-test/voice-sample' });
