#!/usr/bin/env node
// scripts/check-vendor-credentials.mjs — is each paid service actually usable?
//
// Sibling of `worker/scripts/check-adapter-hosts.mjs`, one layer up. That one asks "does this
// hostname exist"; this one asks "does this credential work". Both exist because the answer was
// assumed for months and was wrong.
//
// ── WHAT ONE NIGHT OF ASKING FOUND (2026-08-27) ─────────────────────────────────────────────────
//
// Ten services, five distinct states, and **reading the config would have described none of them
// correctly**:
//
//   Anthropic     valid
//   Resend        valid, RESTRICTED to send-only — returns 401 on admin endpoints, which is correct
//   Browserbase   valid key, ZERO sessions ever, billing since 2026-04-23
//   CapSolver     present and REJECTED — the account refuses it
//   Tavily        no key in any config
//   Twilio        active account, ZERO phone numbers — SMS structurally cannot send
//   Stripe        keys empty, but PAYMENTS_LIVE absent → off by design, NOT broken
//   ATTOM · Regrid · TNRIS · Landex · USPS · Mapbox · every county records login → EMPTY
//
// 17 of 18 vendor credentials held no value at all.
//
// ── THE TWO RULES THIS SCRIPT ENCODES ───────────────────────────────────────────────────────────
//
// **1. Read the body, never the status code.** Two 401s meant opposite things on the same night.
// Resend's said `restricted_api_key` — identity accepted, scope refused, which is good practice and
// a working key. CapSolver's said `ERROR_KEY_DENIED_ACCESS` — identity refused, a dead key. A
// checker that reports both as "401 FAIL" will send somebody to fix the healthy one.
//
// **2. Absence can be the answer.** Empty Stripe keys look like a broken payment integration until
// you notice `PAYMENTS_LIVE` does not exist — payments are deliberately off, and the empty keys are
// the correct state. Before calling a credential broken, look for the flag that makes empty right.
//
// ── A SCRIPT, NOT A TEST ────────────────────────────────────────────────────────────────────────
//
// Same reasoning as check-adapter-hosts: a test that calls ten third-party APIs fails on a plane, in
// a sandbox, and in any CI runner without egress — and a test that fails for reasons unrelated to
// the code gets skipped, which is worse than not having it. Run this when auditing spend or before
// switching a provider on.
//
// **Every endpoint below is free and read-only.** Account, balance and token-info routes. Nothing
// here sends an email, solves a captcha, starts a browser session, or bills a request.
//
// Usage:
//   doppler run --project starr-surveying --config prd -- node scripts/check-vendor-credentials.mjs
//   node scripts/check-vendor-credentials.mjs          # reads whatever is already in the environment

const TIMEOUT_MS = 20_000;
const sig = () => AbortSignal.timeout(TIMEOUT_MS);

/** The states worth telling apart. "fail" is deliberately rare — most findings are not failures. */
const OK = 'ok', SCOPED = 'scoped', UNUSED = 'unused', REJECTED = 'rejected',
      ABSENT = 'absent', OFF = 'off', ERROR = 'error';

const MARK = {
  [OK]: '  OK      ', [SCOPED]: '  OK*     ', [UNUSED]: '  UNUSED  ',
  [REJECTED]: '  REJECT  ', [ABSENT]: '  --      ', [OFF]: '  OFF     ', [ERROR]: '  ERROR   ',
};

const env = process.env;
const has = (k) => Boolean(env[k] && env[k].trim());

const checks = [];

// ── Anthropic ───────────────────────────────────────────────────────────────────────────────────
checks.push(async () => {
  if (!has('ANTHROPIC_API_KEY')) return ['Anthropic', ABSENT, 'no key'];
  const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, signal: sig() });
  return ['Anthropic', r.ok ? OK : REJECTED, 'HTTP ' + r.status];
});

// ── Resend. The 401 here is the reason rule 1 exists. ───────────────────────────────────────────
checks.push(async () => {
  if (!has('RESEND_API_KEY')) return ['Resend', ABSENT, 'no key'];
  const r = await fetch('https://api.resend.com/emails/00000000-0000-0000-0000-000000000000', {
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY }, signal: sig() });
  const body = await r.json().catch(() => ({}));
  if (body?.name === 'restricted_api_key') {
    return ['Resend', SCOPED, 'send-only key — correct for a production mailer'];
  }
  if (r.status === 401) return ['Resend', REJECTED, String(body?.message ?? '').slice(0, 60)];
  return ['Resend', OK, 'HTTP ' + r.status];
});

// ── Browserbase. Valid credentials are only half the question. ──────────────────────────────────
checks.push(async () => {
  if (!has('BROWSERBASE_API_KEY') || !has('BROWSERBASE_PROJECT_ID')) return ['Browserbase', ABSENT, 'no credentials'];
  const h = { 'X-BB-API-Key': env.BROWSERBASE_API_KEY };
  const p = await fetch('https://api.browserbase.com/v1/projects/' + env.BROWSERBASE_PROJECT_ID, { headers: h, signal: sig() });
  if (!p.ok) return ['Browserbase', REJECTED, 'HTTP ' + p.status];
  const s = await fetch('https://api.browserbase.com/v1/sessions?projectId=' + env.BROWSERBASE_PROJECT_ID, { headers: h, signal: sig() });
  const list = await s.json().catch(() => []);
  const n = Array.isArray(list) ? list.length : (list.sessions?.length ?? 0);
  // A valid key with no sessions is money leaving for nothing — the state the config cannot show.
  return ['Browserbase', n === 0 ? UNUSED : OK, n === 0 ? 'valid key, ZERO sessions ever — billing for nothing' : n + ' session(s)'];
});

// ── CapSolver. The other 401, meaning the opposite thing. ───────────────────────────────────────
checks.push(async () => {
  if (!has('CAPSOLVER_API_KEY')) return ['CapSolver', ABSENT, 'no key'];
  const r = await fetch('https://api.capsolver.com/getBalance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: env.CAPSOLVER_API_KEY }), signal: sig() });
  const d = await r.json().catch(() => ({}));
  if (d?.errorId) return ['CapSolver', REJECTED, String(d.errorCode ?? d.errorDescription ?? '').slice(0, 50)];
  return ['CapSolver', OK, 'balance $' + d.balance];
});

// ── Twilio. An active account that owns no number cannot send. ──────────────────────────────────
checks.push(async () => {
  if (!has('TWILIO_ACCOUNT_SID') || !has('TWILIO_AUTH_TOKEN')) return ['Twilio', ABSENT, 'no credentials'];
  const auth = { Authorization: 'Basic ' + Buffer.from(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN).toString('base64') };
  const a = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + env.TWILIO_ACCOUNT_SID + '.json', { headers: auth, signal: sig() });
  if (!a.ok) return ['Twilio', REJECTED, 'HTTP ' + a.status];
  const n = await (await fetch('https://api.twilio.com/2010-04-01/Accounts/' + env.TWILIO_ACCOUNT_SID + '/IncomingPhoneNumbers.json', { headers: auth, signal: sig() })).json();
  const count = (n.incoming_phone_numbers ?? []).length;
  return ['Twilio', count === 0 ? REJECTED : OK,
    count === 0 ? 'account active but owns NO number — outbound SMS cannot send' : count + ' number(s)'];
});

// ── Stripe. Rule 2: look for the flag that makes empty correct. ─────────────────────────────────
checks.push(async () => {
  const live = env.PAYMENTS_LIVE === 'true';
  if (!has('STRIPE_SECRET_KEY')) {
    return ['Stripe', live ? REJECTED : OFF,
      live ? 'PAYMENTS_LIVE=true with NO secret key — the portal will break for real customers'
           : 'keys empty and PAYMENTS_LIVE unset — off by design, not broken'];
  }
  const r = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }, signal: sig() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return ['Stripe', REJECTED, String(d.error?.message ?? '').slice(0, 60)];
  return ['Stripe', OK, (d.livemode ? 'LIVE' : 'test') + ' mode, PAYMENTS_LIVE=' + (live ? 'true' : 'unset')];
});

// ── Credentials with no free validation endpoint. Presence is all we can check. ─────────────────
const PRESENCE_ONLY = [
  ['Tavily', 'TAVILY_API_KEY', 'open-web research is inert without it'],
  ['TexasFile', 'TEXASFILE_USERNAME', 'the UNIVERSAL clerk fallback — no login, no paid documents anywhere'],
  ['ATTOM', 'ATTOM_API_KEY', ''], ['Regrid', 'REGRID_TOKEN', ''], ['TNRIS', 'TNRIS_API_KEY', ''],
  ['Landex', 'LANDEX_API_KEY', ''], ['USPS', 'USPS_USER_ID', ''], ['Mapbox', 'MAPBOX_ACCESS_TOKEN', ''],
  ['ElevenLabs', 'ELEVENLABS_API_KEY', 'tutor read-aloud only; degrades to the free browser voice'],
  ['Maps (server)', 'GOOGLE_MAPS_SERVER_KEY', ''], ['Kofile', 'KOFILE_USERNAME', ''],
  ['iDocket', 'IDOCKET_PAY_USERNAME', ''], ['Tyler', 'TYLER_PAY_USERNAME', ''],
  ['Henschen', 'HENSCHEN_PAY_USERNAME', ''], ['Fidlar', 'FIDLAR_PAY_USERNAME', ''],
];

const run = async () => {
  console.log('\nVendor credentials — free, read-only checks. Nothing here bills.\n');

  for (const check of checks) {
    let row;
    try { row = await check(); }
    catch (e) { row = ['(check threw)', ERROR, String(e.name ?? e.message).slice(0, 50)]; }
    const [name, state, detail] = row;
    console.log(MARK[state] + name.padEnd(16) + detail);
  }

  console.log('\nPresence only — no free endpoint to validate these against:\n');
  for (const [name, key, note] of PRESENCE_ONLY) {
    const present = has(key);
    console.log((present ? '  set     ' : '  EMPTY   ') + name.padEnd(16) + (present ? '' : note));
  }

  console.log(
    '\n  OK*  = valid but scope-limited. That is a healthy state, not a fault.\n' +
    '  Read the DETAIL column, not the marker: a 401 can mean "wrong key" or "right key, wrong\n' +
    '  permission", and only one of those is a problem.\n',
  );
};

run();
