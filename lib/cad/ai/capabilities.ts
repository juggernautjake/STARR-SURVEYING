// lib/cad/ai/capabilities.ts — C31 / decision D4, one AI vocabulary
//
// ── WHAT D4 SAID, AND WHAT THE AUDIT FOUND ──────────────────────────────────────────────────────
//
// D4: "Extending AI reach from 13 tools to 51 across *two* registries means 76 additions and a
// permanent drift risk. `tool-registry.ts` is the typed, tested one and wins; `drawing-chat`'s op
// set is adapted onto it."
//
// The premise needs one correction before the work is safe to do, because it changes what "merge"
// means. The two are **not parallel lists of the same actions**:
//
//   tool-registry.ts    13 typed tools with arg schemas and `execute`. `claude-proposer.ts` already
//                       DERIVES the Anthropic tool list from it — adding a tool there is already
//                       automatically callable on that path. Nothing is hand-maintained.
//
//   drawing-chat.ts     a chat orchestrator with its own `EDIT_DRAWING` action carrying bulk
//                       add/delete/modify/transform/fit/createLayers/hide/unhide, described to the
//                       model by a **hand-written prompt**. It does not import the registry at all.
//
// So there is no 76-addition duplication to unwind. There is something more specific: the chat path
// cannot reach a registry tool at all, and its capabilities are described in prose that nothing
// checks against the code. Adding 38 tools would leave the chat path 38 tools behind, silently.
//
// ── WHAT THIS MODULE IS ─────────────────────────────────────────────────────────────────────────
//
// The bridge, built additively. `EDIT_DRAWING` is untouched — it expresses bulk geometry edits the
// registry has no shape for, and rewriting a working 1084-line orchestrator to fix a reach problem
// would be the risk D4 warns about, taken for no gain.
//
// Instead the chat gains ONE new action that routes to the registry, and the prompt's list of what
// that action can do is **generated from `toolRegistry`** rather than written by hand. After this,
// a tool added in C34–C36 is reachable from both paths by existing, which is the whole point of
// doing D4 before them.

import { toolRegistry, type ToolName } from './tool-registry';

/** A tool as the chat prompt needs to describe it. */
export interface AICapability {
  name: ToolName;
  description: string;
  /** Argument names, in declaration order, so the prompt can show a call shape without embedding a
   *  second copy of the schema that could drift from the first. */
  args: string[];
  required: string[];
}

type SchemaLike = {
  properties?: Record<string, unknown>;
  required?: unknown;
};

/**
 * Every AI-callable tool, read off the registry.
 *
 * **Derived, never hand-listed.** A hand-written copy is exactly the drift D4 exists to prevent,
 * and it is the failure mode this codebase has hit repeatedly under a different name — the
 * command-prompt coverage gap (C15), the snap types with no engine (C17), the code-style panel with
 * no reader (C22). A list maintained beside the thing it describes is a list that will disagree
 * with it.
 */
export function aiCapabilities(): AICapability[] {
  return (Object.keys(toolRegistry) as ToolName[]).map((name) => {
    const def = toolRegistry[name] as { description?: string; inputSchema?: SchemaLike };
    const schema = def.inputSchema ?? {};
    const props = schema.properties ?? {};
    return {
      name,
      description: def.description ?? '',
      args: Object.keys(props),
      required: Array.isArray(schema.required) ? (schema.required as string[]) : [],
    };
  });
}

/** True when the chat model names a tool that actually exists. Guards the boundary where a model's
 *  invention becomes an execution. */
export function isAICapability(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(toolRegistry, name);
}

/**
 * The lines the chat system prompt uses to describe the callable tools.
 *
 * Kept terse on purpose: this is prepended to an already long prompt, and every token spent listing
 * a tool is one not spent on the drawing snapshot the model actually reasons over.
 */
export function capabilityPromptLines(): string[] {
  return aiCapabilities().map((c) => {
    const args = c.args
      .map((a) => (c.required.includes(a) ? a : `${a}?`))
      .join(', ');
    return `  - ${c.name}(${args}) — ${c.description}`;
  });
}
