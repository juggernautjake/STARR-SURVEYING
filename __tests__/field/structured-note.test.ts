// C44z — reading a field note's structured payload.
//
// ── THE BUG THE MIGRATION CREATED ───────────────────────────────────────────────────────────────
//
// Seed 594 adds `fieldbook_notes.structured_data` as JSONB, so PostgREST returns it already parsed.
// Both routes that read it were written as:
//
//     try { JSON.parse(n.structured_data) } catch { /* malformed JSON — body still renders */ }
//
// `JSON.parse` stringifies its argument first, so an OBJECT becomes the literal "[object Object]"
// and throws — on every row. The catch swallows it, the payload comes back null, and every
// structured note in the product renders as free text with its structured table missing.
//
// Worth pinning rather than trusting to review, because the failure is invisible in exactly the way
// this document keeps finding: nothing throws, nothing logs, and the screen shows a note. It is
// indistinguishable from nobody having filed a structured note yet — and it would have appeared on
// the day the migration landed, not the day the code was written.

import { describe, it, expect } from 'vitest';
import { parseStructuredNote } from '@/lib/field/structured-note';

describe('the JSONB case — what PostgREST actually returns', () => {
  it('passes an already-parsed object straight through', () => {
    const payload = { monument_type: 'rebar', cap_stamp: 'RPLS 1234', depth_in: 18 };
    expect(parseStructuredNote(payload)).toEqual(payload);
  });

  it('does not stringify it first, which is the whole bug', () => {
    // The regression, stated as the thing that must not happen: the old code produced null here.
    expect(parseStructuredNote({ hazard: 'dog' })).not.toBeNull();
  });
});

describe('the legacy string case', () => {
  it('parses a payload that was stored as text', () => {
    // The mobile app's local SQLite mirror has no JSON type and encodes the payload as a string
    // before syncing, so a row arriving mid-migration can legitimately be either shape.
    expect(parseStructuredNote('{"offset_ft":2.5,"direction":"N"}')).toEqual({
      offset_ft: 2.5,
      direction: 'N',
    });
  });

  it('returns null for malformed JSON rather than throwing', () => {
    // A note whose structure cannot be read is far better shown as its own free text than as an
    // error — the text is what the surveyor typed and is the part that reaches a deliverable.
    expect(parseStructuredNote('{"unterminated": ')).toBeNull();
  });
});

describe('shapes that are not a payload', () => {
  it.each([null, undefined, ''])('%s is no payload, not an empty one', (raw) => {
    expect(parseStructuredNote(raw)).toBeNull();
  });

  it('rejects an array in either form', () => {
    // Arrays are objects too. Returning one would hand the renderer numeric keys and print a
    // "structured" table of 0, 1, 2 — which looks like data rather than like a writer sending the
    // wrong shape.
    expect(parseStructuredNote([1, 2, 3] as unknown as Record<string, unknown>)).toBeNull();
    expect(parseStructuredNote('[1,2,3]')).toBeNull();
  });

  it('rejects a bare JSON scalar', () => {
    expect(parseStructuredNote('42')).toBeNull();
    expect(parseStructuredNote('"just a string"')).toBeNull();
  });
});

describe('both routes read it through this one function', () => {
  it('neither route still parses structured_data itself', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const p of [
      'app/api/admin/jobs/[id]/field-data/route.ts',
      'app/api/admin/field-data/[id]/route.ts',
    ]) {
      const code = strip(readFileSync(join(process.cwd(), p), 'utf8'));
      expect(code, `${p} should call the shared helper`).toContain('parseStructuredNote(');
      // Two copies of this were wrong in the same way; one copy is why they can be fixed once.
      expect(code, `${p} should not parse structured_data inline`).not.toMatch(
        /JSON\.parse\(\s*n\.structured_data/,
      );
    }
  });

  it('neither route asks fieldbook_notes for a column called body', () => {
    // `body` is the mobile app's local SQLite column. Asking PostgREST for it fails the whole
    // select, which is how a job with notes reported having none.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const p of [
      'app/api/admin/jobs/[id]/field-data/route.ts',
      'app/api/admin/field-data/[id]/route.ts',
    ]) {
      const code = strip(readFileSync(join(process.cwd(), p), 'utf8'));
      expect(code, `${p} selects the wrong column`).not.toMatch(/'id, body,/);
      expect(code).toMatch(/'id, content, note_template/);
    }
  });
});
