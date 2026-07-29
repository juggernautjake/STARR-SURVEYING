// lib/dnd/recovery.ts — a way back into an account (P2-4, audit F-3).
//
// THE PROBLEM THIS SOLVES IS STRUCTURAL, not a missing feature. Identity here is `name:<normalized>` with
// **no email**, by deliberate design — the owner's rule was "name + password, nothing else". The
// consequence nobody had followed through on: a forgotten password means every character, variant, campaign
// membership and piece of homebrew on that account is **permanently unreachable**, with no admin path and
// no support channel. For a platform whose whole point is that your characters persist, that is the worst
// possible failure, and it is silent until it happens to someone.
//
// WHY A CODE AND NOT AN EMAIL. Adding "forgot password → email link" would mean collecting an email, which
// is exactly the design the owner rejected. A one-time recovery code keeps the no-email property: it is
// shown once, the user writes it down (or does not), and it is stored only as a bcrypt hash — so the code
// is worth no more to a database reader than the password is.
//
// WHAT THIS IS NOT: it is not a second password. A recovery code is single-use — redeeming it clears the
// stored hash — because a permanent secondary credential doubles the attack surface of every account
// forever in exchange for convenience nobody asked for.

/**
 * The alphabet. Deliberately excludes I, O, 0, 1, S, 5, B, 8 — a recovery code's entire job is to be
 * transcribed correctly from a screen (or a scrap of paper) months later, and confusable glyphs are the
 * main reason that fails. 27 symbols over 20 characters is ~95 bits — far beyond anything guessable, and
 * the throttle on the redemption route makes online guessing hopeless regardless.
 */
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYZ23467';

/** Groups of four, hyphenated — `ACDE-FGHJ-KLMN-PQRT-UVWX`. Long enough to be unguessable, short enough
 *  that a person will actually write it down. */
export const RECOVERY_GROUPS = 5;
export const RECOVERY_GROUP_SIZE = 4;

/**
 * Generate a recovery code from a source of randomness.
 *
 * `randomBytes` is injected rather than imported so this stays pure and testable — and so the caller is the
 * one reaching for `node:crypto`, keeping this module usable anywhere. Rejection sampling avoids the modulo
 * bias a naive `% ALPHABET.length` would introduce; with a 27-symbol alphabet, plain modulo over 256 would
 * make the first few letters measurably more likely, which is the kind of flaw that looks fine forever.
 */
export function generateRecoveryCode(randomBytes: (n: number) => Uint8Array): string {
  const need = RECOVERY_GROUPS * RECOVERY_GROUP_SIZE;
  const chars: string[] = [];
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (chars.length < need) {
    // Over-draw so the loop almost never needs a second round.
    for (const byte of randomBytes(need * 2)) {
      if (byte >= max) continue; // biased tail — discard rather than fold it in
      chars.push(ALPHABET[byte % ALPHABET.length]);
      if (chars.length === need) break;
    }
  }
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i++) {
    groups.push(chars.slice(i * RECOVERY_GROUP_SIZE, (i + 1) * RECOVERY_GROUP_SIZE).join(''));
  }
  return groups.join('-');
}

/**
 * Normalize a code as TYPED into the canonical form, so redemption is forgiving of the ways people
 * transcribe things: lower case, missing hyphens, stray spaces.
 *
 * The confusable substitutions are the interesting part. Because the alphabet excludes O/0, I/1 and S/5, a
 * typed `0` can only have been meant as `O`… which is not in the alphabet either — so it maps to nothing
 * and the code correctly fails. What we CAN do safely is the reverse: someone reading `O` off a screen that
 * never prints `O` has misread `Q` or `D`, and guessing would be worse than failing. So this normalizes
 * form only, never glyphs. Being forgiving about layout and strict about content is the right split.
 */
export function normalizeRecoveryCode(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Is this even shaped like a code? Cheap pre-check so an obviously wrong input never reaches bcrypt. */
export function looksLikeRecoveryCode(input: string): boolean {
  const bare = normalizeRecoveryCode(input);
  if (bare.length !== RECOVERY_GROUPS * RECOVERY_GROUP_SIZE) return false;
  return [...bare].every((c) => ALPHABET.includes(c));
}

/** The canonical hyphenated form of a normalized code — what gets hashed, and what is displayed. */
export function formatRecoveryCode(input: string): string {
  const bare = normalizeRecoveryCode(input);
  const groups: string[] = [];
  for (let i = 0; i < bare.length; i += RECOVERY_GROUP_SIZE) {
    groups.push(bare.slice(i, i + RECOVERY_GROUP_SIZE));
  }
  return groups.join('-');
}
