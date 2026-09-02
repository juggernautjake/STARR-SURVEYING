import { describe, it, expect } from 'vitest';
import { salvageJsonArray } from '../research/salvage-json-array.js';

// E1 — "Unterminated string in JSON at position 1452", on both reference runs, in both counties.
//
// The model's variant list was cut off mid-string and both generators did `catch { return [] }`,
// discarding a dozen good variants because the thirteenth was clipped. Address matching then ran on
// the deterministic list alone, silently, on every run.

describe('a clean array parses as itself', () => {
  it('CONTROL: valid JSON is not "salvaged"', () => {
    // If the happy path reported truncation, every caller would log a capability loss on every run
    // and the warning would stop meaning anything.
    const r = salvageJsonArray<string>('["a","b","c"]');
    expect(r.items).toEqual(['a', 'b', 'c']);
    expect(r.truncated).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('handles objects', () => {
    const r = salvageJsonArray<{ n: number }>('[{"n":1},{"n":2}]');
    expect(r.items).toHaveLength(2);
    expect(r.truncated).toBe(false);
  });
});

describe('a truncated array keeps what finished', () => {
  it('recovers complete strings from a clipped list', () => {
    // The Bell shape: cut off inside the last string.
    const r = salvageJsonArray<string>('["3779 FM 436","3779 FARM MARKET 436","3779 HIGHW');
    expect(r.items).toEqual(['3779 FM 436', '3779 FARM MARKET 436']);
    expect(r.truncated).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('recovers complete objects from a clipped list', () => {
    const raw = '[{"streetNumber":"3779","streetName":"FM 436"},{"streetNumber":"3779","streetName":"FARM MAR';
    const r = salvageJsonArray<{ streetNumber: string; streetName: string }>(raw);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].streetName).toBe('FM 436');
    expect(r.truncated).toBe(true);
  });

  it('is not fooled by a brace inside a string — the reason this is not a regex', () => {
    // A street name really can contain punctuation, and a `}` inside a value must not read as the
    // end of an object.
    const raw = '[{"streetName":"CR 200 {OLD}"},{"streetName":"CR 2';
    const r = salvageJsonArray<{ streetName: string }>(raw);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].streetName).toBe('CR 200 {OLD}');
  });

  it('is not fooled by an escaped quote', () => {
    const raw = '[{"streetName":"O\\"BRIEN LN"},{"streetName":"O';
    const r = salvageJsonArray<{ streetName: string }>(raw);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].streetName).toBe('O"BRIEN LN');
  });

  it('handles a trailing comma left by the cut', () => {
    const r = salvageJsonArray<string>('["a","b",');
    expect(r.items).toEqual(['a', 'b']);
    expect(r.truncated).toBe(true);
  });

  it('recovers nothing when nothing finished, and says so', () => {
    // Cut off inside the FIRST element. There is no honest answer but zero.
    const r = salvageJsonArray<string>('["3779 FM 4');
    expect(r.items).toEqual([]);
    expect(r.truncated).toBe(true);
  });
});

describe('anything that is not an array returns nothing rather than a guess', () => {
  it('an object is not an array', () => {
    const r = salvageJsonArray('{"a":1}');
    expect(r.items).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.reason).toMatch(/not a JSON array/i);
  });

  it('prose is not an array', () => {
    const r = salvageJsonArray('I could not determine any variants for this address.');
    expect(r.items).toEqual([]);
  });

  it('an empty response says empty, not truncated', () => {
    const r = salvageJsonArray('   ');
    expect(r.items).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it('an empty array is a real answer', () => {
    const r = salvageJsonArray('[]');
    expect(r.items).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.reason).toBeNull();
  });
});
