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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = readEnv(path.join(root, '.env.local'));
const KEY = process.env.ELEVENLABS_CONVAI_KEY || env.ELEVENLABS_CONVAI_KEY || process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || '';
const API = 'https://api.elevenlabs.io';
const AGENT_NAME = 'Starr Surveying receptionist (Ellie)';
// A second agent with no Starr knowledge at all: the same voice and turn-taking, for judging how the
// platform handles ordinary conversation (owner, 2026-09-15: "a version that is just generic all
// around conversation for any reason, and one that is totally geared … for Starr Surveying").
const GENERIC_AGENT_NAME = 'General conversation (test)';
const GENERIC_PROMPT = `You are a friendly, natural-sounding voice assistant on a phone call. You are here so the person can judge how well you hold a conversation — about anything at all.

How you sound: one or two short sentences per turn, under forty words. Ask one question at a time, then stop and listen. Let the person interrupt you, and stop the moment they start talking. Plain spoken English: no lists, no markdown, no symbols. Say numbers the way people say them out loud.

How you behave: be warm and curious. Follow the person's lead rather than steering. If they ask a factual question you are unsure of, say so plainly instead of guessing. If they ask whether you are a person, say you are an AI assistant. Never claim to be human.

You have no business to represent and nothing to sell. If asked what you do, say you are a test assistant the owner is using to judge how natural the voice and conversation feel.`;
const GENERIC_FIRST = "Hey — I'm an AI assistant, and this call is recorded. Talk to me about anything you like.";

// Defaults chosen from the 2026-09-15 research: the expressive realtime model, a warm female voice,
// and Claude as the brain. All three are overridable from the command line.
const DEFAULTS = {
  voiceId: process.env.ELEVENLABS_VOICE_ID || 'hA4zGnmTwX2NQiTRMt7o', // Riley — owner's pick, 2026-09-16
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
  const { execSync } = await import('node:child_process');
  // tsx runs the TypeScript modules directly; they import only pure data files.
  const script = `
    import { agentPrompt, agentFirstMessage, AGENT_KEYWORDS, agentKnowledgeDocs } from './lib/receptionist/agent-prompt';
    import { INIT_PLACEHOLDERS } from './lib/receptionist/agent-init';
    import fs from 'node:fs';
    fs.mkdirSync(${JSON.stringify(path.dirname(out))}, { recursive: true });
    fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({ prompt: agentPrompt(), first: agentFirstMessage(), keywords: [...AGENT_KEYWORDS], docs: agentKnowledgeDocs(), placeholders: INIT_PLACEHOLDERS }));
  `;
  const tmp = path.join(root, '_agent-prompt.build.ts');
  fs.writeFileSync(tmp, script);
  try {
    // Quoted: the repo lives under a path with a space in it.
    execSync(`npx tsx "${tmp}"`, { cwd: root, stdio: 'inherit' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/** The URL ElevenLabs asks "who is calling?" before every call, and the token that lets it ask.
 *  Derived from TWILIO_AUTH_TOKEN exactly as the route derives it (lib/receptionist/agent-init.ts) —
 *  the one secret that is provably in both this machine's .env.local and the deployment, so the two
 *  sides cannot disagree about the token and fail silently. */
function initWebhook(env) {
  const secret = (env.TWILIO_AUTH_TOKEN ?? '').trim();
  const site = (env.NEXT_PUBLIC_SITE_URL ?? env.SITE_URL ?? 'https://www.starr-surveying.com').replace(/[/]$/, '');
  if (!secret) return null;
  const token = crypto.createHash('sha256').update(`${secret}:elevenlabs-conversation-init:v1`).digest('hex').slice(0, 32);
  return { url: `${site}/api/elevenlabs/conversation-init?t=${token}`, request_headers: {} };
}

function agentPayload({ prompt, first, keywords }, opts, knowledgeBase = [], initHook = null) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: first,
        language: 'en',
        // What the prompt's {{placeholders}} say when no webhook answered — a browser test, or a
        // webhook ElevenLabs could not reach. Without them the prompt would render the braces.
        dynamic_variables: { dynamic_variable_placeholders: opts.placeholders ?? {} },
        prompt: {
          prompt,
          llm: opts.llm,
          temperature: 0.4,
          // Owner, 2026-09-16: "The agent was just really bad with interruptions." A long turn is
          // what a caller talks over, so the ceiling comes down to about three spoken sentences.
          max_tokens: 160,
          // ── THE TOOLS THE PROMPT ACTUALLY ASKS FOR ────────────────────────────────────────────
          //
          // Every built-in tool was `null` on the live agent until 2026-09-21, while the prompt's
          // # Tools section had been telling Ellie to use `end_call` and `skip_turn` for weeks. She
          // could do neither: no way to hang up when a call was finished, and no way to hold
          // silence while a caller looked something up — so she filled it with another question,
          // which is the behaviour that reads as an agent not listening.
          //
          // Declared here, not just switched on in the dashboard, because this payload REPLACES
          // `prompt` wholesale on every run — so a hand-made change would survive exactly until the
          // next time somebody ran this script.
          built_in_tools: {
            end_call: { type: 'system', name: 'end_call', description: '', params: { system_tool_type: 'end_call' } },
            skip_turn: { type: 'system', name: 'skip_turn', description: '', params: { system_tool_type: 'skip_turn' } },
            // Lets her switch language mid-call rather than guessing from the first word. See
            // `language_presets` below.
            language_detection: { type: 'system', name: 'language_detection', description: '', params: { system_tool_type: 'language_detection' } },
          },
          ...(knowledgeBase.length ? { knowledge_base: knowledgeBase, rag: { enabled: true } } : {}),
        },
      },
      // ── SPANISH (owner, 2026-09-21) ──────────────────────────────────────────────────────────
      //
      // Bell, Williamson and Milam counties are bilingual and the agent was English-only, so a
      // Spanish-speaking caller got an agent failing to understand them and then voicemail. The
      // prompt's # Language section carries the behaviour; this is what makes it possible, together
      // with the `language_detection` tool above.
      //
      // The greeting is translated rather than switched into mid-sentence: the first message is
      // spoken before the caller has said anything, so nothing can be detected from it yet. A
      // caller who opens in Spanish is switched by the tool on their first sentence.
      language_presets: {
        es: {
          overrides: {
            agent: {
              first_message:
                'Starr Surveying, le atiende Ellie. Soy un asistente automatizado y esta llamada se graba. ¿En qué puedo ayudarle?',
              // The Spanish-only craft lives HERE rather than in the base prompt, because it only
              // applies once the call is already in Spanish — and the base prompt is sent on every
              // turn of every call, English ones included. The guide's own warning is that length
              // past roughly 2000 tokens buys latency and nothing else.
              prompt: {
                prompt: `${prompt}

# Español

Esta llamada es en español. Todo lo anterior se aplica igual.

- DELETREO. Usa los nombres de las letras en español y distingue los pares que suenan igual por teléfono: "be de burro", "ve de vaca", y s/c/z — como lo haría alguien confirmando un apellido.
- NÚMEROS. Di y repite los números de teléfono como se hace en español, en pares o dígito por dígito, igual a como los escuchaste.
- Usa usted, no tú, salvo que la persona te hable de forma claramente informal primero.`,
              },
            },
          },
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
      // ── TURN-TAKING, TUNED FROM PUBLISHED GUIDANCE (2026-09-16) ────────────────────────────────
      // `patient` is what ElevenLabs recommends verbatim for collecting phone numbers, addresses
      // and emails — exactly this call. `spelling_patience` already defaults to `auto`, which gives
      // the model extra room while someone is spelling, so it is left alone.
      //
      // soft timeout: the platform default is -1, meaning the agent says nothing while it thinks and
      // the caller hears dead air. Three seconds, then a filler with NO time estimate in it — the
      // docs warn against "one second…" because real response times are unpredictable.
      //
      // interruption_ignore_terms: matched case-insensitively and only as the whole utterance, so
      // these catch a listener's backchannel without swallowing a real interruption. "Wait" and
      // "stop" are deliberately absent — those must always cut the agent off.
      turn: {
        turn_timeout: 10,
        mode: 'turn',
        turn_eagerness: 'patient',
        silence_end_call_timeout: 30,
        interruption_ignore_terms: ['mhm', 'mm-hmm', 'uh huh', 'okay', 'ok', 'gotcha', 'yeah', 'right', 'sure'],
        soft_timeout_config: {
          timeout_seconds: 3,
          message: 'Let me get that written down.',
          disable_until_first_user_message: true,
        },
      },
      conversation: {
        max_duration_seconds: 900,
        text_only: false,
        // Let a caller key the callback number instead of saying it. Speech capture of a ten-digit
        // number is the least reliable thing on the call; a keypress is exact by construction. Only
        // out-of-band DTMF (which is what Twilio's SIP trunk sends) is read, so speech stays the
        // default path and this is the fallback, never the other way round.
        dtmf_input_settings: { dtmf_input_timeout: 3, hash_terminator: true },
      },
    },
    platform_settings: {
      // The owner's calls, kept no longer than they are useful. ElevenLabs' own default is two years.
      privacy: { retention_days: opts.retentionDays, delete_audio: false },
      call_limits: { agent_concurrency_limit: 4 },
      // Ask us who is calling before answering. Null clears it, so a deployment without a cron
      // secret does not leave a stale URL pointing at an endpoint that cannot authenticate it.
      workspace_overrides: { conversation_initiation_client_data_webhook: initHook },
      // ── WHAT THE CALL IS FOR, EXTRACTED AFTER IT ENDS ─────────────────────────────────────────
      // The live model's job is to have the conversation; pulling structured fields out of it mid
      // call is work it does badly and pays for in latency. These run once, afterwards, and each
      // description states the WRITTEN format — without that, the platform's default text
      // normalisation hands back "two five four…" instead of digits.
      data_collection: {
        full_name: { type: 'string', description: 'The caller\'s full name as they gave it, spelling corrections applied. Empty if they never gave one.' },
        callback_number: { type: 'string', description: 'The best callback number, digits only, no punctuation, e.g. "2543151123". If they said to use the number they were calling from, put that number here.' },
        email: { type: 'string', description: 'The caller\'s email address in written form, all lowercase, e.g. "jacob@gmail.com". Empty if they declined or never gave one.' },
        property_address: { type: 'string', description: 'The property the call is about, written as an address, e.g. "4557 Briggs Road, Killeen, TX". If rural with no address, the county plus the nearest road or crossroads.' },
        property_id: { type: 'string', description: 'The county appraisal district property ID, digits and letters only, if the caller had one.' },
        service_wanted: { type: 'string', description: 'The kind of survey or work they asked about, in a few words, e.g. "boundary survey for a fence".' },
        deadline: { type: 'string', description: 'Any date or deadline they named — a closing, permit, court date or build start — as they said it. Empty if none.' },
        left_message: { type: 'boolean', description: 'True if the caller left a message for the owner during the call.' },
        wants_callback: { type: 'boolean', description: 'True if the caller wants the owner to call them back.' },
      },
      // ── THE OWNER'S THREE RULES, ENFORCED OUTSIDE THE PROMPT ──────────────────────────────────
      // They are in # Guardrails in the system prompt as well, but a rule that lives only in a
      // prompt is one a determined caller can talk the model out of — and "I think it was giving out
      // the same quote for all requests" is what that looked like in production. This is a separate
      // model checking the reply before the caller hears it.
      //
      // ONE combined policy, not three: each is a check in front of every agent turn, and three
      // checks is three times the latency for the same coverage.
      //
      // `blocking` + `retry` rather than the platform default of `streaming` + `end_call`. The
      // default would hang up on a customer for asking what a survey costs, which is worse than the
      // thing it prevents. Blocking costs a fast check (flash-lite) before each reply and gives the
      // agent up to three attempts to answer without breaking a rule.
      //
      // ── AND WHY IT IS SWITCHED OFF (measured, 2026-09-16) ─────────────────────────────────────
      // It was built, enabled, and then A/B'd against the same simulated price-pushing caller:
      //
      //     guardrail OFF: 9 turns, the caller gets a proper refusal and leaves their details
      //     guardrail ON:  2 turns, the conversation stops dead
      //
      // The retry loop does not recover. It ends the call on a customer whose only crime was asking
      // what a survey costs — which is the single most common question on this line, and a far worse
      // outcome than the one the guardrail exists to prevent.
      //
      // It is left here, wired and disabled, because the config was the hard part and the failure is
      // worth recording: flip `is_enabled` to true only alongside a real call test, not a hunch.
      // The protection it was meant to add is already covered better upstream — the agent is given
      // no prices at all (lib/receptionist/knowledge.ts, `prices: false`), which is why every
      // simulation refuses correctly without it. A model cannot read out a number it never had.
      guardrails: {
        custom: {
          config: {
            configs: [{
              name: 'no prices, no legal advice, no commitments',
              is_enabled: false,
              execution_mode: 'blocking',
              // The platform's default retry line is "I'm sorry but I can't answer that question,
              // would you like to know something else?" — which is the wrong sentence for somebody
              // who just asked what a survey costs. This is the one they should hear instead.
              trigger_action: {
                type: 'retry',
                feedback: 'That reply broke one of the firm\'s rules ({{trigger_reason}}). Say it again without it. If they asked about price, the answer is that Hank is the only one who gives quotes and he will have one for them when he calls back, and then take the details so he can look at the property first — warmly, in one or two sentences, and never with a number in it. If they asked a legal question, say it is a good question for Hank and that he deals with it every day, and write it down for him. If they asked when work would happen, say Hank will look at it and call them back, usually the same or next business day.',
              },
              prompt: [
                'Flag the assistant\'s reply if it does ANY of the following:',
                '1. States, estimates, implies or approximates a price, price range, hourly rate, percentage, fee, deposit or ballpark for any service — in figures or in words. Only the owner gives quotes. Saying WHAT the price depends on (size, distance, terrain, brush, record research, number of corners, what is built on the property) is allowed and must NOT be flagged.',
                '2. Gives legal advice or an opinion on a boundary dispute, easement, deed, permit, plat requirement, adverse possession, or what a neighbour may or may not do. Saying the owner will answer it is allowed.',
                '3. Commits the firm: promising a date, scheduling work, saying when a crew will arrive, or offering a discount. Saying the owner will look at it and call back is allowed.',
              ].join('\n'),
            }],
          },
        },
      },
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

if (args.includes('--generic')) {
  const list = await api('GET', '/v1/convai/agents');
  if (!list.ok) { console.error('cannot list agents:', list.status); process.exit(1); }
  const existing = (list.json.agents ?? []).find((a) => a.name === GENERIC_AGENT_NAME);
  const payload = agentPayload({ prompt: GENERIC_PROMPT, first: GENERIC_FIRST, keywords: [] }, opts);
  payload.name = GENERIC_AGENT_NAME;
  payload.tags = ['starr-surveying', 'generic-test'];
  const res = existing
    ? await api('PATCH', `/v1/convai/agents/${existing.agent_id}`, payload)
    : await api('POST', '/v1/convai/agents/create', payload);
  if (!res.ok) { console.error('generic agent failed:', res.status, JSON.stringify(res.json).slice(0, 400)); process.exit(1); }
  const id = res.json?.agent_id ?? existing?.agent_id;
  console.log(`${existing ? 'updated' : 'created'} generic agent ${id}`);
  console.log('Set ELEVENLABS_AGENT_ID_GENERIC=' + id);
  process.exit(0);
}

if (args.includes('--apply')) {
  const built = await buildPrompt();
  console.log(`prompt built: ${built.prompt.length} characters, ${built.keywords.length} keywords`);
  const list = await api('GET', '/v1/convai/agents');
  if (!list.ok) { console.error('cannot list agents:', list.status, list.json?.detail?.message ?? ''); process.exit(1); }
  const existing = (list.json.agents ?? []).find((a) => a.name === AGENT_NAME);

  // The reference material lives in the knowledge base, not in the system prompt: the service
  // briefs would otherwise be re-sent on every single turn of every call.
  //
  // STALE DOCS ARE DELETED, not just unlinked. The land-law library lived here until 2026-09-16,
  // when the owner took it off the call ("It doesn't need to know all of the legal stuff"), and a
  // document left in the account is a document a future --apply could silently re-attach.
  const kbList = await api('GET', '/v1/convai/knowledge-base');
  const known = new Map((kbList.json?.documents ?? []).map((d) => [d.name, d.id]));
  const wanted = new Set((built.docs ?? []).map((d) => d.name));
  for (const [name, id] of known) {
    if (wanted.has(name) || !/^(Texas land law|Texas statute excerpts|Starr Surveying)/.test(name)) continue;
    const gone = await api('DELETE', `/v1/convai/knowledge-base/${id}`);
    console.log(`knowledge base: ${gone.ok ? 'removed' : `could not remove (HTTP ${gone.status})`} stale document "${name}"`);
    if (gone.ok) known.delete(name);
  }

  const knowledgeBase = [];
  for (const doc of built.docs ?? []) {
    let id = known.get(doc.name);
    if (!id) {
      const made = await api('POST', '/v1/convai/knowledge-base/text', { name: doc.name, text: doc.text });
      if (!made.ok) { console.error('knowledge base upload failed:', made.status, JSON.stringify(made.json).slice(0, 300)); process.exit(1); }
      id = made.json?.id;
      console.log(`knowledge base: added "${doc.name}" (${doc.text.length} chars)`);
    } else {
      console.log(`knowledge base: "${doc.name}" already there`);
    }
    knowledgeBase.push({ type: 'text', id, name: doc.name, usage_mode: 'auto' });
  }

  const hook = initWebhook(env);
  console.log(hook ? `initiation webhook: ${hook.url.replace(/t=.*/, 't=…')}` : 'initiation webhook: OFF (no TWILIO_AUTH_TOKEN here) — the agent will not know who is calling');
  // ── WHATEVER THE OWNER PICKED ON THE BENCH SURVIVES THIS ─────────────────────────────────
  //
  // The voice and the speech model are switchable at /admin/dev/receptionist, and this script
  // carries DEFAULTS for both. Without this read-back, every prompt update would silently reset
  // them: somebody chooses Sarah and the fast model on Monday, somebody fixes a typo in the prompt
  // on Tuesday, and the line is Riley on the expressive model again with nobody having decided
  // that. An explicit --voice or --model still wins, because that IS a decision.
  const liveCfg = existing ? await api('GET', `/v1/convai/agents/${existing.agent_id}`) : { ok: false, json: {} };
  const liveTts = liveCfg.ok ? (liveCfg.json?.conversation_config?.tts ?? {}) : {};
  const keep = {
    ...opts,
    voiceId: args.includes('--voice') ? opts.voiceId : (liveTts.voice_id || opts.voiceId),
    ttsModel: args.includes('--tts-model') ? opts.ttsModel : (liveTts.model_id || opts.ttsModel),
    placeholders: built.placeholders,
  };
  if (existing && !liveCfg.ok) {
    console.log(`note: could not read the agent's current voice/model (HTTP ${liveCfg.status}) — applying the defaults`);
  } else if (existing) {
    const keptVoice = keep.voiceId !== DEFAULTS.voiceId || keep.ttsModel !== DEFAULTS.ttsModel;
    if (keptVoice) console.log(`keeping the bench's choices: voice ${keep.voiceId} · tts ${keep.ttsModel}`);
  }

  const payload = agentPayload(built, keep, knowledgeBase, hook);
  const res = existing
    ? await api('PATCH', `/v1/convai/agents/${existing.agent_id}`, payload)
    : await api('POST', '/v1/convai/agents/create', payload);
  if (!res.ok) { console.error(existing ? 'update failed:' : 'create failed:', res.status, JSON.stringify(res.json).slice(0, 600)); process.exit(1); }
  const id = res.json?.agent_id ?? existing?.agent_id;
  console.log(`${existing ? 'updated' : 'created'} agent ${id}`);
  console.log(`voice ${keep.voiceId} · tts ${keep.ttsModel} · llm ${keep.llm} · retention ${keep.retentionDays} days`);
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
  // ── `;transport=tcp` IS NOT OPTIONAL ──────────────────────────────────────────────────────────
  //
  // This line printed the URI without it, that value went into Vercel, and the conversational agent
  // never answered a single live call for five days.
  //
  // ElevenLabs' trunk listens on TCP (5060) and TLS (5061) and NOT on UDP. Twilio defaults a `sip:`
  // URI with no transport parameter to UDP, so every INVITE went to a port nobody was listening on:
  // the leg failed in about a second with no SIP response at all, which is why there was no Twilio
  // error code to look up and no conversation on the ElevenLabs side to explain it. Meanwhile
  // `agent-ended` handed each caller to the answering machine exactly as designed, so the only
  // symptom was five customers leaving voicemails.
  //
  // Proven 2026-09-21 by dialling the trunk directly from Twilio: without the parameter the call
  // failed in 0 seconds; with it the same call completed in 12 and ElevenLabs logged its first
  // `sip_trunk` conversation.
  const inboundUri = `sip:${sip}@sip.rtc.elevenlabs.io:5060;transport=tcp`;
  console.log(`\nInbound URI for Twilio: ${inboundUri}`);
  console.log('Set ELEVENLABS_SIP_URI to that value in Vercel to enable the "ElevenLabs agent" test calls.');
  console.log('Keep ";transport=tcp" — their trunk has no UDP listener and Twilio defaults to UDP.');
  process.exit(0);
}

console.log('nothing to do — pass --check, --apply, or --sip <e164>');
