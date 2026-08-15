// C31 / decision D4 — one AI vocabulary.
//
// ── WHAT D4 SAID, AND THE CORRECTION THE AUDIT FORCED ───────────────────────────────────────────
//
// D4: "Extending AI reach from 13 tools to 51 across *two* registries means 76 additions and a
// permanent drift risk. `tool-registry.ts` is the typed, tested one and wins; `drawing-chat`'s op
// set is adapted onto it. **This is the highest-risk slice in the doc.**"
//
// Reading both first changes what "merge" has to mean, and lowers the risk considerably. They are
// **not parallel lists of the same actions**:
//
//   tool-registry.ts   13 typed tools with arg schemas and `execute`. `claude-proposer.ts` already
//                      DERIVES its Anthropic tool list from the registry — that path has no
//                      hand-maintained duplicate and never had one.
//
//   drawing-chat.ts    a chat orchestrator whose `EDIT_DRAWING` carries bulk add/delete/modify/
//                      transform/fit/hide, described to the model by a hand-written prompt. It did
//                      not import the registry at all.
//
// So there is no 76-addition duplication to unwind. There is something narrower and still fatal to
// C34–C36: **the chat path could not reach a registry tool at all.** Adding 38 tools would have
// left it 38 tools behind, and nothing would have said so.
//
// The fix is additive. `EDIT_DRAWING` is untouched — it expresses bulk edits the registry has no
// shape for, and rewriting a working 1084-line orchestrator to fix a reach problem is the risk D4
// warns about, taken for no gain.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  aiCapabilities,
  isAICapability,
  capabilityPromptLines,
} from '@/lib/cad/ai/capabilities';
import { toolRegistry } from '@/lib/cad/ai/tool-registry';

describe('the capability list is DERIVED, never hand-written', () => {
  it('covers exactly the registry', () => {
    // A hand-written copy is precisely the drift D4 exists to prevent, and it is the failure this
    // codebase has hit repeatedly under other names: 29 tools falling through to the idle prompt
    // (C15), two snap types with no engine (C17), a code-style panel nothing read (C22).
    expect(aiCapabilities().map((c) => c.name).sort())
      .toEqual(Object.keys(toolRegistry).sort());
  });

  it('grows by itself when the registry grows', () => {
    // The property C34–C36 depend on. Asserted structurally rather than by count, so it keeps
    // holding as those slices add tools.
    const src = readFileSync(join(process.cwd(), 'lib/cad/ai/capabilities.ts'), 'utf8');
    expect(src).toMatch(/Object\.keys\(toolRegistry\)/);
    // No literal tool names anywhere in the module — one would be a copy that could go stale.
    for (const name of Object.keys(toolRegistry)) {
      expect(src, `${name} is hard-coded`).not.toMatch(new RegExp(`'${name}'`));
    }
  });

  it('carries each tool’s description and argument names', () => {
    for (const c of aiCapabilities()) {
      expect(c.description.length, c.name).toBeGreaterThan(0);
      expect(Array.isArray(c.args), c.name).toBe(true);
    }
  });

  it('reads required args off the same schema the tool validates against', () => {
    // A second copy of "which args are required" would be a second thing to get wrong.
    const addPoint = aiCapabilities().find((c) => c.name === 'addPoint')!;
    expect(addPoint.args).toContain('x');
    expect(addPoint.args).toContain('y');
    expect(addPoint.required).toContain('x');
  });
});

describe('the name guard', () => {
  it('accepts every real tool', () => {
    for (const name of Object.keys(toolRegistry)) expect(isAICapability(name)).toBe(true);
  });

  it('rejects an invention', () => {
    // The boundary where a model's string becomes a store write.
    expect(isAICapability('deleteEverything')).toBe(false);
    expect(isAICapability('')).toBe(false);
    expect(isAICapability('__proto__')).toBe(false);
    expect(isAICapability('constructor')).toBe(false);
  });

  it('uses hasOwnProperty rather than `in`', () => {
    // `'constructor' in toolRegistry` is TRUE — every object inherits it. A guard written with
    // `in` would have let a model call `constructor` and reach a prototype method, which is the
    // difference between a rejected name and an arbitrary invocation.
    const src = readFileSync(join(process.cwd(), 'lib/cad/ai/capabilities.ts'), 'utf8');
    expect(src).toMatch(/Object\.prototype\.hasOwnProperty\.call\(toolRegistry, name\)/);
  });
});

describe('the prompt lines', () => {
  it('name every tool', () => {
    const lines = capabilityPromptLines().join('\n');
    for (const name of Object.keys(toolRegistry)) expect(lines).toContain(name);
  });

  it('mark optional arguments', () => {
    // The model needs to know what it may omit; a list that showed everything as required would
    // make it invent values for fields the tool would rather default.
    expect(capabilityPromptLines().some((l) => l.includes('?)') || l.includes('?,'))).toBe(true);
  });

  it('stay one line each', () => {
    // This is prepended to an already long prompt, and every token spent listing a tool is one not
    // spent on the drawing snapshot the model actually reasons over.
    for (const l of capabilityPromptLines()) expect(l).not.toMatch(/\n/);
  });
});

describe('the chat path can now reach a tool', () => {
  const chat = readFileSync(
    join(process.cwd(), 'lib/cad/ai-engine/drawing-chat.ts'), 'utf8',
  );

  it('has a CALL_TOOL action', () => {
    expect(chat).toMatch(/\| 'CALL_TOOL'/);
    // Line-ending agnostic. These files are CRLF on this checkout, and a bare `\n` in the pattern
    // simply fails to match rather than reporting a line-ending problem — which reads as "the code
    // is missing" and sends you looking in the wrong place.
    expect(chat).toMatch(/'CALL_TOOL',\s*\]/);
  });

  it('describes the tools from the registry, not from prose', () => {
    // The hand-written prompt was the drift source: it described capabilities in words that
    // nothing checked against the code.
    expect(chat).toMatch(/\$\{capabilityPromptLines\(\)\.join\('\\n'\)\}/);
  });

  it('validates the tool name while it is still a string', () => {
    // A model that invents `deleteEverything` should fail while parsing, not after the
    // orchestrator has decided the action is worth applying.
    expect(chat).toMatch(/function parseToolCall/);
    expect(chat).toMatch(/if \(!name \|\| !isAICapability\(name\)\) return \{\}/);
  });

  it('leaves EDIT_DRAWING alone', () => {
    // It expresses bulk edits the registry has no shape for. Folding one into the other would be
    // the rewrite D4 calls the highest risk in the doc, done for no gain.
    expect(chat).toMatch(/add\?:\s+ChatFeatureSpec\[\]/);
    expect(chat).toMatch(/transform\?:\s+ChatTransformSpec/);
    expect(chat).toMatch(/type === 'EDIT_DRAWING' \? parseEditFields\(a\)/);
  });
});

describe('and the orchestrator runs it', () => {
  const store = readFileSync(
    join(process.cwd(), 'lib/cad/store/ai-conversations-store.ts'), 'utf8',
  );

  it('executes through the registry', () => {
    expect(store).toMatch(/action\.type === 'CALL_TOOL'/);
    expect(store).toMatch(/toolRegistry\[name\]\.execute\(/);
  });

  it('checks the name AGAIN before executing', () => {
    // The parser already refuses an unknown name, but an action can also arrive from a replayed
    // conversation or a hand-edited payload. The check is cheap and the failure it prevents is not.
    expect(store).toMatch(/!isAICapability\(name\)/);
  });

  it('surfaces the tool’s own refusal verbatim', () => {
    // Every tool returns `{ ok, reason }` and has already said why in the surveyor's terms.
    // Paraphrasing here would be a second wording of the same refusal, free to drift from the
    // first — the exact shape C31 is fixing one level up.
    expect(store).toMatch(/result\.reason \?\? 'no reason given'/);
  });

  it('does not let a throwing tool take the conversation with it', () => {
    // A tool that throws is a bug, not a refusal, and the surveyor still needs the reply that
    // arrived alongside the action.
    // Anchored to the CALL_TOOL block. An unanchored `catch (err)` matches the send() handler
    // hundreds of lines earlier, so the assertion would be checking a different try/catch and
    // passing or failing for reasons unrelated to this slice.
    const block = store.slice(store.indexOf("action.type === 'CALL_TOOL'"));
    expect(block.slice(0, 1600)).toMatch(/catch \(err\)[\s\S]{0,300}failed/);
  });
});
