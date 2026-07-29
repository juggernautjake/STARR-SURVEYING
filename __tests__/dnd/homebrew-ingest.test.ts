// Build a piece from a document (P6-16).
//
// The owner's ask: *"upload a pdf or file that describes the feat or homebrewed things and have AI analyze
// it and build the thing from the provided content."* This is the path the owner used to get the Pugilist
// into this repo, so the bar is not "extract some text" — it is that the wording survives, because a
// paraphrased class is a different class.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fieldAcceptsIngest, normalizeIngest, mergeIngest, ingestFieldBrief, ingestUserPrompt,
  INGEST_SYSTEM_PROMPT, INGEST_MIME, INGEST_ACCEPT,
} from '@/lib/dnd/homebrew/ingest';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/homebrew/ingest/route.ts');
const builder = read('app/dnd/_ui/ContentBuilder.tsx');

describe('what ingest may fill', () => {
  it('prose, tags and numbers', () => {
    const fields = fieldsForKind('feat');
    expect(fieldAcceptsIngest(fields.find((f) => f.key === 'description')!)).toBe(true);
    expect(fieldAcceptsIngest(fields.find((f) => f.key === 'tags')!)).toBe(true);
  });

  it('but NOT the structured editors', () => {
    // Getting a level ladder subtly wrong from a PDF is worse than leaving it blank: the author would have
    // to check all twenty levels to find the one that drifted.
    for (const kind of HOMEBREW_KINDS) {
      for (const f of fieldsForKind(kind)) {
        if (['statblock', 'levels', 'effects', 'list', 'image'].includes(f.type)) {
          expect(fieldAcceptsIngest(f), `${kind}.${f.key} (${f.type})`).toBe(false);
        }
      }
    }
  });

  it('and every kind has something worth filling', () => {
    for (const kind of HOMEBREW_KINDS) {
      expect(ingestFieldBrief(kind).length, `${kind} would send an empty field list`).toBeGreaterThan(20);
    }
  });
});

describe('the prompt transcribes rather than designs', () => {
  it('says the document is the authority', () => {
    expect(INGEST_SYSTEM_PROMPT).toMatch(/TRANSCRIBING, not designing/);
    expect(INGEST_SYSTEM_PROMPT).toMatch(/The document is the authority/);
  });

  it('forbids paraphrasing rules text, and says why', () => {
    // The failure would be silent: the author reads a plausible sentence and does not notice it is not the
    // one their book contains.
    expect(INGEST_SYSTEM_PROMPT).toMatch(/Do not paraphrase rules text/);
    expect(INGEST_SYSTEM_PROMPT).toMatch(/a reworded rule is a\s*\n?·?\s*different rule/);
  });

  it('says omit rather than guess', () => {
    expect(INGEST_SYSTEM_PROMPT).toMatch(/omit it entirely\s*\n?·?\s*rather than guessing/);
  });

  it('and prefers length over loss for a long document', () => {
    expect(INGEST_SYSTEM_PROMPT).toMatch(/Length is fine; loss is not/);
  });

  it('names the target kind and system in the instruction', () => {
    const p = ingestUserPrompt('class', 'dnd5e-2024');
    expect(p).toMatch(/Transcribe the attached document as a class/);
    expect(p).toContain('D&D 5e (2024)');
  });
});

describe('normalizeIngest keeps only real fields', () => {
  it('drops keys that are not fields of this kind', () => {
    // The builder spreads this into form state, so a stray key becomes a stray key in the saved payload.
    const r = normalizeIngest('feat', { description: 'body', notAField: 'x', payload: { evil: true } });
    expect(r.values).toEqual({ description: 'body' });
  });

  it('drops fields ingest is not allowed to fill even when they exist', () => {
    const r = normalizeIngest('creature', { statblock: { ac: 17 }, creatureType: 'undead' });
    expect(r.values).toEqual({ creatureType: 'undead' });
  });

  it('coerces tags from a string or an array', () => {
    expect(normalizeIngest('feat', { tags: 'a, b , c' }).values.tags).toEqual(['a', 'b', 'c']);
    expect(normalizeIngest('feat', { tags: ['x', '', 'y'] }).values.tags).toEqual(['x', 'y']);
  });

  it('drops a non-numeric number and an empty string', () => {
    expect(normalizeIngest('spell', { level: 'three' }).values.level).toBeUndefined();
    expect(normalizeIngest('feat', { description: '   ' }).values.description).toBeUndefined();
  });

  it('carries a warning through', () => {
    expect(normalizeIngest('feat', { description: 'x', warning: 'This looked like a spell.' }).warning)
      .toBe('This looked like a spell.');
  });

  it('survives junk', () => {
    expect(normalizeIngest('feat', null).values).toEqual({});
    expect(normalizeIngest('feat', 'nope').values).toEqual({});
  });
});

describe('mergeIngest can add but never overwrite', () => {
  it('fills empty fields', () => {
    const { values, filled } = mergeIngest({ name: '' }, { name: 'Iron Jaw', summary: 'A brawler.' });
    expect(values).toEqual({ name: 'Iron Jaw', summary: 'A brawler.' });
    expect(filled.sort()).toEqual(['name', 'summary']);
  });

  it('LEAVES what the author already wrote', () => {
    // This is what makes it safe to press twice, and safe to press after typing.
    const { values, filled } = mergeIngest({ name: 'Mine' }, { name: 'Theirs' });
    expect(values.name).toBe('Mine');
    expect(filled).toEqual([]);
  });

  it('treats an empty array as empty', () => {
    const { filled } = mergeIngest({ tags: [] }, { tags: ['a'] });
    expect(filled).toEqual(['tags']);
  });

  it('and reports exactly what it touched, so nobody diffs a form by eye', () => {
    const { filled } = mergeIngest({ name: 'Mine', summary: '' }, { name: 'X', summary: 'Y' });
    expect(filled).toEqual(['summary']);
  });
});

describe('the route', () => {
  it('sends PDFs and images as native blocks, not extracted text', () => {
    // A class PDF's layout carries meaning — a level table is a table — and OCR-to-plaintext is exactly
    // where a twenty-level ladder turns to mush.
    expect(route).toMatch(/type: 'document' as const/);
    expect(route).toMatch(/type: 'image' as const/);
  });

  it('runs near-zero temperature, because this is transcription', () => {
    expect(Number(/temperature: ([\d.]+)/.exec(route)?.[1])).toBeLessThanOrEqual(0.2);
  });

  it('WRITES nothing — the review is that it fills the form, not the database', () => {
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
  });

  it('accepts only the types it can actually read', () => {
    expect(Object.keys(INGEST_MIME)).toContain('application/pdf');
    expect(INGEST_ACCEPT).toContain('application/pdf');
    expect(route).toContain('INGEST_MIME');
  });

  it('is rate-limited, and says something useful when it finds nothing', () => {
    expect(route).toContain("checkRateLimit('ai'");
    expect(route).toMatch(/If it is a scan/);
  });
});

describe('the builder', () => {
  it('offers the upload and reports what was filled', () => {
    expect(builder).toContain('INGEST_ACCEPT');
    expect(builder).toContain('mergeIngest');
    expect(builder).toMatch(/nothing is saved yet/);
  });

  it('and hides it when AI is unconfigured, like every other assist', () => {
    expect(builder).toMatch(/\{aiConfigured && \(/);
  });
});
