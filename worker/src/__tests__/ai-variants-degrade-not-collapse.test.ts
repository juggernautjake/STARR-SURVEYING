import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// E1/E2 — the AI variant generator returned truncated JSON on BOTH reference runs, and both
// generators threw the whole list away.
//
//     Bell:   Unterminated string in JSON at position 1452
//     Milam:  Unexpected end of JSON input
//
// E2's requirement is the interesting half: "a parse failure must be visible as a CAPABILITY loss,
// not a log line. It silently halved address matching on both reference runs."
//
// ── A CORRECTION TO THE PLAN, RECORDED HERE BECAUSE IT CHANGED THE FIX ──────────────────────────
//
// The plan reasoned from `Tried 0 variants` that a parse failure had discarded the DETERMINISTIC
// list too. It had not. `diagnostics.variantsTried` is pushed when a variant gets a response, and
// the catch path pushes as well — so a parse failure cannot zero it.
//
// The real cause is in §1.5: the CAD host was unreachable and the circuit breaker skipped the search
// entirely. `Tried 0 variants` was literally true, and the sentence around it — "All CAD search
// layers exhausted — property not found" — turned "we could not look" into "we looked and it is not
// there". A claim about the property, from a search that never ran.

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');

const codeOnly = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const bisCad = codeOnly(read('src/services/bis-cad.ts'));
const normalizer = codeOnly(read('src/services/address-normalizer.ts'));

describe('both variant generators salvage instead of collapsing', () => {
  it('CONTROL: there really are two of them', () => {
    // They are separate implementations of the same idea, and fixing one would have left the other
    // failing exactly as before.
    expect(bisCad).toContain('generateAiAddressVariants');
    expect(normalizer).toContain('generateAiAddressVariants');
  });

  it('neither parses the model response with a bare JSON.parse any more', () => {
    expect(bisCad, 'bis-cad still throws the list away on a clipped response')
      .not.toMatch(/JSON\.parse\(cleaned\)/);
    expect(normalizer, 'address-normalizer still throws the list away')
      .not.toMatch(/JSON\.parse\(cleaned\)/);
  });

  it('both use the shared salvage', () => {
    expect(bisCad).toContain('salvageJsonArray<');
    expect(normalizer).toContain('salvageJsonArray<');
  });

  it('the token ceiling is above the length that was being cut off', () => {
    // The responses were clipped at position 1452 against a 1,024-token ceiling.
    expect(bisCad).not.toContain('max_tokens: 1024');
    expect(normalizer).not.toContain('max_tokens: 1024');
    expect(bisCad).toContain('max_tokens: 2048');
    expect(normalizer).toContain('max_tokens: 2048');
  });
});

describe('a truncated list is reported as a capability loss — E2', () => {
  it('says the run is matching on fewer variants than it asked for', () => {
    expect(bisCad).toMatch(/Address matching is running on fewer variants/);
  });

  it('names it UNAVAILABLE when nothing survived, rather than "no ideas"', () => {
    // The distinction E2 is about: "the model had no suggestions" and "we lost the model's
    // suggestions" lead to different actions and used to read identically.
    expect(bisCad).toMatch(/AI variants UNAVAILABLE this run/);
    expect(bisCad).toMatch(/deterministic variants only/);
  });
});

describe('the failure message no longer claims a search that did not happen', () => {
  it('does not assert "exhausted" unconditionally', () => {
    // The self-contradiction: "All CAD search layers exhausted ... Tried 0 variants."
    const exhausted = bisCad.match(/All CAD search layers exhausted/g) ?? [];
    expect(exhausted.length, 'the unconditional exhausted message is back').toBeLessThanOrEqual(1);
  });

  it('an unreachable site says nothing was searched', () => {
    expect(bisCad).toContain('diagnostics.siteUnreachable');
    expect(bisCad).toMatch(/NOT a finding that the property does not exist/);
  });

  it('zero variants and N variants read differently', () => {
    const at = bisCad.indexOf('const tried = diagnostics.variantsTried.length;');
    expect(at, 'the branching message is gone').toBeGreaterThan(-1);
    const block = bisCad.slice(at, at + 1400);
    expect(block).toContain('tried === 0');
    expect(block).toMatch(/nothing can be concluded/);
    expect(block).toMatch(/property not found after \$\{tried\} variant/);
  });

  it('a server-confirmed "no results" is now counted as a variant tried', () => {
    // It was the one path that did not record, and it is the only one that is a genuine negative
    // finding — the server answered and said it holds nothing. Under-counting it made a thorough
    // search look like no search at all.
    const at = bisCad.indexOf('No results (server confirmed)');
    expect(at).toBeGreaterThan(-1);
    const block = bisCad.slice(at, at + 400);
    expect(block).toContain('diagnostics.variantsTried.push(');
  });
});
