// __tests__/voice/contracts.test.ts
//
// A signature is the one artifact here that has to survive being disputed a year later. These tests
// cover the two things that make it hold: the body hash, and the state machine that freezes the text.

import { describe, expect, it } from 'vitest';

import { buildContract, buildSignatureRecord, checkSignature } from '@/lib/voice/contracts';
import { allowedTransitions, canTransition, isEditable } from '@/lib/voice/contract-status';
import { contractBodyIntact, hashContractBody, looksLikeToken, tokensMatch } from '@/lib/voice/tokens';

describe('checkSignature', () => {
  const base = { expectedName: 'Dana Reyes', agreed: true };

  it('refuses to sign without the affirmation ticked', () => {
    // ESIGN/UETA needs evidence of INTENT — that they meant to be bound, not merely that a name
    // appeared in a field. The tickbox is what supplies it, so it cannot be optional.
    expect(checkSignature({ ...base, typedName: 'Dana Reyes', agreed: false }).ok).toBe(false);
  });

  it('accepts the same person typing their name loosely', () => {
    // Rejecting these produces a support email instead of a signed contract.
    for (const typed of ['dana reyes', 'Dana  Reyes', 'Dana Reyes.', "Dana O'Reyes".replace("O'", '')]) {
      expect(checkSignature({ ...base, typedName: typed }).ok).toBe(true);
    }
  });

  it('accepts a middle name or a suffix', () => {
    expect(checkSignature({ ...base, typedName: 'Dana M. Reyes' }).ok).toBe(true);
  });

  it('refuses a different person, and says what to do instead', () => {
    // This is the case the loose matching exists to still catch: an assistant signing for their boss
    // binds nobody, and the fix is a reissued agreement rather than a nudged validator.
    const out = checkSignature({ ...base, typedName: 'Alex Whitfield' });
    expect(out.ok).toBe(false);
    expect(out.error).toContain('reissued');
  });

  it('refuses an initial or an empty box', () => {
    expect(checkSignature({ ...base, typedName: 'D' }).ok).toBe(false);
    expect(checkSignature({ ...base, typedName: '   ' }).ok).toBe(false);
  });

  it('accepts any real name when the agreement names nobody', () => {
    expect(checkSignature({ expectedName: '', agreed: true, typedName: 'Dana Reyes' }).ok).toBe(true);
  });
});

describe('buildSignatureRecord', () => {
  const body = 'This agreement is between Andrew Ash and Dana Reyes for one :30 radio spot.';

  it('hashes the exact text that was on screen', () => {
    // The hash is the load-bearing part of the evidence bundle. Without it, "that is not what I
    // signed" is unanswerable; with it, an edit after signing is detectable rather than silent.
    const rec = buildSignatureRecord({ typedName: 'Dana Reyes', body });
    expect(contractBodyIntact(body, rec.body_hash)).toBe(true);
    expect(contractBodyIntact(body + ' Plus a national buyout.', rec.body_hash)).toBe(false);
  });

  it('produces a stable hash for identical text', () => {
    expect(hashContractBody(body)).toBe(hashContractBody(body));
  });

  it('truncates evidence fields that come from an untrusted client', () => {
    const rec = buildSignatureRecord({
      typedName: 'Dana Reyes',
      body,
      ip: 'x'.repeat(500),
      userAgent: 'y'.repeat(2000),
    });
    expect(rec.signature_ip).toHaveLength(60);
    expect(rec.signature_user_agent).toHaveLength(400);
  });

  it('normalises the email and records the moment', () => {
    const now = new Date('2026-08-02T18:30:00.000Z');
    const rec = buildSignatureRecord({ typedName: ' Dana Reyes ', email: '  DANA@Example.COM ', body, now });
    expect(rec.signer_name).toBe('Dana Reyes');
    expect(rec.signer_email).toBe('dana@example.com');
    expect(rec.signed_at).toBe('2026-08-02T18:30:00.000Z');
    expect(rec.status).toBe('signed');
  });
});

describe('the contract state machine', () => {
  it('never lets a signed contract go back to draft', () => {
    // The single rule this machine exists for. If it holds anywhere it must hold everywhere, which is
    // why it is data rather than an `if` repeated across four routes.
    expect(canTransition('signed', 'draft')).toBe(false);
    expect(canTransition('countersigned', 'draft')).toBe(false);
    expect(canTransition('void', 'draft')).toBe(false);
  });

  it('lets an unsigned contract be pulled back for editing', () => {
    expect(canTransition('sent', 'draft')).toBe(true);
  });

  it('leaves voiding available right up to countersignature', () => {
    // Both parties can walk away; that is a mutual act, not an edit.
    for (const s of ['draft', 'sent', 'signed', 'countersigned'] as const) {
      expect(canTransition(s, 'void')).toBe(true);
    }
  });

  it('makes void terminal', () => {
    expect(allowedTransitions('void')).toEqual([]);
  });

  it('freezes the wording the moment anyone signs', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('sent')).toBe(true);
    expect(isEditable('signed')).toBe(false);
    expect(isEditable('countersigned')).toBe(false);
    expect(isEditable('void')).toBe(false);
  });
});

describe('tokens', () => {
  it('accepts a real token and rejects the shapes an attacker would try', () => {
    expect(looksLikeToken('W-UAM9XVq7QqvMjmM8Eh392x5fQwvIxyE5yQMm03feI')).toBe(true);
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken('short')).toBe(false);
    expect(looksLikeToken(null)).toBe(false);
    expect(looksLikeToken(12345)).toBe(false);
    // A token is base64url. Anything with a slash or a dot could be a traversal attempt.
    expect(looksLikeToken('../../etc/passwd')).toBe(false);
  });

  it('treats absent tokens as non-matching rather than as equal', () => {
    // Two nulls comparing equal would make an unset token match an unset token — an open door.
    expect(tokensMatch(null, null)).toBe(false);
    expect(tokensMatch(undefined, undefined)).toBe(false);
    expect(tokensMatch('abc', null)).toBe(false);
  });
});

describe('buildContract', () => {
  const input = {
    clientName: 'Dana Reyes',
    artistName: 'Andrew Ash',
    projectTitle: 'National radio spot',
    feeCents: 95000,
  };

  it('puts the fee and both parties into the text', () => {
    const body = buildContract('voiceover', input);
    expect(body).toContain('Dana Reyes');
    expect(body).toContain('Andrew Ash');
    expect(body).toContain('950');
  });

  it('produces a body for every template id it advertises', () => {
    for (const id of ['voiceover', 'coaching']) {
      expect(buildContract(id, input).length).toBeGreaterThan(200);
    }
  });
});
