// lib/voice/usage.ts — usage licence scopes, as pure data.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────────────────────────
//
// These six scopes started life inside `lib/voice/contracts.ts`, which is where they belong
// conceptually — a usage scope is a contract term. That broke every page on the site with:
//
//     Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled
//     Import trace: node:crypto → lib/voice/tokens.ts → lib/voice/contracts.ts
//                              → app/AndrewAsh/_ui/InquiryForm.tsx
//
// `InquiryForm` is a client component. It imports one constant from `contracts.ts` to populate a
// dropdown. `contracts.ts` imports `hashContractBody` from `tokens.ts` for the signature record, and
// `tokens.ts` imports `node:crypto` — which cannot exist in a browser bundle. The client had no need
// of any of it, but an import is an import: webpack follows the module graph, not the usage.
//
// The general rule this file exists to obey: SHARED CONSTANTS AND SERVER-ONLY CODE MUST NOT LIVE IN
// THE SAME MODULE. The moment a client component needs one value from a server module, the whole
// server module — and everything it imports, transitively — is dragged toward the browser bundle.
// The failure is loud here; the version that is not loud is a server secret ending up in client
// JavaScript.
//
// `contracts.ts` re-exports these so server code can keep importing them from the module it thinks of
// them as belonging to, and there is still exactly one definition.

export const USAGE_SCOPES = [
  {
    id: 'internal',
    label: 'Internal use only',
    detail: 'Used inside the client’s organisation — training, internal comms. Not public-facing.',
  },
  {
    id: 'telephony',
    label: 'Phone system / on-hold',
    detail: 'IVR menus, on-hold messaging and voicemail for the client’s own lines.',
  },
  {
    id: 'web',
    label: 'Web & social',
    detail: 'The client’s website and owned social channels. No paid placement.',
  },
  {
    id: 'regional',
    label: 'Regional broadcast',
    detail: 'Paid placement within a defined region — radio, local TV, regional streaming.',
  },
  {
    id: 'national',
    label: 'National broadcast',
    detail: 'Paid placement nationally across broadcast and streaming.',
  },
  {
    id: 'buyout',
    label: 'Full buyout',
    detail:
      'Unlimited use, all media, in perpetuity. Priced accordingly — this gives away every future fee.',
  },
] as const;

export type UsageScopeId = (typeof USAGE_SCOPES)[number]['id'];

/** Falls back to `web`, the most common scope, rather than returning undefined — every caller here
 *  is rendering a label, and a missing label is a blank space in a contract. */
export function usageScope(id: string | null | undefined) {
  return USAGE_SCOPES.find((u) => u.id === id) ?? USAGE_SCOPES[2];
}
