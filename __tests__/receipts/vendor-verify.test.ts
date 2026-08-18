// Is there really a Sonic at that address?
//
// Owner, 2026-08-18: *"If it is a sonic fast food receipt, then the address should correspond to a
// sonic restaurant."*
//
// The fixtures are the REAL receipt this was built for: a Sonic Drive-In in Marlin, Texas, whose
// photo in the live bucket reads "423 Line Oak St" where the street is Live Oak.

import { describe, it, expect } from 'vitest';
import {
  addressSimilarity, judgeCandidates, nameSimilarity, normaliseVendorName, samePhone,
  type PlaceMatch,
} from '@/lib/receipts/vendor-verify';

const sonic: PlaceMatch = {
  name: 'Sonic Drive-In',
  formattedAddress: '423 Live Oak St, Marlin, TX 76661, USA',
  primaryType: 'fast_food_restaurant',
  phone: '(254) 883-5545',
  placeId: 'x',
  nameSimilarity: 1,
};

describe('nameSimilarity', () => {
  it('matches a receipt header against a Google listing despite the noise', () => {
    // Receipts print store numbers and legal suffixes that no listing carries.
    expect(nameSimilarity('SONIC DRIVE-IN #4055', 'Sonic Drive-In')).toBeGreaterThan(0.9);
    expect(nameSimilarity('WAL-MART STORE #1234', 'Walmart Supercenter')).toBeGreaterThan(0.4);
  });

  it('scores an abbreviation as a match rather than punishing it for being short', () => {
    // Dividing by the smaller token set. A receipt header is routinely an abbreviation of the legal
    // name, and dividing by the larger set would flag the clearest matches there are.
    expect(nameSimilarity('Sonic', 'Sonic Drive-In')).toBe(1);
  });

  it('does NOT match two unrelated businesses', () => {
    expect(nameSimilarity('Sonic Drive-In', "Guy's Quick Stop")).toBe(0);
    expect(nameSimilarity('CEFCO', 'Walmart')).toBe(0);
  });

  it('survives an empty side without dividing by zero', () => {
    expect(nameSimilarity('', 'Sonic')).toBe(0);
    expect(nameSimilarity('Inc LLC', 'Sonic')).toBe(0); // normalises to nothing
  });
});

describe('normaliseVendorName', () => {
  it('strips store numbers and legal noise', () => {
    expect(normaliseVendorName('SONIC DRIVE-IN #4055, INC.')).toBe('sonic drive in');
  });
});

describe('addressSimilarity', () => {
  it('treats a misread street name as a mismatch', () => {
    // The actual failure on the actual receipt: "Line Oak" for "Live Oak". The street NUMBER and the
    // town still match, so a naive check would pass this — it must not.
    const score = addressSimilarity('423 Line Oak St, Marlin TX 76661', sonic.formattedAddress);
    expect(score).toBeLessThan(1);
  });

  it('ignores the street-type suffix, which carries no signal', () => {
    expect(addressSimilarity('423 Live Oak Street, Marlin TX 76661', sonic.formattedAddress))
      .toBeGreaterThan(0.9);
  });

  it('scores an unrelated address low', () => {
    expect(addressSimilarity('1 Main Ave, Las Cruces NM 88001', sonic.formattedAddress))
      .toBeLessThan(0.35);
  });
});

describe('samePhone', () => {
  it('compares digits, not formatting', () => {
    expect(samePhone('254-883-5545', '(254) 883-5545')).toBe(true);
    expect(samePhone('1-254-883-5545', '2548835545')).toBe(true);
  });

  it('is false for a different number, and for a missing one', () => {
    expect(samePhone('254-883-5545', '254-883-5546')).toBe(false);
    expect(samePhone(null, '2548835545')).toBe(false);
    expect(samePhone('555', '2548835545')).toBe(false);
  });
});

describe('judgeCandidates', () => {
  it('confirms the receipt when name and address both line up', () => {
    const v = judgeCandidates(
      { vendorName: 'SONIC DRIVE-IN', vendorAddress: '423 Live Oak St, Marlin TX 76661' },
      [sonic],
    );
    expect(v.status).toBe('confirmed');
    expect(v.discrepancies).toHaveLength(0);
  });

  it('confirms on a matching PHONE even when the address was misread', () => {
    // The phone number is the strongest single identifier on a receipt: ten digits, usually printed
    // larger than the address, and unique to the branch.
    const v = judgeCandidates(
      { vendorName: 'SONIC DRIVE-IN', vendorAddress: '999 Nowhere Rd, Elsewhere TX', vendorPhone: '254-883-5545' },
      [sonic],
    );
    expect(v.status).toBe('confirmed');
    expect(v.detail).toMatch(/phone number on the receipt matches/);
  });

  it('flags the case the owner described — the name is not the business at that address', () => {
    const v = judgeCandidates(
      { vendorName: 'Burger King', vendorAddress: '423 Live Oak St, Marlin TX 76661' },
      [sonic],
    );
    expect(v.status).toBe('mismatch');
    const d = v.discrepancies.find((x) => x.code === 'vendor_name_mismatch');
    expect(d).toBeDefined();
    expect(d!.message).toMatch(/Burger King/);
    expect(d!.message).toMatch(/Sonic Drive-In/);
  });

  it('flags a misread street number, naming both readings', () => {
    const v = judgeCandidates(
      { vendorName: 'SONIC DRIVE-IN', vendorAddress: '999 Different Way, Waco TX 76701' },
      [sonic],
    );
    const d = v.discrepancies.find((x) => x.code === 'vendor_address_mismatch');
    expect(d).toBeDefined();
    expect(d!.readings).toEqual([
      { source: 'receipt', value: '999 Different Way, Waco TX 76701' },
      { source: 'looked up', value: sonic.formattedAddress },
    ]);
  });

  it('reports "not found" gently — an unlisted business is not evidence of a bad receipt', () => {
    const v = judgeCandidates({ vendorName: 'Some Tiny Diner', vendorAddress: '1 Back Rd' }, []);
    expect(v.status).toBe('not_found');
    expect(v.discrepancies[0].severity).toBe('low');
    expect(v.detail).toMatch(/not proof of anything/);
  });

  it('never rewrites the receipt — the verdict only ever reports', () => {
    // A lookup that silently replaced a misread address with Google's tidy one would destroy the
    // evidence: nobody could then tell a corrected address from a transcribed one.
    const input = { vendorName: 'SONIC', vendorAddress: '423 Line Oak St, Marlin TX 76661' };
    const before = JSON.stringify(input);
    judgeCandidates(input, [sonic]);
    expect(JSON.stringify(input)).toBe(before);
  });
});
