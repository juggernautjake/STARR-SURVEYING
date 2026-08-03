// Reading the corner markers out of the calls.
//
// The extraction already captured monument text; nothing parsed it, so `toPoint` travelled the whole
// platform as a sentence and the field packet printed it and no more.
//
// The assertions that matter are about STATUS. Found vs set is what boundary retracement rests on: a
// found monument, if original, CONTROLS the corner over the record distance; a set one is the
// previous surveyor's opinion made permanent. Treating a set rod as found is how a boundary drifts —
// surveyor A sets it a foot off, surveyor B holds it, and the error is now permanent with a paper
// trail behind it.
//
// So nothing here is allowed to guess a status, and the "not found" test exists because `found` is a
// substring of `not found` and getting that backwards inverts the most consequential field.

import { describe, it, expect } from 'vitest';
import {
  monumentCap,
  monumentKind,
  monumentRpls,
  monumentSize,
  monumentStatus,
  parseMonument,
  summariseMonuments,
  type Monument,
} from '../services/monuments.js';

describe('what the marker is', () => {
  it('reads the common Texas monuments', () => {
    expect(monumentKind('a 1/2 inch iron rod')).toBe('iron_rod');
    expect(monumentKind('a 3/4" iron pipe')).toBe('iron_pipe');
    expect(monumentKind('a concrete monument')).toBe('concrete_monument');
    expect(monumentKind('a PK nail in asphalt')).toBe('pk_nail');
    expect(monumentKind('a railroad spike')).toBe('railroad_spike');
    expect(monumentKind('a mag nail')).toBe('mag_nail');
    expect(monumentKind('an axle')).toBe('axle');
    expect(monumentKind('a fence corner post')).toBe('fence_corner');
  });

  it('reads the abbreviations a plat legend uses', () => {
    expect(monumentKind('IRF')).toBe('iron_rod');
    expect(monumentKind('CIRS')).toBe('iron_rod');
    expect(monumentKind('IPF')).toBe('iron_pipe');
  });

  it('prefers the more specific object', () => {
    // "iron pipe" must beat "iron", and "concrete monument" must beat a bare nail-in-concrete rule,
    // or a pipe silently becomes a rod at every corner.
    expect(monumentKind('a 3/4 inch iron pipe found')).toBe('iron_pipe');
    expect(monumentKind('an X cut in concrete')).toBe('cross_in_concrete');
  });

  it('does not invent a monument at a mathematical corner', () => {
    // "to a point" is a real and common call: a corner with nothing in the ground. Reporting it as a
    // monument sends a crew looking for something nobody claimed was there.
    expect(parseMonument('to a point')).toBeNull();
    expect(parseMonument('to the place of beginning')).toBeNull();
    expect(parseMonument('')).toBeNull();
  });
});

describe('found or set — never guessed', () => {
  it('reads found', () => {
    expect(monumentStatus('a 1/2 inch iron rod found')).toBe('found');
    expect(monumentStatus('IRF')).toBe('found');
    expect(monumentStatus('iron rod recovered')).toBe('found');
  });

  it('reads set', () => {
    expect(monumentStatus('a 5/8 inch iron rod set')).toBe('set');
    expect(monumentStatus('CIRS')).toBe('set');
  });

  it('does NOT read "not found" as found', () => {
    // `found` is a substring of `not found`. Getting this backwards turns a missing corner into
    // controlling evidence.
    expect(monumentStatus('iron rod not found')).toBe('not_found');
    expect(monumentStatus('concrete monument called for, none found')).toBe('not_found');
    expect(monumentStatus('original stone destroyed')).toBe('not_found');
  });

  it('leaves an unstated status unknown rather than assuming either', () => {
    // Defaulting to found manufactures controlling evidence; defaulting to set discards it.
    expect(monumentStatus('an iron rod')).toBe('unknown');
    expect(parseMonument('an iron rod')!.statusUncertain).toBe(true);
  });

  it('distinguishes a monument the record merely calls for', () => {
    expect(monumentStatus('an iron rod called for per deed')).toBe('called_for');
  });
});

describe('the detail a crew needs to identify one', () => {
  it('keeps the size as a fraction', () => {
    // A crew searching a fence line looks for a "half inch rod". 0.5 tells them nothing.
    expect(monumentSize('a 1/2 inch iron rod')).toBe('1/2"');
    expect(monumentSize('a 5/8" iron rod')).toBe('5/8"');
    expect(monumentSize('a 3/4 inch pipe')).toBe('3/4"');
    expect(monumentSize('an iron rod')).toBeNull();
  });

  it('reads the cap, which is how one surveyor\'s rod is told from another\'s', () => {
    expect(monumentCap('iron rod with yellow cap stamped "RPLS 5310"')).toBe('RPLS 5310');
    expect(monumentCap('iron rod with cap marked BRITTAIN')).toContain('BRITTAIN');
  });

  it('pulls the registration number out', () => {
    expect(monumentRpls('cap stamped RPLS 5310')).toBe('5310');
    expect(monumentRpls('capped RLS #1234')).toBe('1234');
    expect(monumentRpls('a plain iron rod')).toBeNull();
  });

  it('records reported condition', () => {
    expect(parseMonument('1/2 inch iron rod found, bent')!.condition).toContain('bent');
  });
});

describe('what the crew is told', () => {
  it('says a found monument may CONTROL the corner', () => {
    const m = parseMonument('a 5/8 inch iron rod with cap stamped RPLS 5310 found')!;
    expect(m.statement).toContain('FOUND');
    expect(m.statement).toContain('CONTROLS this corner');
    expect(m.statement).toContain('5/8"');
    expect(m.rpls).toBe('5310');
  });

  it('says a set monument is an opinion, not evidence', () => {
    const m = parseMonument('a 1/2 inch iron rod set')!;
    expect(m.statement).toContain("previous surveyor's OPINION");
    expect(m.statement).toContain('Do not hold it as original');
  });

  it('tells the crew to search for one the record only calls for', () => {
    const m = parseMonument('an iron rod called for per deed')!;
    expect(m.statement).toContain('Search for it');
  });

  it('says a missing corner has to be re-established, and that this is a judgement', () => {
    const m = parseMonument('iron rod not found')!;
    expect(m.statement).toContain('re-established');
    expect(m.statement).toContain('judgement to record');
  });

  it('makes an unstated status a question rather than an answer', () => {
    const m = parseMonument('an iron rod')!;
    expect(m.statement).toContain('does NOT say whether it was found or set');
    expect(m.statement).toContain('settled in the field');
  });

  it('always keeps the raw text so a person can check the parse', () => {
    const raw = 'a 5/8 inch iron rod with yellow cap stamped "RPLS 5310" found, bent';
    expect(parseMonument(raw)!.raw).toBe(raw);
  });
});

describe('the corners of a property, together', () => {
  const parse = (s: string) => parseMonument(s)!;
  const set: Monument[] = [
    parse('1/2 inch iron rod found'),
    parse('1/2 inch iron rod found'),
    parse('5/8 inch iron rod set with cap RPLS 5310'),
    parse('concrete monument not found'),
    parse('an iron pipe'),
  ];

  it('leads with what was FOUND', () => {
    const s = summariseMonuments(set);
    expect(s.found).toBe(2);
    expect(s.statement.startsWith('2 monument(s) reported FOUND')).toBe(true);
  });

  it('never folds unknown-status monuments into the total silently', () => {
    const s = summariseMonuments(set);
    expect(s.unknownStatus).toBe(1);
    expect(s.statement).toContain('whether they control is an open question');
  });

  it('flags corners that need re-establishing', () => {
    expect(summariseMonuments(set).statement).toContain('NOT recovered');
  });

  it('lists the registration numbers actually in the ground', () => {
    expect(summariseMonuments(set).rplsNumbers).toEqual(['5310']);
  });

  it('says an absence of described monuments is about the DOCUMENT, not the ground', () => {
    const s = summariseMonuments([]);
    expect(s.statement).toContain('about the DOCUMENT, not about the ground');
  });
});
