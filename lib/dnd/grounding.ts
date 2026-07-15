// lib/dnd/grounding.ts — system-scoped, anti-hallucination grounding for the AI character builder.
// Produces a strict instruction + a retrieved rules block for the character's chosen system so the
// agent uses ONLY that system's rules (never another system, never invented) and FLAGS anything it
// can't ground instead of guessing. For a system-ambiguous character it forbids assuming a ruleset.
import { searchSystemEntries } from './system-store';
import { SYSTEM_AMBIGUOUS, systemLabel } from './systems';

export interface SystemGrounding {
  /** Appended to the agent's system prompt. */
  instruction: string;
  /** A user-content block of retrieved rules (may be empty). */
  block: string;
  /** How many scoped entries were retrieved. */
  matched: number;
}

export async function systemGroundingBlock(system: string | null | undefined, query: string): Promise<SystemGrounding> {
  const label = systemLabel(system || SYSTEM_AMBIGUOUS);

  if (!system || system === SYSTEM_AMBIGUOUS) {
    return {
      instruction:
        'This character is SYSTEM-AMBIGUOUS: do not assume any specific ruleset. Use only generic, ' +
        'edition-neutral mechanics; never import rules, feats, spells or numbers unique to a particular ' +
        'game system. If a value depends on a system, put it in `unmapped` (ask the user) rather than guessing.',
      block: '',
      matched: 0,
    };
  }

  const entries = await searchSystemEntries(system, query, { matchCount: 10, minSimilarity: 0.3 }).catch(() => []);
  const block = entries.length
    ? `RULES FROM ${label} — the ONLY system you may use for this character:\n` +
      entries.map((e) => `- [${e.kind}] ${e.name}${e.source ? ` (${e.source})` : ''}: ${e.body}`).join('\n')
    : '';

  return {
    instruction:
      `This character is built for ${label}. Use ONLY ${label} rules, feats, spells, actions, weapons and ` +
      `numbers. NEVER borrow mechanics from another game system, and NEVER invent rules. When the sources are ` +
      `ambiguous, missing, or conflict with ${label}, put the issue in \`unmapped\` (so the user is asked) ` +
      `rather than guessing. ${block ? 'Prefer the retrieved rules below over your own memory.' : `No stored ${label} rules were retrieved — rely on your ${label} knowledge only, and flag anything you are unsure belongs to ${label}.`}`,
    block,
    matched: entries.length,
  };
}
