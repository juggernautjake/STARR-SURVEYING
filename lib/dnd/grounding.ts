// lib/dnd/grounding.ts — system-scoped, anti-hallucination grounding for the AI character builder.
// Produces a strict instruction + a retrieved rules block for the character's chosen system so the
// agent uses ONLY that system's rules (never another system, never invented) and FLAGS anything it
// can't ground instead of guessing. For a system-ambiguous character it forbids assuming a ruleset.
import { searchSystemEntries } from './system-store';
import { SYSTEM_AMBIGUOUS, systemLabel } from './systems';
import { systemRulesBlock } from './system-rules';

export interface SystemGrounding {
  /** Appended to the agent's system prompt. */
  instruction: string;
  /** A user-content block of retrieved rules (may be empty). */
  block: string;
  /** How many scoped entries were retrieved. */
  matched: number;
}

export async function systemGroundingBlock(system: string | null | undefined, query: string): Promise<SystemGrounding> {
  const sys = system || SYSTEM_AMBIGUOUS;
  const label = systemLabel(sys);
  // The DETERMINISTIC authoritative rules block — always present, no embeddings/DB needed. This is
  // the core guarantee that the correct system's real mechanics/numbers are always in the prompt.
  const rulesBlock = systemRulesBlock(sys);

  if (!system || system === SYSTEM_AMBIGUOUS) {
    return {
      instruction:
        'This character is SYSTEM-AMBIGUOUS: do not assume any specific ruleset. Use only generic, ' +
        'edition-neutral mechanics; never import rules, feats, spells or numbers unique to a particular ' +
        'game system. If a value depends on a system, put it in `unmapped` (ask the user) rather than guessing.',
      block: rulesBlock,
      matched: 0,
    };
  }

  // Optional semantic enhancement: scoped RAG hits (only when an embeddings key is configured). These
  // augment — never replace — the deterministic rules block above.
  const entries = await searchSystemEntries(system, query, { matchCount: 10, minSimilarity: 0.3 }).catch(() => []);
  const ragBlock = entries.length
    ? `\n\nRETRIEVED ${label} REFERENCE ENTRIES (use alongside the authoritative rules above):\n` +
      entries.map((e) => `- [${e.kind}] ${e.name}${e.source ? ` (${e.source})` : ''}: ${e.body}`).join('\n')
    : '';

  return {
    instruction:
      `This character is built for ${label}. Use ONLY ${label} rules, feats, spells, actions, weapons and ` +
      `numbers as stated in the AUTHORITATIVE RULES block. NEVER borrow mechanics from another game system, ` +
      `and NEVER invent rules or numbers. When the sources are ambiguous, missing, or conflict with ${label}, ` +
      `put the issue in \`unmapped\` (so the user is asked) rather than guessing.`,
    block: rulesBlock + ragBlock,
    matched: entries.length,
  };
}
