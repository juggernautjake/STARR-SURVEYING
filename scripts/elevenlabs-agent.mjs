// scripts/elevenlabs-agent.mjs — create or update the ElevenLabs receptionist agent (owner, 2026-09-15).
//
//   node scripts/elevenlabs-agent.mjs --check          what the key can do, what already exists
//   node scripts/elevenlabs-agent.mjs --apply          create or update the agent from our own prompt
//   node scripts/elevenlabs-agent.mjs --apply --voice <voiceId> --model <llm>
//   node scripts/elevenlabs-agent.mjs --sip +18338426971   register a SIP number and print its inbound URI
//
// WHY A SCRIPT AND NOT THE DASHBOARD: the prompt is 20 KB assembled from lib/receptionist/* — the
// firm's services, the land-law situations and the verbatim statute excerpts. Pasted into a web form
// it becomes a second copy that drifts the first time anything changes. Here it is generated from the
// same modules the other two call paths use, so "what the agent knows" has exactly one source.
//
// The key needs Conversational AI read+write. A text-to-speech key returns 401 "missing_permissions".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = readEnv(path.join(root, '.env.local'));
const KEY = process.env.ELEVENLABS_CONVAI_KEY || env.ELEVENLABS_CONVAI_KEY || process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || '';
const API = 'https://api.elevenlabs.io';
const AGENT_NAME = 'Starr Surveying receptionist (Ellie)';

// Defaults chosen from the 2026-09-15 research: the expressive realtime model, a warm female voice,
// and Claude as the brain. All three are overridable from the command line.
const DEFAULTS = {
  voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Sarah — warm, unhurried
  ttsModel: 'eleven_v3_conversational',                              // Expressive Mode
  llm: 'claude-sonnet-4-5',
  retentionDays: 30,
};

function readEnv(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  } catch { return {}; }
}

async function api(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, json };
}

/** The prompt, built by the app itself so there is one source of truth. */
async function buildPrompt() {
  const out = path.join(root, '.next', 'cache', 'elevenlabs-prompt.json');
  const { execFileSync } = await import('node:child_process');
  // tsx runs the TypeScript modules directly; they import only pure data files.
  const script = `
    import { agentPrompt, agentFirstMessage, AGENT_KEYWORDS } from './lib/receptionist/agent-prompt';
    import fs from 'node:fs';
    fs.mkdirSync(${JSON.stringify(path.dirname(out))}, { recursive: true });
    fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({ prompt: agentPrompt(), first: agentFirstMessage(), keywords: [...AGENT_KEYWORDS] }));
  `;
  const tmp = path.join(root, '_agent-prompt.build.ts');
  fs.writeFileSync(tmp, script);
  try {
    execFileSync('npx', ['tsx', tmp], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function agentPayload({ prompt, first, keywords }, opts) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: first,
        language: 'en',
        prompt: {
          prompt,
          llm: opts.llm,
          temperature: 0.4,
          max_tokens: 300,
        },
      },
      tts: {
        voice_id: opts.voiceId,
        model_id: opts.ttsModel,
        // Lower stability = more expression. The default of 1.0 is what makes agents sound flat.
        stability: 0.5,
        similarity_boost: 0.8,
        speed: 0.95,
      },
      asr: { quality: 'high', keywords },
      turn: { turn_timeout: 8, mode: 'turn', turn_eagerness: 'normal' },
      conversation: { max_duration_seconds: 900, text_only: false },
    },
    platform_settings: {
      // The owner's calls, kept no longer than they are useful. ElevenLabs' own default is two years.
      privacy: { retention_days: opts.retentionDays, delete_audio: false },
      call_limits: { agent_concurrency_limit: 4 },
    },
    tags: ['starr-surveying', 'receptionist'],
  };
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : (args.includes(name) ? true : fallback);
};

if (!KEY) {
  console.error('No ElevenLabs key. Set ELEVENLABS_CONVAI_KEY in .env.local (needs Conversational AI read + write).');
  process.exit(1);
}

const opts = {
  voiceId: flag('--voice', DEFAULTS.voiceId),
  ttsModel: flag('--tts-model', DEFAULTS.ttsModel),
  llm: flag('--model', DEFAULTS.llm),
  retentionDays: Number(flag('--retention', DEFAULTS.retentionDays)),
};

if (args.includes('--check') || args.length === 0) {
  const who = await api('GET', '/v1/user');
  console.log('key:', who.ok ? `ok — tier ${who.json?.subscription?.tier ?? '?'}` : `${who.status} ${who.json?.detail?.message ?? ''}`);
  const agents = await api('GET', '/v1/convai/agents');
  console.log('conversational ai:', agents.ok ? `ok — ${(agents.json.agents ?? []).length} agent(s)` : `${agents.status} ${agents.json?.detail?.message ?? ''}`);
  for (const a of agents.json?.agents ?? []) console.log('   ·', a.name, a.agent_id);
  const nums = await api('GET', '/v1/convai/phone-numbers');
  console.log('phone numbers:', nums.ok ? JSON.stringify(nums.json).slice(0, 200) : `${nums.status} ${nums.json?.detail?.message ?? ''}`);
  process.exit(0);
}

if (args.includes('--apply')) {
  const built = await buildPrompt();
  console.log(`prompt built: ${built.prompt.length} characters, ${built.keywords.length} keywords`);
  const list = await api('GET', '/v1/convai/agents');
  if (!list.ok) { console.error('cannot list agents:', list.status, list.json?.detail?.message ?? ''); process.exit(1); }
  const existing = (list.json.agents ?? []).find((a) => a.name === AGENT_NAME);
  const payload = agentPayload(built, opts);
  const res = existing
    ? await api('PATCH', `/v1/convai/agents/${existing.agent_id}`, payload)
    : await api('POST', '/v1/convai/agents/create', payload);
  if (!res.ok) { console.error(existing ? 'update failed:' : 'create failed:', res.status, JSON.stringify(res.json).slice(0, 600)); process.exit(1); }
  const id = res.json?.agent_id ?? existing?.agent_id;
  console.log(`${existing ? 'updated' : 'created'} agent ${id}`);
  console.log(`voice ${opts.voiceId} · tts ${opts.ttsModel} · llm ${opts.llm} · retention ${opts.retentionDays} days`);
  console.log('\nNext: put ELEVENLABS_AGENT_ID=' + id + ' in Vercel, then register the phone number:');
  console.log('  node scripts/elevenlabs-agent.mjs --sip +18338426971');
  process.exit(0);
}

const sip = flag('--sip');
if (typeof sip === 'string') {
  const list = await api('GET', '/v1/convai/agents');
  const agent = (list.json?.agents ?? []).find((a) => a.name === AGENT_NAME);
  if (!agent) { console.error('create the agent first: --apply'); process.exit(1); }
  const res = await api('POST', '/v1/convai/phone-numbers/create', {
    phone_number: sip,
    label: 'Starr Surveying toll-free (inbound from Twilio)',
    provider: 'sip_trunk',
    agent_id: agent.agent_id,
    inbound_trunk_config: { allowed_addresses: [], media_encryption: 'allowed' },
  });
  if (!res.ok) { console.error('sip registration failed:', res.status, JSON.stringify(res.json).slice(0, 600)); process.exit(1); }
  console.log('registered:', JSON.stringify(res.json));
  console.log(`\nInbound URI for Twilio: sip:${sip}@sip.rtc.elevenlabs.io:5060`);
  console.log('Set ELEVENLABS_SIP_URI to that value in Vercel to enable the "ElevenLabs agent" test calls.');
  process.exit(0);
}

console.log('nothing to do — pass --check, --apply, or --sip <e164>');
