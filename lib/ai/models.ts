// lib/ai/models.ts — one model config for the whole application (audit §5, Phase 3 item 13).
//
// §5 measured the state of AI in this repo: *"Model IDs are inconsistent and a generation behind:
// `claude-sonnet-4-5-20250929` (12 uses), `claude-sonnet-4-6` (4), `claude-opus-4-7` (1),
// `claude-haiku-4-5` (1). The current family is Claude 5. There's no central model config."*
//
// Nineteen call sites, four model IDs, several read from different environment variables, none of
// them documented. The cost of that is not aesthetic: nobody can answer "what model is answering our
// customers?" without grepping, and a model upgrade means nineteen edits and nineteen chances to
// miss one.
//
// ── ROLES, NOT MODEL NAMES, AT THE CALL SITE ────────────────────────────────────────────────────
//
// Callers ask for a ROLE — `reasoning`, `drafting`, `extraction`, `guard` — and this file decides
// which model serves it. A model upgrade then edits one table rather than every call site, and the
// cost/quality tradeoff for a given job is stated once, next to the reason for it.
//
// The environment can still override any role (`AI_MODEL_<ROLE>`), because the audit's Q52 asks what
// the monthly AI budget is and nobody has answered — a deployment must be able to move everything
// down a tier without a deploy.

import type Anthropic from '@anthropic-ai/sdk';

/** What the model is being asked to do. Chosen by the caller; the model is chosen here. */
export type AiRole =
  /** Hard, multi-step problems where being wrong is expensive: research analysis, deed parsing,
   *  anything a surveyor will rely on. */
  | 'reasoning'
  /** Customer-facing prose a human reviews before it goes out: lead replies, email drafts. */
  | 'drafting'
  /** Pulling structured fields out of a document. Bounded, checkable, high volume. */
  | 'extraction'
  /** Cheap, high-frequency classification — is this spam, is this question on-topic. Runs on every
   *  request in some paths, so the tier matters more than the ceiling. */
  | 'guard'
  /** The in-app assistant: conversational, tool-using, latency-visible. */
  | 'assistant';

export interface ModelConfig {
  model: string;
  /** Ceiling on the response. Not a target — see the note on streaming below. */
  maxTokens: number;
  /** How hard to think. `high` is the API default; stated explicitly so a change is visible. */
  effort: 'low' | 'medium' | 'high' | 'max';
  /** Adaptive thinking, or off. Off is right for short classification where the latency shows. */
  thinking: boolean;
  /** Why this role has this configuration. Read this before changing one. */
  why: string;
}

/** The current family. One constant, so an upgrade is one edit. */
export const CURRENT_MODEL = 'claude-opus-5';
/** The cheap tier, for work where the ceiling does not pay for itself. */
export const FAST_MODEL = 'claude-haiku-4-5';

const ROLE_DEFAULTS: Record<AiRole, ModelConfig> = {
  reasoning: {
    model: CURRENT_MODEL,
    maxTokens: 16000,
    effort: 'high',
    thinking: true,
    why: 'Property research and deed parsing feed a surveyor’s judgement. A cheaper model that is subtly wrong here costs more than the token difference ever saves.',
  },
  drafting: {
    model: CURRENT_MODEL,
    maxTokens: 4000,
    effort: 'medium',
    thinking: true,
    why: 'A human reads every draft before it is sent, so the failure mode is a wasted minute rather than a wrong answer to a customer.',
  },
  extraction: {
    model: CURRENT_MODEL,
    maxTokens: 8000,
    effort: 'medium',
    thinking: true,
    why: 'Bounded and checkable — the output is validated against a schema, so errors surface immediately rather than silently.',
  },
  guard: {
    model: FAST_MODEL,
    maxTokens: 1000,
    effort: 'low',
    // Off deliberately: this runs in front of a user waiting for a reply, and a second of thinking
    // to decide "is this question about surveying" is a second the user spends looking at a spinner.
    thinking: false,
    why: 'Runs on every request in some paths. A cheap yes/no where being occasionally over-cautious is fine.',
  },
  assistant: {
    model: CURRENT_MODEL,
    maxTokens: 8000,
    effort: 'medium',
    thinking: true,
    why: 'Conversational and tool-using. Latency is visible to the user, so the ceiling is not the priority — being able to act correctly is.',
  },
};

/** Per-role environment override, e.g. `AI_MODEL_REASONING=claude-sonnet-5`.
 *
 *  Q52 in the question bank asks what the monthly AI budget is and it is unanswered. Until it is, a
 *  deployment must be able to move a role down a tier without a code change — a budget ceiling that
 *  requires a deploy is a budget ceiling nobody uses in the moment they need it. */
function envOverride(role: AiRole): string | undefined {
  return process.env[`AI_MODEL_${role.toUpperCase()}`];
}

export function modelFor(role: AiRole): ModelConfig {
  const base = ROLE_DEFAULTS[role];
  const override = envOverride(role);
  return override ? { ...base, model: override } : base;
}

/** The request parameters for a role, ready to spread into `messages.create`.
 *
 *  `thinking: {type: 'adaptive'}` rather than a token budget: the fixed-budget form is removed on the
 *  current family and returns a 400, and adaptive lets the model spend what the question needs. */
export function requestParamsFor(role: AiRole): {
  model: string;
  max_tokens: number;
  thinking?: Anthropic.ThinkingConfigParam;
  output_config?: { effort: 'low' | 'medium' | 'high' | 'max' };
} {
  const cfg = modelFor(role);
  return {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    ...(cfg.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: { effort: cfg.effort },
  };
}

/** Every role and what it resolves to, for an admin screen and for the config test.
 *
 *  Exists so "what model is answering our customers?" has an answer that is not a grep. */
export function modelRoster(): Array<{ role: AiRole } & ModelConfig & { overridden: boolean }> {
  return (Object.keys(ROLE_DEFAULTS) as AiRole[]).map((role) => ({
    role,
    ...modelFor(role),
    overridden: !!envOverride(role),
  }));
}
