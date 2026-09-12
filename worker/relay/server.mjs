// worker/relay/server.mjs — the phone receptionist's real-time relay.
//
// One small Node process between Twilio ConversationRelay and the Starr app. Twilio opens a
// WebSocket here for each call the owner did not pick up and streams the caller's words as text;
// this relay asks the app what to say (POST /api/twilio/receptionist/relay-turn, which streams the
// reply) and forwards the words to Twilio sentence by sentence, so the voice starts speaking while
// the model is still writing. It also handles the two things a request-response webhook cannot:
// the caller interrupting, and the caller going quiet.
//
// It knows nothing about surveying and holds no API keys. It needs exactly two settings:
//   APP_BASE_URL                https://www.starr-surveying.com
//   RECEPTIONIST_RELAY_SECRET   shared with the app; signs the per-call URL token and every request
//
// Design notes and the protocol: lib/receptionist/relay.ts in the app. Twilio's message shapes:
// https://www.twilio.com/docs/voice/conversationrelay/websocket-messages
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3200);
const APP = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const SECRET = process.env.RECEPTIONIST_RELAY_SECRET || '';
const BUILD_SHA = process.env.BUILD_SHA || 'unknown';
const RS = '';

// Silence handling. Twilio sends nothing while the caller says nothing, so the relay keeps time.
// Owner, 2026-09-11: "if it asks the customer a question, it should give the customer a bit of time
// to respond before checking in … it seemed to jump to the voicemail all of the sudden." So: after
// the assistant finishes, IDLE_NUDGE_MS of silence earns one soft check-in; a second stretch ends
// the call with a goodbye that promises the callback — not a voicemail beep out of nowhere.
const IDLE_NUDGE_MS = 35_000;
// Roughly how long the TwiML welcome greeting takes to say (about 230 characters).
const GREETING_MS = 16_000;
const NUDGE_TEXT = "Take your time. I'm still here whenever you're ready.";
const QUIET_GOODBYE = "It sounds like we may have lost you. Hank will see this call and get back to you as soon as he can. Goodbye.";
// How long to let the voice finish before ending the session: roughly 15 characters a second of
// speech, plus a little.
const speechMs = (text) => Math.min(20_000, Math.round((text.length / 15) * 1000) + 800);

const log = (...a) => console.log(new Date().toISOString(), '[relay]', ...a);


// ── URL token (mirror of lib/receptionist/relay.ts) ──────────────────────────────────────────────
export function validToken(callSid, exp, token, secret = SECRET, now = Date.now()) {
  if (!callSid || !Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${callSid}.${exp}`).digest('hex'));
  const given = Buffer.from(token || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ── Sentence chunking ────────────────────────────────────────────────────────────────────────────
// Text-to-speech sounds best given whole sentences: it can shape the intonation. Tokens arrive a
// few characters at a time, so they are buffered until a sentence ends (. ! ? or a newline) and
// sent then. Abbreviations like "Mr." or "St." are rare in this script; a false split costs a
// slightly odd pause, not a wrong word.
export function sentenceChunker(emit) {
  let buf = '';
  return {
    push(text) {
      buf += text;
      let m;
      while ((m = buf.match(/^([\s\S]*?[.!?]["')\]]?)(\s+|\n)/))) {
        const sentence = m[1];
        buf = buf.slice(m[0].length);
        if (sentence.trim()) emit(sentence + ' ');
      }
    },
    /** Send whatever is left. Returns true if something was sent. */
    flush(last) {
      const out = buf;
      buf = '';
      if (out.trim()) { emit(out, last); return true; }
      return false;
    },
    pending() { return buf; },
  };
}

// ── The app ──────────────────────────────────────────────────────────────────────────────────────
async function appPost(body, signal) {
  return fetch(`${APP}/api/twilio/receptionist/relay-turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-relay-secret': SECRET },
    body: JSON.stringify(body),
    signal,
  });
}

/** Stream one turn from the app. `onWords` gets the spoken text as it arrives; resolves to the envelope. */
export async function streamTurn(body, onWords, signal) {
  const res = await appPost(body, signal);
  if (!res.ok || !res.body) throw new Error(`relay-turn ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let words = '';
  let tail = '';
  let control = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    if (control !== null) { control += chunk; continue; }
    const at = chunk.indexOf(RS);
    if (at >= 0) {
      const w = chunk.slice(0, at);
      if (w) { words += w; onWords(w); }
      control = chunk.slice(at + 1);
    } else {
      words += chunk;
      onWords(chunk);
    }
  }
  tail = dec.decode();
  if (tail) { if (control !== null) control += tail; else { words += tail; onWords(tail); } }
  let env = { say: words, next: 'continue', facts: {}, readyToSave: false, summary: null };
  if (control) { try { env = { ...env, ...JSON.parse(control) }; } catch (e) { log('bad envelope', e.message); } }
  return env;
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────
class Session {
  constructor(ws, callSid) {
    this.ws = ws;
    this.callSid = callSid;
    this.from = '';
    this.test = false;      // a test call from the website's developer page: same pipeline, no alerts
    this.state = { turns: [], facts: {}, silence: 0, started: Date.now() };
    this.inflight = null;      // AbortController of the turn being streamed
    this.speaking = '';        // what has been sent to TTS this turn
    this.ended = false;
    this.idle = null;
    this.nudges = 0;
  }
  send(msg) { if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg)); }
  say(token, last = false) { this.speaking += token; this.send({ type: 'text', token, last }); }
  clearIdle() { if (this.idle) { clearTimeout(this.idle); this.idle = null; } }
  armIdle(extraMs = 0) {
    this.clearIdle();
    if (this.ended) return;
    this.idle = setTimeout(() => this.onIdle(), IDLE_NUDGE_MS + extraMs);
  }
  onIdle() {
    if (this.ended || this.inflight) return;
    this.nudges += 1;
    if (this.nudges === 1) {
      log(this.callSid, 'silence: nudging');
      this.speaking = '';
      this.say(NUDGE_TEXT, true);
      this.state.turns.push({ role: 'assistant', text: NUDGE_TEXT });
      this.armIdle();
      return;
    }
    log(this.callSid, 'silence twice: saying goodbye');
    this.speaking = '';
    this.say(QUIET_GOODBYE, true);
    this.state.turns.push({ role: 'assistant', text: QUIET_GOODBYE });
    this.end({ next: 'done', summary: 'caller went quiet; the receptionist said goodbye' }, speechMs(QUIET_GOODBYE));
  }
  handoffState() {
    return { facts: this.state.facts, turns: this.state.turns.slice(-8) };
  }
  end(handoff, afterMs = 0) {
    if (this.ended) return;
    this.ended = true;
    this.clearIdle();
    const data = JSON.stringify({ next: handoff.next, summary: handoff.summary ?? null, test: this.test, state: this.handoffState() });
    setTimeout(() => { this.send({ type: 'end', handoffData: data }); log(this.callSid, 'ended', handoff.next); }, afterMs);
  }
  async onPrompt(text) {
    this.clearIdle();
    this.nudges = 0;
    if (this.inflight) this.inflight.abort();
    const ctl = new AbortController();
    this.inflight = ctl;
    this.speaking = '';
    const chunker = sentenceChunker((sentence, last) => this.say(sentence, !!last));
    const t0 = Date.now();
    let first = null;
    try {
      const env = await streamTurn(
        { event: 'turn', callSid: this.callSid, from: this.from, heard: text, state: this.state, test: this.test },
        (w) => { if (first === null) first = Date.now() - t0; chunker.push(w); },
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      // Whatever is left is the last sentence; it carries last:true. If nothing is left (the reply
      // ended exactly on a sentence boundary), a single space closes the turn.
      if (!chunker.flush(true)) this.say(' ', true);
      this.state.turns.push({ role: 'caller', text }, { role: 'assistant', text: env.say || this.speaking.trim() });
      this.state.facts = { ...this.state.facts, ...(env.facts || {}) };
      log(this.callSid, `turn: first words ${first ?? '-'}ms, total ${Date.now() - t0}ms, next=${env.next}`);
      if (env.next === 'done' || env.next === 'voicemail') {
        this.end({ next: env.next, summary: env.summary || undefined }, env.next === 'done' ? speechMs(this.speaking) : speechMs(this.speaking));
      } else {
        this.armIdle();
      }
    } catch (err) {
      if (ctl.signal.aborted) return;
      log(this.callSid, 'turn failed:', err.message);
      this.state.turns.push({ role: 'caller', text });
      this.say("Sorry, I'm having trouble on my end. Let me take a message instead.", true);
      this.end({ next: 'voicemail', summary: 'assistant error; sent to voicemail' }, 4000);
    } finally {
      if (this.inflight === ctl) this.inflight = null;
    }
  }
  onInterrupt(msg) {
    this.clearIdle();
    if (this.inflight) { this.inflight.abort(); this.inflight = null; }
    const said = (msg.utteranceUntilInterrupt || '').trim();
    const last = this.state.turns.length - 1;
    if (last >= 0 && this.state.turns[last].role === 'assistant') {
      this.state.turns[last] = { role: 'assistant', text: said ? `${said} (interrupted)` : '(interrupted)' };
    } else if (this.speaking) {
      this.state.turns.push({ role: 'assistant', text: said ? `${said} (interrupted)` : '(interrupted)' });
    }
    appPost({ event: 'interrupt', callSid: this.callSid, said }).catch((e) => log('interrupt post failed', e.message));
    log(this.callSid, 'interrupted after', msg.durationUntilInterruptMs, 'ms');
  }
  onClose() {
    this.clearIdle();
    if (this.inflight) this.inflight.abort();
    if (this.ended) return;
    this.ended = true;
    // No `end` was sent: the caller hung up. Let the app wrap up with what we have.
    appPost({ event: 'closed', callSid: this.callSid, from: this.from, state: this.state, test: this.test }).catch((e) => log('closed post failed', e.message));
    log(this.callSid, 'socket closed by Twilio');
  }
}

// ── HTTP + WebSocket ─────────────────────────────────────────────────────────────────────────────
export function startServer(port = PORT) {
  if (!APP || !SECRET) {
    console.error('[relay] APP_BASE_URL and RECEPTIONIST_RELAY_SECRET are required');
    process.exit(1);
  }
  const server = createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/relay/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'relay', buildSha: BUILD_SHA, sessions: wss.clients.size }));
      return;
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url || '/', 'http://relay');
    if (u.pathname !== '/relay') { socket.destroy(); return; }
    const callSid = u.searchParams.get('call') || '';
    const exp = Number(u.searchParams.get('exp'));
    if (!validToken(callSid, exp, u.searchParams.get('t') || '')) {
      log('refused upgrade: bad token for', callSid || '(no call)');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, callSid));
  });

  wss.on('connection', (ws, _req, callSid) => {
    const s = new Session(ws, callSid);
    log(callSid, 'connected');
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.type) {
        case 'setup':
          if (msg.callSid && msg.callSid !== callSid) { log('setup callSid mismatch', msg.callSid, callSid); ws.close(1008, 'call mismatch'); return; }
          s.from = (msg.customParameters && msg.customParameters.from) || msg.from || '';
          s.test = !!(msg.customParameters && msg.customParameters.test === '1');
          // Twilio speaks the welcome greeting from the TwiML; the silence clock must not start until
          // it has finished (first live test: the nudge cut in while the caller was still listening).
          s.armIdle(GREETING_MS);
          break;
        case 'prompt':
          if (msg.last === false) return;
          if (msg.voicePrompt && msg.voicePrompt.trim()) s.onPrompt(msg.voicePrompt.trim());
          break;
        case 'interrupt':
          s.onInterrupt(msg);
          break;
        case 'error':
          log(callSid, 'twilio error:', msg.description);
          break;
        default:
          break;
      }
    });
    ws.on('close', () => s.onClose());
    ws.on('error', (e) => log(callSid, 'socket error', e.message));
  });

  server.listen(port, () => log(`listening on ${port} (build ${BUILD_SHA})`));
  return { server, wss };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  startServer();
}
