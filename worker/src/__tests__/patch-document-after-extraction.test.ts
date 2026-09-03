import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { patchDocument } from '../research/file-document.js';

// ── FILING HAPPENS BEFORE ANYTHING READS THE DOCUMENT ───────────────────────────────────────────
//
// Documents are filed the moment they are found — deliberate, and what the owner asked for. But the
// row is written BEFORE the document has been read, and nothing patched it afterwards, so
// everything learned later had nowhere to go: OCR text, extraction method, readability, confidence.
//
// The platform audit of 2026-09-03 called this "the single largest gap between what the machine does
// and what the database knows". The live numbers agree: 610 rows carry text, 315 carry a method —
// 295 rows of text with no recorded origin.
//
// The id was discarded at TWO layers. `resilientInsertDocument` returned `{ error }` while holding a
// `FileOutcome` with an id; `fileGenericDocumentNow` returned `void`. Neither could have patched
// anything, because neither knew what it had written.

const fakeDb = () => {
  const writes: Array<{ id: string; fields: Record<string, unknown> }> = [];
  return {
    writes,
    db: {
      from: () => ({
        update: (fields: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => { writes.push({ id, fields }); return { error: null }; },
        }),
      }),
    },
  };
};

describe('patchDocument', () => {
  it('writes the fields it was given', async () => {
    const { db, writes } = fakeDb();
    const r = await patchDocument(db as never, 'row-1', {
      extracted_text: 'THE STATE OF TEXAS',
      extracted_text_method: 'ai-vision',
      processing_status: 'analyzed',
    });
    expect(r.patched).toBe(true);
    expect(writes[0].id).toBe('row-1');
    expect(writes[0].fields.extracted_text).toBe('THE STATE OF TEXAS');
    expect(writes[0].fields.updated_at).toBeTypeOf('string');
  });

  it('REFUSES text without a method', async () => {
    // `extracted_text` has held raw OCR, an AI summary, a legal description and a JSON blob at
    // different times, all rendered identically as "Extracted Text", with no way to tell which. A
    // method is one string and it makes the column mean something.
    const { db, writes } = fakeDb();
    const r = await patchDocument(db as never, 'row-1', { extracted_text: 'x' });
    expect(r.patched).toBe(false);
    expect(r.error).toMatch(/without extracted_text_method/);
    expect(writes.length, 'it wrote anyway').toBe(0);
  });

  it('CONTROL: a patch with no text needs no method', async () => {
    // Without this, "always refuse" would satisfy the assertion above.
    const { db } = fakeDb();
    const r = await patchDocument(db as never, 'row-1', { readability: 'good' });
    expect(r.patched).toBe(true);
  });

  it('refuses an empty patch and a missing id rather than writing nothing loudly', async () => {
    const { db } = fakeDb();
    expect((await patchDocument(db as never, 'row-1', {})).patched).toBe(false);
    expect((await patchDocument(db as never, '', { readability: 'good' })).patched).toBe(false);
  });

  it('never throws — it reports', async () => {
    const boom = { from: () => ({ update: () => ({ eq: async () => { throw new Error('conn reset'); } }) }) };
    const r = await patchDocument(boom as never, 'row-1', { readability: 'good' });
    expect(r.patched).toBe(false);
    expect(r.error).toBe('conn reset');
  });
});

describe('the id survives filing — assert the CALLERS', () => {
  const ROOT = path.join(__dirname, '..');
  const code = (p: string) => {
    const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
    if (!/\b(import|export|function|const)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
    return s;
  };

  it('resilientInsertDocument returns the id it wrote', () => {
    const src = code('services/artifact-uploader.ts');
    expect(src).toMatch(/Promise<\{ error: string \| null; id: string \| null/);
    expect(src, 'a bare { error: null } return is back — the id is discarded again')
      .not.toMatch(/return \{ error: null \};/);
  });

  it('fileGenericDocumentNow returns it too, and hangs it on the document', () => {
    const src = code('research/file-generic-document.ts');
    expect(src).toMatch(/\): Promise<string \| null> \{/);
    expect(src).toContain('doc.documentRowId = id');
  });

  it('Stage 3 patches the rows it just extracted from', () => {
    const src = code('services/pipeline.ts');
    expect(src).toContain('patchDocument(db as never, d.documentRowId');
    expect(src).toContain("extracted_text_method: 'ai-vision'");
  });

  it('and it skips documents with no row or no text, rather than writing nulls', () => {
    const src = code('services/pipeline.ts');
    expect(src).toContain('if (!d.documentRowId || !d.ocrText) continue');
  });

  it('reports how many landed, so a silent failure is visible', () => {
    expect(code('services/pipeline.ts')).toContain('could not be patched');
  });
});
