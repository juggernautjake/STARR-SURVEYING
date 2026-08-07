// scripts/ai-gateway-smoke.mjs
//
// Proves the Vercel AI Gateway is reachable from this project and streaming works.
//
//   node --env-file=.env.vercel.local scripts/ai-gateway-smoke.mjs
//
// ── WHY THERE IS NO API KEY HERE ────────────────────────────────────────────────────────────────
//
// `vercel env pull` brings down VERCEL_OIDC_TOKEN, a short-lived credential tied to this project.
// The AI SDK picks it up automatically, so no AI_GATEWAY_API_KEY is needed for local development.
// The token expires (roughly every 12 hours) — re-run `vercel env pull .env.vercel.local` when it
// does. In a Vercel deployment the token is injected automatically and nothing is pulled at all.
//
// ── WHY THIS PULLS TO .env.vercel.local RATHER THAN .env.local ──────────────────────────────────
//
// The documented command is `vercel env pull .env.local`, which OVERWRITES the file. This repo's
// .env.local carries local-only development values that are not in Vercel, and replacing it wholesale
// breaks local dev in ways that look unrelated. Pulling to a separate file keeps both intact.
//
// ── WHY CLAUDE AND NOT THE MODEL IN THE DOCS ────────────────────────────────────────────────────
//
// Vercel's example uses `openai/gpt-5.5`. Every AI feature in this codebase runs on Claude via
// @anthropic-ai/sdk, so a smoke test that proves an OpenAI route works would prove the wrong thing.
// The gateway addresses models as `provider/model`.

import { streamText } from 'ai';

const MODEL = process.env.SMOKE_MODEL ?? 'anthropic/claude-opus-5';

if (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY) {
  console.error(
    'No gateway credential found.\n' +
    'Run:  vercel env pull .env.vercel.local\n' +
    'Then: node --env-file=.env.vercel.local scripts/ai-gateway-smoke.mjs',
  );
  process.exit(1);
}

console.log(`→ model: ${MODEL}`);
console.log(`→ auth:  ${process.env.VERCEL_OIDC_TOKEN ? 'VERCEL_OIDC_TOKEN (no API key)' : 'AI_GATEWAY_API_KEY'}`);
console.log('─'.repeat(60));

const started = Date.now();

try {
  const result = streamText({
    model: MODEL,
    prompt: 'In two sentences, explain what a land survey boundary monument is.',
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  const usage = await result.usage;
  console.log('\n' + '─'.repeat(60));
  console.log(`✓ ${Date.now() - started}ms  |  tokens in/out: ${usage?.inputTokens ?? '?'}/${usage?.outputTokens ?? '?'}`);
} catch (err) {
  console.error('\n✗ Gateway request failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
