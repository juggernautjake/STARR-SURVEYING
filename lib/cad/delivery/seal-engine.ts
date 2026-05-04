// lib/cad/delivery/seal-engine.ts
//
// Phase 7 §8 — RPLS digital seal engine.
//
// Two pure helpers + one canonicalizer:
//   * `computeDrawingHash(doc)` — canonicalizes the document
//     (deterministic key order, transient state stripped) and
//     hashes the resulting JSON with SHA-256.
//   * `applySeal(doc, sealData)` — returns a new document with
//     `settings.sealData` populated and `settings.sealed=true`.
//   * `verifyDrawingSeal(doc)` — recomputes the hash and
//     compares against the stored signature so callers can
//     detect post-seal drift before accepting / printing.
//
// Hash uses the Web Crypto SubtleCrypto interface, which is
// available in modern browsers and Node ≥ 16. The function is
// async because that API is async.
//
// We don't sign the seal here — the legal "signature" today
// is the canonicalized hash + RPLS license number. PKI-grade
// signing lands as a follow-up if/when a state board accepts
// electronic-signature workflows.

import type { DrawingDocument } from '../types';

export type SealType =
  | 'DIGITAL_IMAGE'
  | 'DIGITAL_SIGNATURE'
  | 'PLACEHOLDER';

export interface SealData {
  rplsLicense:   string;
  rplsName:      string;
  /** State of licensure, e.g. "Texas". */
  state:         string;
  /** ISO 8601 timestamp the seal was applied. */
  sealedAt:      string;
  /** Base64-encoded PNG of the embossed seal (optional). */
  sealImage:     string | null;
  /** Hex SHA-256 of the canonicalized document at seal time. */
  signatureHash: string;
  sealType:      SealType;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Apply the seal to the document. Pure — returns a new
 * `DrawingDocument` with `settings.sealData` populated and
 * `settings.sealed=true`. Caller is responsible for landing
 * the new document in the drawing store.
 */
export function applySeal(
  doc: DrawingDocument,
  sealData: SealData
): DrawingDocument {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      sealed: true,
      sealData,
    },
    modified: new Date().toISOString(),
  };
}

/**
 * Compute the canonical SHA-256 hash of the document content.
 * Strips transient state (sealData, sealed flag, autosave
 * timestamps) so re-applying the seal doesn't change the hash
 * input on its own.
 */
export async function computeDrawingHash(
  doc: DrawingDocument
): Promise<string> {
  const json = JSON.stringify(canonicalize(doc));
  return sha256Hex(json);
}

/**
 * Verify the stored seal hash against a freshly-computed one.
 * Returns:
 *   * `null` when no seal is present.
 *   * `{ ok: true,  hash }` when the hashes match.
 *   * `{ ok: false, expected, actual }` on drift so the caller
 *     can surface a "drawing changed since seal" warning.
 */
export async function verifyDrawingSeal(
  doc: DrawingDocument
): Promise<
  | null
  | { ok: true;  hash: string }
  | { ok: false; expected: string; actual: string }
> {
  const sealData = doc.settings.sealData;
  if (!sealData || !sealData.signatureHash) return null;
  const actual = await computeDrawingHash(doc);
  if (actual === sealData.signatureHash) {
    return { ok: true, hash: actual };
  }
  return { ok: false, expected: sealData.signatureHash, actual };
}

// ────────────────────────────────────────────────────────────
// Canonicalization
// ────────────────────────────────────────────────────────────

/**
 * Build a canonical, deterministic representation of the
 * document so the same content always produces the same hash.
 * Strips transient state that shouldn't influence the seal:
 *   * `settings.sealData` + `settings.sealed` (would create a
 *     chicken/egg cycle).
 *   * `modified` timestamp (touches on every keystroke).
 *   * Object keys are sorted recursively so JSON.stringify
 *     produces a stable byte sequence.
 */
function canonicalize(doc: DrawingDocument): unknown {
  const { sealData: _sealData, sealed: _sealed, ...settings } = doc.settings;
  void _sealData;
  void _sealed;
  const stripped = {
    ...doc,
    modified: '',
    settings,
  };
  return sortDeep(stripped);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ────────────────────────────────────────────────────────────
// SHA-256 — Web Crypto SubtleCrypto
// ────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const buf = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', buf);
  return bufferToHex(digest);
}

function getSubtleCrypto(): SubtleCrypto {
  if (
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    globalThis.crypto?.subtle
  ) {
    return globalThis.crypto.subtle;
  }
  throw new Error(
    'Web Crypto SubtleCrypto is not available in this runtime.'
  );
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Factory helpers
// ────────────────────────────────────────────────────────────

export interface BuildSealInputs {
  rplsName:    string;
  rplsLicense: string;
  state?:      string;
  sealImage?:  string | null;
  sealType?:   SealType;
}

/**
 * Build a `SealData` object from the supplied RPLS credentials
 * and the freshly-computed drawing hash. Convenience wrapper so
 * callers don't have to wire `computeDrawingHash` manually.
 */
export async function buildSealData(
  doc: DrawingDocument,
  inputs: BuildSealInputs
): Promise<SealData> {
  const signatureHash = await computeDrawingHash(doc);
  return {
    rplsName: inputs.rplsName,
    rplsLicense: inputs.rplsLicense,
    state: inputs.state ?? 'Texas',
    sealedAt: new Date().toISOString(),
    sealImage: inputs.sealImage ?? null,
    signatureHash,
    sealType:
      inputs.sealType ??
      (inputs.sealImage ? 'DIGITAL_IMAGE' : 'PLACEHOLDER'),
  };
}
