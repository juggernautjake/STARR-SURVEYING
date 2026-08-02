// lib/voice/contract-status.ts — the contract state machine, as pure data.
//
// ── WHY THIS IS NOT IN contracts.ts ─────────────────────────────────────────────────────────────
//
// It was, and `npm run build` refused to compile:
//
//     Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled
//
// `ContractActions` is a client component and imports `isEditable` to decide whether to render the
// wording editor. `contracts.ts` imports `hashContractBody` from `./tokens`, and `tokens.ts` imports
// `node:crypto` — which cannot exist in a browser bundle. Webpack follows the module graph, not the
// usage, so one boolean helper drags the signing-hash module toward the client.
//
// This is the THIRD time this exact shape has appeared in this build (usage scopes, password rules,
// now the state machine), and the rule is worth stating once more where it will be read: a value the
// browser needs lives in a module with no server-only imports. The server module re-exports it so
// there is still exactly one definition.

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'countersigned' | 'void';

/**
 * Which transitions are legal, and therefore which buttons render.
 *
 * Encoded as data rather than as `if` statements across four routes, because the rule that matters —
 * a signed contract cannot go back to draft — has to hold everywhere or it holds nowhere.
 */
const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['signed', 'draft', 'void'],
  // Countersigning is Andrew's acceptance. Voiding after signature is still possible — both parties
  // can walk away — but that is a mutual act, not an edit, hence no path back to `draft`.
  signed: ['countersigned', 'void'],
  countersigned: ['void'],
  void: [],
};

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: ContractStatus): ContractStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** A contract's text is frozen the moment anyone signs it. */
export function isEditable(status: ContractStatus): boolean {
  return status === 'draft' || status === 'sent';
}
