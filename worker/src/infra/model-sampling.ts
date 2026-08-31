// worker/src/infra/model-sampling.ts — sampling params only the models that accept them.
//
// ── THE ERROR THIS EXISTS FOR ───────────────────────────────────────────────────────────────────
//
// From the owner's run, 2026-08-30:
//
//     [Stage1D] Claude | ai-variant-generation | fail | 379ms
//     ERROR: 400 {"type":"invalid_request_error",
//                 "message":"`temperature` is deprecated for this model."}
//
// Anthropic removed the sampling parameters (`temperature`, `top_p`, `top_k`) on the newer models.
// Sending one is a hard 400, not a warning:
//
//   REJECTS temperature   Fable 5, Opus 5, Opus 4.8, Opus 4.7, Sonnet 5
//   ACCEPTS temperature   Opus 4.6, Sonnet 4.6, and everything older
//
// This worker uses `claude-sonnet-5` in fourteen places and `claude-sonnet-4-6` in twenty-nine, so
// the answer is not "delete temperature everywhere" — that would silently change behaviour on every
// 4.6 call, where `temperature: 0` is doing real work (the default is 1.0, and these are extraction
// prompts that must not improvise).
//
// ── WHY A RUNTIME HELPER AND NOT A CODEMOD ──────────────────────────────────────────────────────
//
// The model is chosen at runtime by `modelFor(task)`, so no call site knows statically which model
// it will hit. A per-file edit would be guessing. Spreading `samplingFor(model)` asks the question
// at the only moment the answer exists.

/**
 * Models that reject `temperature` / `top_p` / `top_k` with a 400.
 *
 * Prefix matches, because model ids gain suffixes and a `startsWith` check keeps working when
 * `claude-opus-5` becomes `claude-opus-5-something`. An UNKNOWN model is treated as accepting —
 * the failure modes are asymmetric: wrongly omitting temperature makes an extraction prompt
 * slightly less deterministic, while wrongly sending it fails the whole request, which is exactly
 * what happened here.
 */
export const SAMPLING_REJECTING_MODEL_PREFIXES = [
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-sonnet-5',
] as const;

/** Does this model reject sampling parameters? */
export function rejectsSamplingParams(model: string | undefined | null): boolean {
  if (!model) return false;
  const id = model.trim().toLowerCase();
  return SAMPLING_REJECTING_MODEL_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * Spread into a Messages request in place of a literal `temperature`.
 *
 *     const model = modelFor('read_text').model;
 *     await client.messages.create({ model, ...samplingFor(model), ... });
 *
 * Returns an empty object for models that would 400, so the request goes out without the field
 * rather than with a field the API refuses.
 */
export function samplingFor(
  model: string | undefined | null,
  temperature = 0,
): { temperature?: number } {
  return rejectsSamplingParams(model) ? {} : { temperature };
}
